import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { getSession } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (
    !session?.user ||
    !['COMPANY_ADMIN', 'COMPANY_STAFF'].includes((session.user as any).platformRole)
  ) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900">Company Dashboard</h1>
          <NotificationBell />
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
