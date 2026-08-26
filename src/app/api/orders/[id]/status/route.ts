import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { notify } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  if (!['COMPANY_ADMIN', 'COMPANY_STAFF'].includes(user.platformRole))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { status, note } = await req.json();
  const order = await prisma.order.findUnique({ where: { id }, include: { customerOrg: true } });
  if (!order || order.companyId !== user.companyId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.order.update({
    where: { id },
    data: {
      status,
      confirmedAt: status === 'CONFIRMED' ? new Date() : order.confirmedAt,
      closedAt: status === 'CLOSED' ? new Date() : order.closedAt,
      statusHistory: {
        create: { fromStatus: order.status, toStatus: status, note, changedBy: user.id },
      },
    },
  });

  const members = await prisma.user.findMany({ where: { customerOrgId: order.customerOrgId } });
  for (const m of members) {
    await notify({
      userId: m.id,
      event: 'ORDER_STATUS_CHANGED',
      title: `Order ${order.orderNumber}: ${status}`,
      body: note || `Status updated to ${status}.`,
      orderId: order.id,
      email: true,
    });
  }

  return NextResponse.json({ order: updated });
}
