import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { notify } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { publishToUsers } from '@/lib/realtime';
import { getTransitionRule, OrderStatus } from '@/lib/status-transitions';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  const userRole = user.companyRole || user.platformRole;
  const platformRole = user.platformRole;

  if (
    ![
      'SUPER_ADMIN',
      'COMPANY_ADMIN',
      'COMPANY_STAFF',
      'COMPANY_PRODUCTION',
      'COMPANY_SALES',
      'PRODUCTION_WORKER',
      'CUSTOMER',
    ].includes(userRole)
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { status: newStatus, note, reason } = await req.json();
  const order = await prisma.order.findUnique({ where: { id }, include: { customerOrg: true } });
  if (!order || order.companyId !== user.companyId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // CustomerOrg users can only access their own orders
  if (user.customerOrgId && order.customerOrgId !== user.customerOrgId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rule = getTransitionRule(
    userRole,
    order.status as OrderStatus,
    newStatus as OrderStatus,
    platformRole
  );

  if (!rule.allowed) {
    return NextResponse.json({ error: 'Transition not allowed for your role' }, { status: 403 });
  }

  // If approval required, create transition request
  if (rule.requiresApproval) {
    const transition = await prisma.orderStatusTransition.create({
      data: {
        orderId: id,
        requestedBy: user.id,
        fromStatus: order.status as OrderStatus,
        toStatus: newStatus as OrderStatus,
        reason: reason || note,
        status: 'PENDING',
      },
    });

    // Notify approvers
    let approvers;
    if (platformRole === 'CUSTOMER') {
      // For CustomerOrg users, approvers are platform admins
      approvers = await prisma.user.findMany({
        where: {
          companyId: user.companyId,
          platformRole: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] },
        },
      });
    } else {
      approvers = await prisma.user.findMany({
        where: {
          companyId: user.companyId,
          companyRole: { in: rule.approverRoles },
        },
      });
    }

    for (const approver of approvers) {
      await notify({
        userId: approver.id,
        event: 'ORDER_STATUS_CHANGED',
        title: `Approval needed: ${order.orderNumber}`,
        body: `${user.name} requests status change from ${order.status} to ${newStatus}. Reason: ${reason || note}`,
        orderId: order.id,
        email: true,
      });
    }

    return NextResponse.json({ transition, requiresApproval: true });
  }

  // Direct transition allowed
  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: newStatus,
      confirmedAt: newStatus === 'CONFIRMED' ? new Date() : order.confirmedAt,
      closedAt: newStatus === 'CLOSED' ? new Date() : order.closedAt,
      statusHistory: {
        create: { fromStatus: order.status, toStatus: newStatus, note, changedBy: user.id },
      },
    },
  });

  const members = await prisma.user.findMany({ where: { customerOrgId: order.customerOrgId } });
  const staff = await prisma.user.findMany({
    where: {
      companyId: order.companyId,
      OR: [
        { platformRole: { in: ['COMPANY_ADMIN', 'COMPANY_STAFF'] } },
        { companyRole: { in: ['COMPANY_PRODUCTION', 'COMPANY_SALES', 'PRODUCTION_WORKER'] } },
      ],
    },
  });

  const recipientIds = [
    ...new Set([...members, ...staff].map((u) => u.id).filter((uid) => uid !== user.id)),
  ];
  publishToUsers(recipientIds, 'order:update', { orderId: order.id, order: updated });

  for (const m of members) {
    await notify({
      userId: m.id,
      event: 'ORDER_STATUS_CHANGED',
      title: `Order ${order.orderNumber}: ${newStatus}`,
      body: note || `Status updated to ${newStatus}.`,
      orderId: order.id,
      email: true,
    });
  }

  return NextResponse.json({ order: updated, requiresApproval: false });
}
