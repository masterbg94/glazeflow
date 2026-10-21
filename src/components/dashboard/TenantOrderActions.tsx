'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Tenant-side actions on an order: cancel a `NEW` order, and accept or reject
 * individual lines.
 *
 * The transition rules always allowed a tenant to cancel its own `NEW` order,
 * but there was no button for it. `OrderItem.status` likewise never left
 * `PENDING` because nothing could set it.
 */
export function TenantOrderActions({
  orderId,
  status,
  items,
  canCancel,
}: {
  orderId: string;
  status: string;
  items: { id: string; status: string }[];
  canCancel: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setOrderStatus(next: string) {
    setBusy(next);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Greška');
        return;
      }
      router.refresh();
    } catch {
      setError('Greška');
    } finally {
      setBusy(null);
    }
  }

  async function setItemStatus(itemId: string, next: string) {
    setBusy(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Greška');
        return;
      }
      router.refresh();
    } catch {
      setError('Greška');
    } finally {
      setBusy(null);
    }
  }

  const canEditItems = ['NEW', 'QUOTE_AMENDMENT'].includes(status);

  if (!canCancel && !canEditItems) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-3 font-semibold">Akcije</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {canCancel && (
        <button
          onClick={() => setOrderStatus('CANCELLED')}
          disabled={busy === 'CANCELLED'}
          className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          Otkaži narudžbinu
        </button>
      )}
      {canEditItems && items.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">Prihvati ili odbij stavke:</p>
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">Stavka {item.id.slice(-6)}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase text-slate-500">{item.status}</span>
                <button
                  onClick={() => setItemStatus(item.id, 'ACCEPTED')}
                  disabled={busy === item.id}
                  className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  Prihvati
                </button>
                <button
                  onClick={() => setItemStatus(item.id, 'REJECTED')}
                  disabled={busy === item.id}
                  className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Odbij
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
