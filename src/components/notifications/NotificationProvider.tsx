"use client";
import { createContext, useContext, useEffect, useState } from "react";

interface Notification { id: string; title: string; body: string; isRead: boolean; createdAt: string; }
const Ctx = createContext<{ notifications: Notification[]; unread: number }>({ notifications: [], unread: 0 });

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

  const unread = notifications.filter((n) => !n.isRead).length;
  return <Ctx.Provider value={{ notifications, unread }}>{children}</Ctx.Provider>;
}

export function useNotifications() { return useContext(Ctx); }
