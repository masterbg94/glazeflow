'use client';

import { ClipboardList, LayoutDashboard, LogOut, Package } from 'lucide-react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  isProducer: boolean;
}

export function Sidebar({ isProducer }: SidebarProps) {
  const pathname = usePathname();
  const links = [
    { href: '/dashboard', label: 'Kontrolna tabla', icon: LayoutDashboard },
    ...(isProducer ? [{ href: '/dashboard/catalog', label: 'Katalog i cene', icon: Package }] : []),
    { href: '/dashboard/orders', label: 'Narudžbine', icon: ClipboardList },
  ];

  return (
    <aside className="w-64 border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center border-b border-slate-200 px-6">
        <span className="text-lg font-bold text-blue-600">GlazeFlow</span>
      </div>
      <nav className="space-y-1 p-4">
        {links.map((l) => {
          const active = pathname === l.href || pathname.startsWith(l.href + '/');
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <l.icon size={16} /> {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-4">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <LogOut size={16} /> Odjava
        </button>
      </div>
    </aside>
  );
}
