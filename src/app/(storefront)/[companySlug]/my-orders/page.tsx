import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function MyOrders({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  const session = await getSession();
  if (!session?.user) return <p>Please login to view orders.</p>;

  const userId = (session.user as any).id;
  const orders = await prisma.order.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">My Orders</h1>
      {orders.length === 0 && <p className="text-slate-500">No orders yet.</p>}
      <div className="space-y-4">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/${companySlug}/my-orders/${o.id}`}
            className="block rounded-xl border border-slate-200 bg-white p-5 hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{o.orderNumber}</p>
                <p className="text-xs text-slate-500">
                  {new Date(o.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-blue-600">
                  {o.total} {o.currency}
                </p>
                <p className="text-xs text-slate-500">{o.status}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
