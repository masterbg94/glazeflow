import { NextRequest, NextResponse } from 'next/server';
import { auditFromSession } from '@/lib/audit';
import { getSession } from '@/lib/auth';
import { notify, notifyMany } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { publishToUsers } from '@/lib/realtime';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user;

  // Only main-company admins approve transitions. A tenant user must never be
  // able to approve anything, and a tenant's `companyRole` must not be enough.
  const isMainCompanyAdmin =
    user.platformRole === 'SUPER_ADMIN' ||
    (user.platformRole === 'COMPANY_ADMIN' && user.companyRole === 'COMPANY_ADMIN');
  if (!isMainCompanyAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { action, note } = await req.json(); // action: 'approve' | 'reject'
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const transition = await prisma.orderStatusTransition.findUnique({
    where: { id },
    include: { order: { include: { customerOrg: true } }, requester: true },
  });

  if (!transition || transition.status !== 'PENDING') {
    return NextResponse.json(
      { error: 'Transition not found or already processed' },
      { status: 404 }
    );
  }

  // A tenant user's `companyId` is the main company and `order.companyId` is
  // also the main company, so that comparison never isolated a tenant. The
  // approver must be main-company staff: compare `companyId` and require a
  // main-company role.
  if (user.platformRole !== 'SUPER_ADMIN') {
    if (!user.companyId || transition.order.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  if (user.customerOrgId) {
    // A tenant user reached the gate through a role that should not have been
    // granted. Reject outright.
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (action === 'approve') {
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: transition.orderId },
        data: {
          status: transition.toStatus,
          confirmedAt: transition.toStatus === 'CONFIRMED' ? new Date() : undefined,
          closedAt: transition.toStatus === 'CLOSED' ? new Date() : undefined,
          statusHistory: {
            create: {
              fromStatus: transition.fromStatus,
              toStatus: transition.toStatus,
              note: note || `Approved by ${user.name}: ${transition.reason}`,
              changedBy: user.id,
            },
          },
        },
        include: { customerOrg: true },
      });

      await tx.orderStatusTransition.update({
        where: { id },
        data: { status: 'APPROVED', approvedBy: user.id, approvedAt: new Date() },
      });

      return updated;
    });

    await auditFromSession(user, {
      action: 'order.transition.approve',
      entity: 'OrderStatusTransition',
      entityId: transition.id,
      ip: getClientIp(req.headers),
      metadata: {
        orderId: transition.orderId,
        from: transition.fromStatus,
        to: transition.toStatus,
        note,
      },
    });

    const members = await prisma.user.findMany({
      where: { customerOrgId: transition.order.customerOrgId },
    });
    const staff = await prisma.user.findMany({
      where: {
        companyId: transition.order.companyId,
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
      orderId: transition.orderId,
      order: {
        id: updatedOrder.id,
        status: updatedOrder.status,
        orderNumber: updatedOrder.orderNumber,
        customerNotes: updatedOrder.customerNotes,
        shippingAddress: updatedOrder.shippingAddress,
      },
    });

    // Notify requester
    await notify({
      userId: transition.requestedBy,
      event: 'ORDER_STATUS_CHANGED',
      title: `Status change approved: ${transition.order.orderNumber}`,
      body: `Your request to change status from ${transition.fromStatus} to ${transition.toStatus} was approved.`,
      orderId: transition.orderId,
      email: true,
    });

    // Notify customer org
    await notifyMany({
      userIds: members.map((m) => m.id),
      event: 'ORDER_STATUS_CHANGED',
      title: `Order ${transition.order.orderNumber}: ${transition.toStatus}`,
      body: `Status updated to ${transition.toStatus}.`,
      orderId: transition.orderId,
      email: true,
    });

    return NextResponse.json({ order: updatedOrder });
  }

  await prisma.orderStatusTransition.update({
    where: { id },
    data: { status: 'REJECTED', approvedBy: user.id, approvedAt: new Date() },
  });

  await auditFromSession(user, {
    action: 'order.transition.reject',
    entity: 'OrderStatusTransition',
    entityId: transition.id,
    ip: getClientIp(req.headers),
    metadata: {
      orderId: transition.orderId,
      from: transition.fromStatus,
      to: transition.toStatus,
      note,
    },
  });

  // Notify requester
  await notify({
    userId: transition.requestedBy,
    event: 'ORDER_STATUS_CHANGED',
    title: `Status change rejected: ${transition.order.orderNumber}`,
    body: `Your request to change status from ${transition.fromStatus} to ${transition.toStatus} was rejected. Reason: ${note || 'No reason provided'}`,
    orderId: transition.orderId,
    email: true,
  });

  return NextResponse.json({ success: true });
}
