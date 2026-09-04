import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { notify } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { publishToUsers } from '@/lib/realtime';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;

  if (
    !['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(user.platformRole) &&
    user.companyRole !== 'COMPANY_ADMIN'
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { action, note } = await req.json(); // action: 'approve' | 'reject'

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

  if (transition.order.companyId !== user.companyId && user.platformRole !== 'SUPER_ADMIN') {
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

    const members = await prisma.user.findMany({
      where: { customerOrgId: transition.order.customerOrgId },
    });
    const staff = await prisma.user.findMany({
      where: {
        companyId: transition.order.companyId,
        OR: [
          { platformRole: { in: ['COMPANY_ADMIN', 'COMPANY_STAFF'] } },
          { companyRole: { in: ['COMPANY_PRODUCTION', 'COMPANY_SALES', 'PRODUCTION_WORKER'] } },
        ],
      },
    });

    const recipientIds = [
      ...new Set([...members, ...staff].map((u) => u.id).filter((uid) => uid !== user.id)),
    ];
    publishToUsers(recipientIds, 'order:update', {
      orderId: transition.orderId,
      order: updatedOrder,
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
    for (const m of members) {
      await notify({
        userId: m.id,
        event: 'ORDER_STATUS_CHANGED',
        title: `Order ${transition.order.orderNumber}: ${transition.toStatus}`,
        body: `Status updated to ${transition.toStatus}.`,
        orderId: transition.orderId,
        email: true,
      });
    }

    return NextResponse.json({ order: updatedOrder });
  }

  if (action === 'reject') {
    await prisma.orderStatusTransition.update({
      where: { id },
      data: { status: 'REJECTED', approvedBy: user.id, approvedAt: new Date() },
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

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
