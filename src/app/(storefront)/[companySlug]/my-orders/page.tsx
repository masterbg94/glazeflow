import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTenantBySlug } from '@/lib/tenant';

export default async function MyOrders({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const session = await getSession();
  const user = session?.user as any;
  if (!user?.customerOrgId) return <p>Molimo prijavite se da biste videli narudžbine.</p>;
  if (user.customerOrgId !== tenant.id) redirect(`/${user.customerOrgSlug ?? ''}`);

  // Whole tenant org sees shared orders (admin and manager both track orders)
  const orders = await prisma.order.findMany({
    where: { customerOrgId: user.customerOrgId },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Moje narudžbine</h1>
      {orders.length === 0 && <p className="text-slate-500">Još nemate narudžbina.</p>}
      <div className="space-y-4">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/${tenantSlug}/my-orders/${o.id}`}
            className="block rounded-xl border border-slate-200 bg-white p-5 hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{o.orderNumber}</p>
                <p className="text-xs text-slate-500">
                  {new Date(o.createdAt).toLocaleDateString('sr-RS')}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-blue-600">
                  {o.total.toString()} {o.currency}
                </p>
                <p className="text-xs text-slate-500">
                  {o.status}
                  {o.paymentStatus !== 'UNPAID' && ` · ${o.paymentStatus}`}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
