import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const user = session?.user as any;
  if (!user || !['COMPANY_ADMIN', 'COMPANY_STAFF', 'SUPER_ADMIN'].includes(user.platformRole)) {
    redirect('/login');
  }

  const companyId = user.companyId;
  let isProducer = false;
  if (companyId) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { isProducer: true },
    });
    isProducer = company?.isProducer ?? false;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar isProducer={isProducer} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900">Kontrolna tabla kompanije</h1>
          <div className="flex items-center gap-4">
            {user && (
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
            )}
            <NotificationBell orderBasePath="/dashboard/orders" />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
