import { redirect } from 'next/navigation';
import { OrderKanban } from '@/components/dashboard/OrderKanban';
import { TransitionQueue } from '@/components/dashboard/TransitionQueue';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/rbac';
import { effectiveUserRole } from '@/lib/status-transitions';

export default async function OrdersPage() {
  const user = await getSessionUser();
  const companyId = user?.companyId;
  if (!companyId) redirect('/admin');

  const orders = await prisma.order.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    // The Kanban renders every card, so the list is bounded rather than
    // unbounded. A pagination control belongs here next.
    take: 200,
    include: { customerOrg: true, items: true },
  });

  // Every Decimal and Date crossing into the client component is serialized
  // first. A raw Prisma Decimal is not a plain object and Next.js refuses to
  // pass it across the server/client boundary.
  const serializedOrders = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    total: o.total.toString(),
    currency: o.currency,
    customerOrg: { name: o.customerOrg.name },
    items: o.items.map((i) => ({
      id: i.id,
      productKind: i.productKind,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toString(),
      lineTotal: i.lineTotal.toString(),
    })),
    customerNotes: o.customerNotes,
    shippingAddress: o.shippingAddress,
    requestedDate: o.requestedDate ? o.requestedDate.toISOString() : null,
  }));

  // The two role dimensions stay apart: `platformRole` is the access level,
  // `companyRole` is the job. Merging them granted admin rights to staff.
  const platformRole = user?.platformRole ?? 'COMPANY_STAFF';
  const userRole = effectiveUserRole(platformRole, user?.companyRole);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Narudžbine</h1>
      <TransitionQueue />
      <OrderKanban orders={serializedOrders} userRole={userRole} platformRole={platformRole} />
    </div>
  );
}
