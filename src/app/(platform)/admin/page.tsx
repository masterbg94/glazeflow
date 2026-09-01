'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { CreateCompanyForm } from '@/components/admin/CreateCompanyForm';

interface Company {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  _count: { users: number; orders: number };
}

export default function AdminPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchCompanies() {
    const res = await fetch('/api/companies');
    if (res.ok) {
      const data = await res.json();
      setCompanies(data.companies || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchCompanies();
  }, []);

  function onCompanyCreated() {
    fetchCompanies();
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Platform Admin</h1>
        <SignOutButton />
      </div>

      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Create new tenant</h2>
        <CreateCompanyForm onSuccess={onCompanyCreated} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr>
                <th className="p-4">Company</th>
                <th className="p-4">Slug</th>
                <th className="p-4">Users</th>
                <th className="p-4">Orders</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-4 font-medium">{c.name}</td>
                  <td className="p-4">{c.slug}</td>
                  <td className="p-4">{c._count.users}</td>
                  <td className="p-4">{c._count.orders}</td>
                  <td className="p-4">{c.isActive ? 'Active' : 'Inactive'}</td>
                  <td className="p-4">
                    <Link
                      href={`/admin/companies/${c.id}`}
                      className="text-blue-600 hover:underline text-sm font-medium"
                    >
                      Manage users
                    </Link>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No companies yet. Create one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}