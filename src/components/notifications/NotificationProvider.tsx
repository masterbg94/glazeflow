"use client";
import { createContext, useContext, useEffect, useState } from "react";

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
}
const Ctx = createContext<CtxValue>({
  notifications: [],
  unread: 0,
  markRead: () => {},
  clearAll: () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications || []))
      .catch(() => {});
    const es = new EventSource("/api/notifications/stream");
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "connected") return;
        setNotifications((prev) => [data, ...prev]);
      } catch {}
    };
    return () => es.close();
  }, []);

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    fetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => {});
  }

  function clearAll() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }

  const unread = notifications.filter((n) => !n.isRead).length;
  return (
    <Ctx.Provider value={{ notifications, unread, markRead, clearAll }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNotifications() { return useContext(Ctx); }
