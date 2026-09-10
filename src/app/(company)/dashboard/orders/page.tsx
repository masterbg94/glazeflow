import { redirect } from 'next/navigation';
import { OrderKanban } from '@/components/dashboard/OrderKanban';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function OrdersPage() {
  const session = await getSession();
  const user = session?.user as any;
  const companyId = user?.companyId;
  if (!companyId) redirect('/admin');

  const orders = await prisma.order.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    include: { customerOrg: true, items: true },
  });

  const serializedOrders = orders.map((o) => ({
    ...o,
    subtotal: o.subtotal.toString(),
    taxAmount: o.taxAmount.toString(),
    discountAmount: o.discountAmount.toString(),
    total: o.total.toString(),
    items: o.items.map((i) => ({
      ...i,
      lengthM: i.lengthM?.toString(),
      unitPrice: i.unitPrice.toString(),
      lineTotal: i.lineTotal.toString(),
    })),
  }));

  const userRole = user?.companyRole || user?.platformRole;
  const platformRole = user?.platformRole;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Narudžbine</h1>
      <OrderKanban
        orders={serializedOrders as any}
        userRole={userRole}
        platformRole={platformRole}
      />
    </div>
  );
}
