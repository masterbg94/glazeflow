import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { notify } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';

// Payment status is set by main company admin/superadmin only (bank payment received).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;

  if (!['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(user.platformRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { paymentStatus } = await req.json();
  if (!['UNPAID', 'INVOICED', 'PAID'].includes(paymentStatus)) {
    return NextResponse.json({ error: 'Invalid paymentStatus' }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.platformRole !== 'SUPER_ADMIN' && order.companyId !== user.companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { paymentStatus },
  });

  // Notify tenant org members
  const members = await prisma.user.findMany({ where: { customerOrgId: order.customerOrgId } });
  for (const m of members) {
    await notify({
      userId: m.id,
      event: 'ORDER_STATUS_CHANGED',
      title: `Plaćanje ${order.orderNumber}: ${paymentStatus}`,
      body: `Status plaćanja promenjen na ${paymentStatus}.`,
      orderId: order.id,
      email: false,
    });
  }

  return NextResponse.json({ order: updated });
}
