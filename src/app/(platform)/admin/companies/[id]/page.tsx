'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { useNotifications } from '@/components/notifications/NotificationProvider';

interface Company {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  contactEmail?: string;
  tagline?: string;
  _count: { users: number; orders: number };
}

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  platformRole: string;
  companyRole: string;
  isActive: boolean;
  createdAt: string;
}

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;
  const { toast } = useNotifications();

  const [company, setCompany] = useState<Company | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    companyRole: 'COMPANY_ADMIN',
  });

  async function fetchCompany() {
    const res = await fetch(`/api/companies/${companyId}`);
    if (res.ok) {
      const data = await res.json();
      setCompany(data.company);
    } else {
      router.push('/admin');
    }
  }

  async function fetchUsers() {
    const res = await fetch(`/api/companies/${companyId}/users`);
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchCompany();
    fetchUsers();
  }, [companyId]);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Neuspešno dodavanje korisnika');
        return;
      }

      setSuccess(`Korisnik ${data.user.name} dodat uspešno`);
      setFormData({ email: '', name: '', password: '', companyRole: 'COMPANY_ADMIN' });
      setShowAddUser(false);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nepoznata greška');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteUser(userId: string, userName: string) {
    if (!confirm(`Obriši korisnika "${userName}"? Ovo ne može biti poništeno.`)) return;

    try {
      const res = await fetch(`/api/companies/${companyId}/users/${userId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        toast(data.error || 'Neuspešno brisanje korisnika', 'error');
        return;
      }

      toast('Korisnik obrisan', 'success');
      fetchUsers();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Nepoznata greška', 'error');
    }
  }

  async function handleToggleActive(user: User) {
    try {
      const res = await fetch(`/api/companies/${companyId}/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.isActive }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast(data.error || 'Neuspešno ažuriranje korisnika', 'error');
        return;
      }

      toast(user.isActive ? 'Korisnik deaktiviran' : 'Korisnik aktiviran', 'success');
      fetchUsers();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Nepoznata greška', 'error');
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Učitavanje…</div>;
  }

  if (!company) {
    return <div className="p-8 text-center text-red-600">Kompanija nije pronađena</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-slate-500 hover:underline mb-2 inline-block">
            ← Nazad na kompanije
          </Link>
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <p className="text-slate-500">
            Slug: {company.slug} • {company._count.users} korisnika • {company._count.orders}{' '}
            narudžbina
          </p>
        </div>
        <SignOutButton />
      </div>

      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Detalji kompanije</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium">{company.isActive ? 'Aktivan' : 'Neaktivan'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Kontakt email</dt>
            <dd className="font-medium">{company.contactEmail || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Slogan</dt>
            <dd className="font-medium">{company.tagline || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">URL prodavnice</dt>
            <dd className="font-medium font-mono text-sm">{company.slug}.localhost:3000</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Korisnici</h2>
          <button
            onClick={() => setShowAddUser(true)}
            className="btn bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Dodaj korisnika
          </button>
        </div>

        {showAddUser && (
          <form
            onSubmit={handleAddUser}
            className="p-6 border-b border-slate-200 bg-slate-50 space-y-4"
          >
            <h3 className="font-semibold">Dodaj novog korisnika</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Ime *</label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Lozinka *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={8}
                  className="input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Uloga</label>
                <select
                  value={formData.companyRole}
                  onChange={(e) => setFormData({ ...formData, companyRole: e.target.value })}
                  className="input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="COMPANY_ADMIN">Administrator</option>
                  <option value="COMPANY_SALES">Prodaja</option>
                  <option value="COMPANY_PRODUCTION">Proizvodnja</option>
                </select>
              </div>
            </div>
            {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
            {success && (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="btn bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Dodaje…' : 'Dodaj korisnika'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddUser(false)}
                className="btn bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
              >
                Otkaži
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr>
                <th className="p-4">Ime</th>
                <th className="p-4">Email</th>
                <th className="p-4">Uloga</th>
                <th className="p-4">Platform uloga</th>
                <th className="p-4">Status</th>
                <th className="p-4">Kreirano</th>
                <th className="p-4">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Još nema korisnika. Kliknite na "Dodaj korisnika" da kreirate jednog.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-4 font-medium">{u.name}</td>
                    <td className="p-4">{u.email}</td>
                    <td className="p-4">
                      <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {u.companyRole}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {u.platformRole}
                      </span>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => handleToggleActive(u)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        } hover:opacity-80`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${u.isActive ? 'bg-green-500' : 'bg-red-500'}`}
                        />
                        {u.isActive ? 'Aktivan' : 'Neaktivan'}
                      </button>
                    </td>
                    <td className="p-4 text-slate-500">
                      {new Date(u.createdAt).toLocaleDateString('sr-RS')}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => handleDeleteUser(u.id, u.name)}
                        className="text-red-600 hover:underline text-sm font-medium"
                      >
                        Obriši
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
