'use client';

import { useState } from 'react';

/**
 * Super-admin form: creates a TENANT (CustomerOrg under the main company),
 * not a Company row. The slug doubles as the tenant subdomain
 * (e.g. tenant1 → tenant1.localhost:3000). A per-tenant price list with
 * the chosen discount/markup percent is created automatically.
 */
interface CreateCompanyFormProps {
  onSuccess?: () => void;
}

export function CreateCompanyForm({ onSuccess }: CreateCompanyFormProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [taxId, setTaxId] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          taxId: taxId || undefined,
          shippingAddress: shippingAddress || undefined,
          discountPercent: discount,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Neuspešno (${res.status})`);
        return;
      }
      const data = await res.json();
      setSuccess(`Kreiran tenant "${data.tenant.name}" (slug: ${data.tenant.slug})`);
      setName('');
      setSlug('');
      setTaxId('');
      setShippingAddress('');
      setDiscount(0);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nepoznata greška');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Naziv firme *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Slug / poddomen *</label>
          <div className="flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-500">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              required
              pattern="[a-z0-9-]+"
              className="w-full border-0 p-0 text-sm text-slate-900 focus:outline-none"
            />
            <span>.localhost:3000</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">PIB</label>
          <input
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            className="input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Popust tenanta (%)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value) || 0)}
            className="input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Adresa isporuke (podrazumevana)
        </label>
        <input
          value={shippingAddress}
          onChange={(e) => setShippingAddress(e.target.value)}
          placeholder="npr. Industrijska zona 5, Beograd"
          className="input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      {success && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="btn bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Kreiranje…' : 'Kreiraj tenant'}
      </button>
    </form>
  );
}
