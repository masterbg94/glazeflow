import type { Metadata } from 'next';
import './globals.css';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';
import { RealtimeProvider } from '@/components/realtime/RealtimeProvider';

export const metadata: Metadata = {
  title: 'GlazeFlow — B2B Glass & PVC Ordering',
  description: 'Order glass and PVC with live price calculation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <RealtimeProvider>
          <NotificationProvider>{children}</NotificationProvider>
        </RealtimeProvider>
      </body>
    </html>
  );
}
