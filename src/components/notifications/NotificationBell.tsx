"use client";
import { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "./NotificationProvider";

export function NotificationBell() {
  const { notifications, unread } = useNotifications();
  const [open, setOpen] = useState(false);

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
          {notifications.length === 0 && (
            <p className="p-4 text-sm text-slate-400">No notifications yet.</p>
          )}
          {notifications.map((n) => (
            <div key={n.id} className="border-b border-slate-100 p-3 hover:bg-slate-50">
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-xs text-slate-500">{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
