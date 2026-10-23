import { NextRequest, NextResponse } from 'next/server';
import { auditFromSession } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { getSessionUser } from '@/lib/rbac';

/**
 * Per-line acceptance.
 *
 * `OrderItem.status` is `PENDING` / `ACCEPTED` / `REJECTED`, but nothing ever
 * moved it off `PENDING`. A tenant could not accept or reject a single line,
 * which the product documents list as an action.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, companyId: true, customerOrgId: true, status: true },
  });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isTenant = user.platformRole === 'CUSTOMER' || !!user.customerOrgId;
  if (isTenant) {
    // A tenant may only act on lines of its own orders.
    if (!user.customerOrgId || order.customerOrgId !== user.customerOrgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } else if (user.platformRole !== 'SUPER_ADMIN' && order.companyId !== user.companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const status = body.status;
  if (status !== 'ACCEPTED' && status !== 'REJECTED' && status !== 'PENDING') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  // The line must belong to the order.
  const item = await prisma.orderItem.findFirst({
    where: { id: itemId, orderId: order.id },
    select: { id: true },
  });
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  // A tenant may only accept or reject while the order is still open.
  if (isTenant && !['NEW', 'QUOTE_AMENDMENT'].includes(order.status)) {
    return NextResponse.json({ error: 'The order can no longer be changed' }, { status: 409 });
  }

  const updated = await prisma.orderItem.update({
    where: { id: item.id },
    data: { status },
    select: { id: true, status: true },
  });

  await auditFromSession(user, {
    action: 'orderitem.status.change',
    entity: 'OrderItem',
    entityId: item.id,
    ip: getClientIp(req.headers),
    metadata: { orderId: order.id, status },
  });

  return NextResponse.json({ item: updated });
}
