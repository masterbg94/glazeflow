'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ActivityFeed,
  ExpandableRow,
  HorizontalBarChart,
  RoleDistribution,
  StatCard,
} from '@/components/admin';
import { CreateCompanyForm } from '@/components/admin/CreateCompanyForm';
import { SignOutButton } from '@/components/auth/SignOutButton';

interface CompanyDetail {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  type: 'company' | 'tenant';
  isMainCompany?: boolean;
  priceList?: { id: string; name: string; discountPercent: string } | null;
  counts: {
    users: number;
    orders: number;
    customerOrgs: number;
    catalog: {
      glassTypes: number;
      pvcProfiles: number;
      hardwareItems: number;
      productTemplates: number;
      processingOptions: number;
      priceLists: number;
    };
  };
}

interface AdminStats {
  totals: {
    companies: number;
    users: number;
    customerOrgs: number;
    orders: number;
    revenue: string;
  };
  ordersByStatus: Record<string, number>;
  usersByPlatformRole: Record<string, number>;
  companiesDetail: CompanyDetail[];
  recentActivity: Array<{
    type:
      | 'company_created'
      | 'tenant_created'
      | 'order_created'
      | 'user_created'
      | 'order_status_changed';
    timestamp: string;
    companyName: string;
    companySlug: string;
    entityId: string;
    entityType: 'company' | 'tenant' | 'order' | 'user';
    details: string;
  }>;
}

const statusOrder = [
  'NEW',
  'QUOTE_AMENDMENT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'DELIVERED',
  'CLOSED',
  'CANCELLED',
];
const statusLabels: Record<string, string> = {
  NEW: 'Nova',
  QUOTE_AMENDMENT: 'Korekcija ponude',
  CONFIRMED: 'Potvrđena',
  IN_PRODUCTION: 'U proizvodnji',
  READY: 'Spremna',
  DELIVERED: 'Isporučena',
  CLOSED: 'Zatvorena',
  CANCELLED: 'Otkazana',
};
const statusColors: Record<string, string> = {
  NEW: '#3b82f6',
  QUOTE_AMENDMENT: '#f59e0b',
  CONFIRMED: '#0891b2',
  IN_PRODUCTION: '#8b5cf6',
  READY: '#10b981',
  DELIVERED: '#059669',
  CLOSED: '#64748b',
  CANCELLED: '#ef4444',
};

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function fetchStats() {
    try {
      const res = await fetch('/api/admin/stats', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        setError('Neuspešno učitavanje statistike');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nepoznata greška');
    } finally {
      setLoading(false);
    }
  }

  function onCompanyCreated() {
    fetchStats();
  }

  function handleEntityClick(entityId: string, entityType: 'company' | 'tenant') {
    router.push(`/admin/companies/${entityId}`);
  }

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Platform administrator</h1>
          <SignOutButton />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm animate-pulse"
            >
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-4" />
              <div className="h-8 bg-slate-200 rounded w-1/2" />
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-1/4 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 bg-slate-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Platform administrator</h1>
          <SignOutButton />
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-600">
          {error || 'Failed to load admin stats'}
        </div>
      </div>
    );
  }

  const orderStatusData = statusOrder
    .map((status) => ({
      label: statusLabels[status] || status,
      value: stats.ordersByStatus[status] || 0,
      color: statusColors[status] || '#64748b',
    }))
    .filter((d) => d.value > 0);

  const revenueNum = Number(stats.totals.revenue);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Platform administrator</h1>
        <SignOutButton />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Kompanije" value={stats.totals.companies} />
        <StatCard label="Tenanti" value={stats.totals.customerOrgs} />
        <StatCard label="Narudžbine" value={stats.totals.orders} />
        <StatCard label="Ukupni prihod" value={`RSD ${revenueNum.toLocaleString()}`} />
      </div>

      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Kreiraj novi tenantski nalog</h2>
        <CreateCompanyForm onSuccess={onCompanyCreated} />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">Status narudžbina</h3>
          <HorizontalBarChart data={orderStatusData} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">Distribucija uloga</h3>
          <RoleDistribution data={stats.usersByPlatformRole} />
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Entiteti (Kompanije i Tenanti)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr>
                <th className="p-4">Naziv</th>
                <th className="p-4">Slug</th>
                <th className="p-4">Tip</th>
                <th className="p-4">Korisnici</th>
                <th className="p-4">Narudžbine</th>
                <th className="p-4">Klijenti / Katalog</th>
                <th className="p-4">Cenovnik</th>
                <th className="p-4">Status</th>
                <th className="p-4">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {stats.companiesDetail.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      {c.isMainCompany && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          GLAVNA
                        </span>
                      )}
                      {c.type === 'tenant' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                          TENANT
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 font-mono text-sm">{c.slug}</td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.type === 'company'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {c.type === 'company' ? 'Kompanija' : 'Tenant'}
                    </span>
                  </td>
                  <td className="p-4">{c.counts.users}</td>
                  <td className="p-4">{c.counts.orders}</td>
                  <td className="p-4">
                    {c.type === 'company' ? (
                      <>
                        <span>{c.counts.customerOrgs} klijenata</span>
                        <br />
                        <span className="text-xs text-slate-500">
                          {c.counts.catalog.glassTypes} staklo, {c.counts.catalog.pvcProfiles}{' '}
                          profili
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    {c.type === 'tenant' && c.priceList ? (
                      <div>
                        <span className="font-medium">{c.priceList.name}</span>
                        <br />
                        <span className="text-xs text-slate-500">
                          Popust: {c.priceList.discountPercent}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                        c.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${c.isActive ? 'bg-green-500' : 'bg-red-500'}`}
                      />
                      {c.isActive ? 'Aktivan' : 'Neaktivan'}
                    </span>
                  </td>
                  <td className="p-4 w-10 text-center">
                    <button
                      onClick={() => handleEntityClick(c.id, c.type)}
                      className="text-blue-600 hover:underline text-sm font-medium"
                    >
                      Upravljaj
                    </button>
                  </td>
                </tr>
              ))}
              {stats.companiesDetail.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    Još nema entiteta. Kreirajte tenant iznad.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Nedavna aktivnost (poslednjih 20)</h2>
        <ActivityFeed activities={stats.recentActivity} />
      </div>
    </div>
  );
}
