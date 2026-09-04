"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useNotifications } from "./NotificationProvider";

export function NotificationBell({ orderBasePath }: { orderBasePath?: string }) {
  const { notifications, unread, markRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function onClick(n: { id: string; orderId?: string | null }) {
    markRead(n.id);
    if (n.orderId && orderBasePath) {
      router.push(`${orderBasePath}/${n.orderId}`);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-full p-2 hover:bg-slate-100"
      >
        <Bell size={20} className="text-slate-700" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-medium text-slate-500">Obaveštenja</span>
            {unread > 0 && (
              <button onClick={clearAll} className="text-xs text-blue-600 hover:underline">
                Označi sve pročitano
              </button>
            )}
          </div>
          {notifications.length === 0 && (
            <p className="p-4 text-sm text-slate-400">Nema obaveštenja.</p>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => onClick(n)}
              className={`block w-full border-b border-slate-100 p-3 text-left hover:bg-slate-50 ${
                n.isRead ? "opacity-60" : ""
              }`}
            >
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-xs text-slate-500">{n.body}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
