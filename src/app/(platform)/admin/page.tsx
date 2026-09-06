'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ActivityFeed,
  ExpandableRow,
  HorizontalBarChart,
  RoleDistribution,
  StatCard,
} from '@/components/admin';
import { CreateCompanyForm } from '@/components/admin/CreateCompanyForm';
import { SignOutButton } from '@/components/auth/SignOutButton';

interface Company {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  _count: {
    users: number;
    orders: number;
    customerOrgs: number;
    glassTypes: number;
    pvcProfiles: number;
    hardwareItems: number;
    productTemplates: number;
    processingOptions: number;
    priceLists: number;
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
  companiesDetail: Array<{
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
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
  }>;
  recentActivity: Array<{
    type: 'company_created' | 'order_created' | 'user_created' | 'order_status_changed';
    timestamp: string;
    companyName: string;
    companySlug: string;
    entityId: string;
    entityType: 'company' | 'order' | 'user';
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

  function handleCompanyClick(companyId: string) {
    router.push(`/admin/companies/${companyId}`);
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
        <StatCard label="Korisnici (staff)" value={stats.totals.users} />
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
          <h2 className="text-lg font-semibold">Kompanije</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr>
                <th className="p-4">Kompanija</th>
                <th className="p-4">Slug</th>
                <th className="p-4">Korisnici</th>
                <th className="p-4">Narudžbine</th>
                <th className="p-4">Klijenti</th>
                <th className="p-4">Katalog</th>
                <th className="p-4">Status</th>
                <th className="p-4">Akcije</th>
                <th className="p-4 w-10 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {stats.companiesDetail.map((c) => (
                <ExpandableRow
                  key={c.id}
                  companyName={c.name}
                  companySlug={c.slug}
                  counts={{
                    users: c.counts.users,
                    orders: c.counts.orders,
                    customerOrgs: c.counts.customerOrgs,
                    catalog: c.counts.catalog,
                  }}
                  isActive={c.isActive}
                  onManageClick={() => handleCompanyClick(c.id)}
                />
              ))}
              {stats.companiesDetail.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    Još nema kompanija. Kreirajte jednu iznad.
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
