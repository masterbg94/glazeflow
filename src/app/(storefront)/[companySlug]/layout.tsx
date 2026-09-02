import Image from 'next/image';
import Link from 'next/link';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { getSession } from '@/lib/auth';
import { getCompanyBySlug } from '@/lib/tenant';

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const company = await getCompanyBySlug(companySlug);
  const session = await getSession();

  return (
    <div
      style={
        {
          '--brand-primary': company.primaryColor,
          '--brand-secondary': company.secondaryColor,
          '--brand-accent': company.accentColor,
        } as React.CSSProperties
      }
    >
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href={`/${companySlug}`} className="flex items-center gap-3">
            {company.logoUrl ? (
              <Image src={company.logoUrl} alt={company.name} width={40} height={40} />
            ) : (
              <div
                className="h-10 w-10 rounded-lg"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              />
            )}
            <div>
              <p className="font-bold text-slate-900">{company.name}</p>
              {company.tagline && <p className="text-xs text-slate-500">{company.tagline}</p>}
            </div>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href={`/${companySlug}/order`}
              className="text-sm font-medium text-slate-700 hover:text-brand-primary"
            >
              Poruči odmah
            </Link>
            <Link
              href={`/${companySlug}/my-orders`}
              className="text-sm font-medium text-slate-700 hover:text-brand-primary"
            >
              Moje narudžbine
            </Link>
            {session?.user ? (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">{(session.user as any).name}</p>
                  <p className="text-xs text-slate-500">{(session.user as any).email}</p>
                </div>
                <NotificationBell orderBasePath={`/${companySlug}/my-orders`} />
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
        {company.footerText ||
          `© ${new Date().getFullYear()} ${company.name}. Sva prava zadržana.`}
      </footer>
    </div>
  );
}
