import { redirect } from 'next/navigation';
import { StatCard } from '@/components/dashboard/StatCard';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function DashboardHome() {
  const session = await getSession();
  const companyId = (session?.user as any).companyId;
  if (!companyId) redirect('/admin');

  const [orders, totalOrders, newOrders, totalRevenue] = await Promise.all([
    prisma.order.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customerOrg: true },
    }),
    prisma.order.count({ where: { companyId } }),
    prisma.order.count({ where: { companyId, status: 'NEW' } }),
    prisma.order.aggregate({ where: { companyId }, _sum: { total: true } }),
  ]);

  const serializedOrders = orders.map(o => ({
    ...o,
    subtotal: o.subtotal.toString(),
    taxAmount: o.taxAmount.toString(),
    discountAmount: o.discountAmount.toString(),
    total: o.total.toString(),
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Ukupno narudžbina" value={totalOrders} />
        <StatCard label="Nove narudžbine" value={newOrders} />
        <StatCard label="Prihod" value={totalRevenue._sum.total?.toString() ?? '0'} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 p-4 font-semibold">Nedavne narudžbine</h2>
        <div className="divide-y divide-slate-100">
          {serializedOrders.map((o) => (
            <div key={o.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-slate-900">{o.orderNumber}</p>
                <p className="text-xs text-slate-500">{o.customerOrg.name}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">
                  {o.total} {o.currency}
                </p>
                <p className="text-xs text-slate-500">{o.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
