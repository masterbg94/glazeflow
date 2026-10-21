import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { getSessionUser } from '@/lib/rbac';
import { getTenantBySlug } from '@/lib/tenant';

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companySlug: string }>;
}) {
  // The slug segment is the TENANT slug (tenant1.localhost:3000 → /tenant1/...).
  const { companySlug: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const user = await getSessionUser();
  const isTenantAdmin = user?.customerOrgRole === 'TENANT_ADMIN';

  return (
    <div>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href={`/${tenantSlug}`} className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-700" />
            <div>
              <p className="font-bold text-slate-900">{tenant.name}</p>
              <p className="text-xs text-slate-500">Dobavljač: {tenant.company.name}</p>
            </div>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href={`/${tenantSlug}/order`}
              className="text-sm font-medium text-slate-700 hover:text-blue-700"
            >
              Poruči odmah
            </Link>
            <Link
              href={`/${tenantSlug}/my-orders`}
              className="text-sm font-medium text-slate-700 hover:text-blue-700"
            >
              Moje narudžbine
            </Link>
            {isTenantAdmin && (
              <Link
                href={`/${tenantSlug}/finance`}
                className="text-sm font-medium text-slate-700 hover:text-blue-700"
              >
                Finansije
              </Link>
            )}
            {user ? (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <NotificationBell orderBasePath={`/${tenantSlug}/my-orders`} />
                <SignOutButton />
              </div>
            ) : (
              <Link href="/login" className="text-sm font-medium text-blue-600">
                Prijavi se
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      <footer className="mt-16 border-t border-slate-200 py-8 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} {tenant.name}
      </footer>
    </div>
  );
}
