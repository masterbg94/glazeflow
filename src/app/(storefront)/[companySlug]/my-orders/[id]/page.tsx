import { notFound } from 'next/navigation';
import { OrderMessages } from '@/components/dashboard/OrderMessages';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function OrderDetail({
  params,
}: {
  params: Promise<{ id: string; companySlug: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return <p>Please login.</p>;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          glassPanes: { include: { glassType: true } },
          hardware: { include: { hardware: true } },
          profile: true,
          template: true,
        },
      },
      statusHistory: true,
    },
  });
  if (!order || order.createdById !== (session.user as any).id) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
          <p className="text-sm text-slate-500">
            Ordered {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          {order.status}
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left">
            <tr>
              <th className="p-4">Item</th>
              <th className="p-4">Dimensions</th>
              <th className="p-4">Qty</th>
              <th className="p-4 text-right">Unit</th>
              <th className="p-4 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="p-4">
                  <p className="font-medium">{item.template?.name ?? item.productKind}</p>
                  {item.profile && (
                    <p className="text-xs text-slate-500">
                      {item.profile.brand} {item.profile.systemName} {item.profileColor}
                    </p>
                  )}
                  {item.glassPanes.map((p) => (
                    <p key={p.id} className="text-xs text-slate-400">
                      {p.glassType.name} {p.thicknessMm}mm
                    </p>
                  ))}
                </td>
                <td className="p-4">
                  {item.widthMm}×{item.heightMm ?? '—'}mm
                </td>
                <td className="p-4">{item.quantity}</td>
                <td className="p-4 text-right">{item.unitPrice.toString()}</td>
                <td className="p-4 text-right">{item.lineTotal.toString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200">
              <td colSpan={4} className="p-4 text-right font-medium">
                Total
              </td>
              <td className="p-4 text-right font-bold">
                {order.total} {order.currency}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 font-semibold">Status Timeline</h2>
        <div className="space-y-3">
          {order.statusHistory.map((h) => (
            <div key={h.id} className="flex gap-3 text-sm">
              <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
              <div>
                <p className="font-medium">{h.toStatus}</p>
                <p className="text-xs text-slate-400">{new Date(h.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <OrderMessages orderId={order.id} />
    </div>
  );
}
