'use client';

import { useState } from 'react';

/**
 * Form for super-admins to create a new tenant (Company).
 *
 * A tenant is just a Company row with a unique slug; the slug doubles as the
 * subdomain that serves its storefront (e.g. acme → acme.localhost:3000).
 * Creating one here is enough to make the storefront live — no separate
 * infrastructure per tenant.
 */
interface CreateCompanyFormProps {
  onSuccess?: () => void;
}

export function CreateCompanyForm({ onSuccess }: CreateCompanyFormProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [tagline, setTagline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, contactEmail: email, tagline }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Neuspešno (${res.status})`);
        return;
      }
      const data = await res.json();
      setSuccess(`Kreirano "${data.company.name}" (slug: ${data.company.slug})`);
      setName('');
      setSlug('');
      setEmail('');
      setTagline('');
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
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Naziv kompanije *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Slug / poddomen *
          </label>
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
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Kontakt email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Slogan
          </label>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            className="input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      {success && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>}
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