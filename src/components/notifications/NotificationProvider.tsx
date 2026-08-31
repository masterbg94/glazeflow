"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { ClientRealtimeEvent, ClientNotificationEvent } from "@/lib/events";

interface Notification {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  orderId?: string | null;
}

interface CtxValue {
  notifications: Notification[];
  unread: number;
  markRead: (id: string) => void;
  clearAll: () => void;
  subscribeRealtime: (handler: (e: ClientRealtimeEvent) => void) => () => void;
}

const Ctx = createContext<CtxValue>({
  notifications: [],
  unread: 0,
  markRead: () => {},
  clearAll: () => {},
  subscribeRealtime: () => () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { subscribe } = useRealtime();

  // Initial fetch
  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications || []))
      .catch(() => {});
  }, []);

  // Subscribe to real-time events from RealtimeProvider
  useEffect(() => {
    const unsub = subscribe((event: ClientRealtimeEvent) => {
      if (event.event === "notification") {
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
    fetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => {});
  }

  function clearAll() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }

  const value = useMemo<CtxValue>(
    () => ({
      notifications,
      unread: notifications.filter((n) => !n.isRead).length,
      markRead,
      clearAll,
      subscribeRealtime(handler) {
        return subscribe((e) => {
          if (e.event === "message:add" || e.event === "order:update") {
            handler(e);
          }
        });
      },
    }),
    [notifications, subscribe]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  return useContext(Ctx);
}