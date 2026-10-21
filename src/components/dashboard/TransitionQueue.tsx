'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Transition {
  id: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  createdAt: string;
  requester: { id: string; name: string; platformRole: string };
  order: {
    id: string;
    orderNumber: string;
    status: string;
    customerOrg: { name: string } | null;
  };
}

/**
 * Pending status-transition requests.
 *
 * The approval chain created `OrderStatusTransition` rows but nothing could
 * list them, so a request for a backward move or a cancellation sat forever.
 * This is the queue that makes the chain usable.
 */
export function TransitionQueue() {
  const router = useRouter();
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/orders/transitions');
      if (res.ok) {
        const data = await res.json();
        setTransitions(data.transitions || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(id: string, action: 'approve' | 'reject') {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/orders/transitions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: action === 'reject' ? 'Odbijeno' : 'Odobreno' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Greška');
        return;
      }
      await load();
      router.refresh();
    } catch {
      setError('Greška');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Učitavanje zahteva…
      </div>
    );
  }

  if (transitions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-amber-900">
          Zahtevi za promenu statusa ({transitions.length})
        </h2>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="space-y-3">
        {transitions.map((t) => (
          <div key={t.id} className="rounded-lg border border-amber-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {t.order.orderNumber} · {t.order.customerOrg?.name ?? '—'}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {t.requester.name} traži {t.fromStatus} →{' '}
                  <span className="font-semibold">{t.toStatus}</span>
                </p>
                {t.reason && <p className="mt-1 text-xs italic text-slate-500">{t.reason}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => act(t.id, 'approve')}
                  disabled={busy === t.id}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Odobri
                </button>
                <button
                  onClick={() => act(t.id, 'reject')}
                  disabled={busy === t.id}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Odbij
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
