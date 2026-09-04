'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtime } from '@/components/realtime/RealtimeProvider';
import type { ClientNotificationEvent, ClientRealtimeEvent } from '@/lib/events';

interface Notification {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  orderId?: string | null;
}

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface CtxValue {
  notifications: Notification[];
  unread: number;
  markRead: (id: string) => void;
  clearAll: () => void;
  subscribeRealtime: (handler: (e: ClientRealtimeEvent) => void) => () => void;
  toast: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<CtxValue>({
  notifications: [],
  unread: 0,
  markRead: () => {},
  clearAll: () => {},
  subscribeRealtime: () => () => {},
  toast: () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { subscribe } = useRealtime();

  // Initial fetch
  useEffect(() => {
    fetch('/api/notifications')
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications || []))
      .catch(() => {});
  }, []);

  // Subscribe to real-time events from RealtimeProvider
  useEffect(() => {
    const unsub = subscribe((event: ClientRealtimeEvent) => {
      if (event.event === 'notification') {
        const notificationEvent = event as ClientNotificationEvent;
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notificationEvent.payload.id)) return prev;
          return [notificationEvent.payload, ...prev];
        });
      }
      // message:add and order:update are handled by other components via subscribeRealtime
    });
    return unsub;
  }, [subscribe]);

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    fetch(`/api/notifications/${id}/read`, { method: 'POST' }).catch(() => {});
  }

  function clearAll() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    fetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {});
  }

  function toast(message: string, kind: ToastKind = 'info') {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }

  const value = useMemo<CtxValue>(
    () => ({
      notifications,
      unread: notifications.filter((n) => !n.isRead).length,
      markRead,
      clearAll,
      subscribeRealtime(handler) {
        return subscribe((e) => {
          if (e.event === 'message:add' || e.event === 'order:update') {
            handler(e);
          }
        });
      },
      toast,
    }),
    [notifications, subscribe]
  );

  const toastColors: Record<ToastKind, string> = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-slate-200 bg-slate-50 text-slate-800',
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg border p-3 text-sm shadow-lg ${toastColors[t.kind]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useNotifications() {
  return useContext(Ctx);
}
