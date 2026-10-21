import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/rbac';
import type { OrderStatus } from '@/lib/status-transitions';
import { getTenantBySlug } from '@/lib/tenant';

const DUE_STATUSES: OrderStatus[] = ['DELIVERED', 'CLOSED'];

export default async function FinancePage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const user = await getSessionUser();

  // Tenant admin only — managers do not see finance
  if (!user) redirect('/login');
  if (user.customerOrgRole !== 'TENANT_ADMIN' || user.customerOrgId !== tenant.id) {
    redirect(`/${tenantSlug}/my-orders`);
  }

  const orders = await prisma.order.findMany({
    where: { customerOrgId: tenant.id },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const payable = orders.filter(
    (o) => DUE_STATUSES.includes(o.status as OrderStatus) && o.paymentStatus !== 'PAID'
  );
  const payableSum = payable.reduce((sum, o) => sum + Number(o.total), 0);
  const totalSpent = orders.reduce((sum, o) => sum + Number(o.total), 0);
  const paidSum = orders
    .filter((o) => o.paymentStatus === 'PAID')
    .reduce((sum, o) => sum + Number(o.total), 0);

  const currency = orders[0]?.currency ?? 'RSD';
  const fmt = (n: number) => `${n.toLocaleString('sr-RS')} ${currency}`;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Finansije — {tenant.name}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-500">Za plaćanje (isporučeno, neplaćeno)</p>
          <p className="mt-2 text-3xl font-bold text-red-600">{fmt(payableSum)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-500">Ukupno naručeno</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{fmt(totalSpent)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-500">Plaćeno</p>
          <p className="mt-2 text-3xl font-bold text-green-600">{fmt(paidSum)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Dospele narudžbine</h2>
          <p className="text-xs text-slate-500">
            Narudžbine u statusu DELIVERED/CLOSED koje nisu plaćene.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left">
            <tr>
              <th className="p-4">Narudžbina</th>
              <th className="p-4">Datum</th>
              <th className="p-4">Status</th>
              <th className="p-4">Plaćanje</th>
              <th className="p-4 text-right">Iznos</th>
            </tr>
          </thead>
          <tbody>
            {payable.map((o) => (
              <tr key={o.id} className="border-b border-slate-100">
                <td className="p-4 font-medium">{o.orderNumber}</td>
                <td className="p-4">{new Date(o.createdAt).toLocaleDateString('sr-RS')}</td>
                <td className="p-4">{o.status}</td>
                <td className="p-4">{o.paymentStatus}</td>
                <td className="p-4 text-right font-semibold">{fmt(Number(o.total))}</td>
              </tr>
            ))}
            {payable.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  Nema neplaćenih dospele narudžbina.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
