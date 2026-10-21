import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { notify, notifyMany } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { publishToUsers } from '@/lib/realtime';
import {
  effectiveUserRole,
  getTransitionRule,
  isOrderStatus,
  type OrderStatus,
} from '@/lib/status-transitions';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user;

  // The two role dimensions answer different questions. Keep them apart:
  // `platformRole` is the access level, `companyRole` is the job.
  const platformRole = user.platformRole;
  const userRole = effectiveUserRole(platformRole, user.companyRole);

  const { status: newStatus, note, reason } = await req.json();
  if (!isOrderStatus(newStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id }, include: { customerOrg: true } });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Tenant users: only their own orders. A tenant user's `companyId` points at
  // the main company, so the comparison must be on `customerOrgId`.
  if (platformRole === 'CUSTOMER') {
    if (!user.customerOrgId || order.customerOrgId !== user.customerOrgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } else if (platformRole !== 'SUPER_ADMIN' && order.companyId !== user.companyId) {
    // Main company staff must belong to the order's company; superadmin bypasses
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rule = getTransitionRule(userRole, order.status as OrderStatus, newStatus, platformRole);

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
        toStatus: newStatus,
        reason: reason || note,
        status: 'PENDING',
      },
    });

    // Notify approvers — always main company (order.companyId), never tenant.
    let approvers;
    if (platformRole === 'CUSTOMER') {
      approvers = await prisma.user.findMany({
        where: {
          companyId: order.companyId,
          platformRole: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] },
        },
      });
    } else {
      approvers = await prisma.user.findMany({
        where: {
          companyId: order.companyId,
          companyRole: { in: rule.approverRoles },
        },
      });
      if (approvers.length === 0) {
        approvers = await prisma.user.findMany({
          where: { companyId: order.companyId, platformRole: 'COMPANY_ADMIN' },
        });
      }
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
        { companyRole: { in: ['COMPANY_PRODUCTION', 'COMPANY_SALES'] } },
      ],
    },
  });

  const recipientIds = [
    ...new Set([...members, ...staff].map((u) => u.id).filter((uid) => uid !== user.id)),
  ];
  publishToUsers(recipientIds, 'order:update', {
    orderId: order.id,
    order: {
      id: updated.id,
      status: updated.status,
      orderNumber: updated.orderNumber,
      customerNotes: updated.customerNotes,
      shippingAddress: updated.shippingAddress,
    },
  });

  await notifyMany({
    userIds: members.map((m) => m.id),
    event: newStatus === 'CONFIRMED' ? 'ORDER_CONFIRMED' : 'ORDER_STATUS_CHANGED',
    title: `Order ${order.orderNumber}: ${newStatus}`,
    body: note || `Status updated to ${newStatus}.`,
    orderId: order.id,
    email: true,
  });

  if (newStatus === 'READY') {
    await notifyMany({
      userIds: staff.map((s) => s.id).filter((uid) => uid !== user.id),
      event: 'ORDER_READY',
      title: `Order ${order.orderNumber} is ready`,
      body: `Status updated to ${newStatus}.`,
      orderId: order.id,
      email: false,
    });
  }

  return NextResponse.json({ order: updated, requiresApproval: false });
}
