"use client";
import { useState } from "react";
import Link from "next/link";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  currency: string;
  customerOrg: { name: string };
  items: any[];
  customerNotes?: string | null;
  shippingAddress?: string | null;
  requestedDate?: string | null;
}

const COLUMNS = ["NEW", "QUOTE_AMENDMENT", "CONFIRMED", "IN_PRODUCTION", "READY", "DELIVERED", "CLOSED", "CANCELLED"];

export function OrderKanban({ orders }: { orders: Order[] }) {
  const [updating, setUpdating] = useState<string | null>(null);

  async function updateStatus(orderId: string, status: string) {
    setUpdating(orderId);
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) window.location.reload();
    setUpdating(null);
  }

  return (
    <div className="h-full overflow-x-auto">
      <div className="flex h-full min-w-max gap-4">
        {COLUMNS.map((col) => {
          const filtered = orders.filter((o) => o.status === col);
          return (
            <div key={col} className="flex w-72 flex-col rounded-xl bg-slate-100 p-3">
              <h3 className="mb-3 shrink-0 px-1 text-sm font-semibold text-slate-700">
                {col.replace(/_/g, " ")} ({filtered.length})
              </h3>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                {filtered.map((o) => (
                  <div key={o.id} className="rounded-lg bg-white p-4 shadow-sm">
                    <Link href={`/dashboard/orders/${o.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                      {o.orderNumber}
                    </Link>
                    <p className="text-xs text-slate-500">{o.customerOrg.name}</p>
                    <p className="mt-1 text-sm font-semibold">{o.total} {o.currency}</p>
                    {o.customerNotes && (
                      <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-slate-700">
                        {o.customerNotes}
                      </p>
                    )}
                    {o.shippingAddress && (
                      <p className="mt-1 text-xs text-slate-500">Ship: {o.shippingAddress}</p>
                    )}
                    {o.requestedDate && (
                      <p className="mt-1 text-xs text-slate-500">
                        Requested: {new Date(o.requestedDate).toLocaleDateString('en-US')}
                      </p>
                    )}
                    <select
                      className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                      value={col}
                      onChange={(e) => updateStatus(o.id, e.target.value)}
                      disabled={updating === o.id}
                    >
                      {COLUMNS.map((c) => (
                        <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
                    Empty
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
