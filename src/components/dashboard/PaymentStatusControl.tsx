'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const PAYMENT_STATUSES = ['UNPAID', 'INVOICED', 'PAID'] as const;
const LABELS: Record<(typeof PAYMENT_STATUSES)[number], string> = {
  UNPAID: 'Neplaćeno',
  INVOICED: 'Fakturisano',
  PAID: 'Plaćeno',
};

/**
 * Set the payment status of an order.
 *
 * The endpoint existed but no UI called it, so the tenant finance page could
 * only ever show every order as unpaid — the "payable" figure never changed.
 */
export function PaymentStatusControl({
  orderId,
  current,
  canEdit,
}: {
  orderId: string;
  current: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-700">Plaćanje</p>
        <p className="mt-1 text-sm text-slate-500">{LABELS[current as 'PAID'] ?? current}</p>
      </div>
    );
  }

  async function setStatus(status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentStatus: status }),
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
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-700">Plaćanje</p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <select
        className="input mt-2"
        value={current}
        disabled={busy}
        onChange={(e) => setStatus(e.target.value)}
      >
        {PAYMENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
