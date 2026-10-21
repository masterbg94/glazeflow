'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useNotifications } from '@/components/notifications/NotificationProvider';
import {
  getAllowedNextStatuses,
  type OrderStatus,
  type PlatformRole,
  type UserRole,
} from '@/lib/status-transitions';

export interface KanbanOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  currency: string;
  customerOrg: { name: string };
  items: unknown[];
  customerNotes?: string | null;
  shippingAddress?: string | null;
  /** Serialized by the server component: a `Date` on the server, an ISO string over the wire. */
  requestedDate?: string | Date | null;
}

const COLUMNS = [
  'NEW',
  'QUOTE_AMENDMENT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'DELIVERED',
  'CLOSED',
  'CANCELLED',
] as const;

type ColumnStatus = (typeof COLUMNS)[number];

const COLUMN_LABELS: Record<ColumnStatus, string> = {
  NEW: 'Nova',
  QUOTE_AMENDMENT: 'Izmena ponude',
  CONFIRMED: 'Potvrđena',
  IN_PRODUCTION: 'U proizvodnji',
  READY: 'Spremna',
  DELIVERED: 'Isporučena',
  CLOSED: 'Zatvorena',
  CANCELLED: 'Otkazana',
};

interface OrderKanbanProps {
  orders: KanbanOrder[];
  userRole: UserRole;
  platformRole: PlatformRole;
}

export function OrderKanban({ orders, userRole, platformRole }: OrderKanbanProps) {
  const { subscribeRealtime } = useNotifications();
  const [board, setBoard] = useState<KanbanOrder[]>(orders);
  const [updating, setUpdating] = useState<string | null>(null);

  // Stay in sync when the order list changes server-side (e.g. after navigation).
  useEffect(() => {
    setBoard(orders);
  }, [orders]);

  // Live status changes from other users arrive over SSE — move the card, no reload.
  useEffect(() => {
    const unsub = subscribeRealtime((e) => {
      if (e.event !== 'order:update') return;
      const updated = e.payload.order;
      setBoard((prev) =>
        prev.map((o) =>
          o.id === updated.id
            ? {
                ...o,
                status: updated.status,
                customerNotes: updated.customerNotes ?? o.customerNotes,
                shippingAddress: updated.shippingAddress ?? o.shippingAddress,
              }
            : o
        )
      );
    });
    return unsub;
  }, [subscribeRealtime]);

  async function updateStatus(orderId: string, status: string) {
    setUpdating(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setBoard((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: data.order?.status ?? status } : o))
        );
      }
    } finally {
      setUpdating(null);
    }
  }

  // The transition matrix lives in `src/lib/status-transitions.ts` and is
  // shared with the server. It used to be copied here, and the copy had
  // already drifted: it hid the cancel option for production and sales users
  // while the API accepted it.
  const allowedTransitions = useMemo(() => {
    const map: Record<string, OrderStatus[]> = {};
    for (const col of COLUMNS) {
      map[col] = getAllowedNextStatuses(userRole, col, platformRole);
    }
    return map;
  }, [userRole, platformRole]);

  return (
    <div className="h-full overflow-x-auto">
      <div className="flex h-full min-w-max gap-4">
        {COLUMNS.map((col) => {
          const filtered = board.filter((o) => o.status === col);
          const allowedNext = allowedTransitions[col] || [];
          return (
            <div key={col} className="flex w-72 flex-col rounded-xl bg-slate-100 p-3">
              <h3 className="mb-3 shrink-0 px-1 text-sm font-semibold text-slate-700">
                {COLUMN_LABELS[col] || col.replace(/_/g, ' ')} ({filtered.length})
              </h3>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                {filtered.map((o) => (
                  <div key={o.id} className="rounded-lg bg-white p-4 shadow-sm">
                    <Link
                      href={`/dashboard/orders/${o.id}`}
                      className="font-medium text-slate-900 hover:text-blue-600"
                    >
                      {o.orderNumber}
                    </Link>
                    <p className="text-xs text-slate-500">{o.customerOrg.name}</p>
                    <p className="mt-1 text-sm font-semibold">
                      {o.total} {o.currency}
                    </p>
                    {o.customerNotes && (
                      <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-slate-700">
                        {o.customerNotes}
                      </p>
                    )}
                    {o.shippingAddress && (
                      <p className="mt-1 text-xs text-slate-500">Isporuči: {o.shippingAddress}</p>
                    )}
                    {o.requestedDate && (
                      <p className="mt-1 text-xs text-slate-500">
                        Traženo: {new Date(o.requestedDate).toLocaleDateString('sr-RS')}
                      </p>
                    )}
                    {allowedNext.length > 0 && (
                      <select
                        className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                        value={o.status}
                        onChange={(e) => updateStatus(o.id, e.target.value)}
                        disabled={updating === o.id}
                      >
                        {allowedNext.map((c) => (
                          <option key={c} value={c}>
                            {COLUMN_LABELS[c as ColumnStatus] || c.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
                    Prazno
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
