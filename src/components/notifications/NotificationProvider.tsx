"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface RealtimeMessageEvent {
  event: "message:add";
  payload: { orderId: string; message: { id: string } & Record<string, unknown> };
}
export interface RealtimeOrderUpdateEvent {
  event: "order:update";
  payload: { orderId: string; order: { id: string; status: string } & Record<string, unknown> };
}
export type RealtimeEvent = RealtimeMessageEvent | RealtimeOrderUpdateEvent;

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
  subscribeRealtime: (handler: (e: RealtimeEvent) => void) => () => void;
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
  const handlersRef = useRef(new Set<(e: RealtimeEvent) => void>());

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
        if (data.event === "notification") {
          setNotifications((prev) => {
            if (prev.some((n) => n.id === data.payload.id)) return prev;
            return [data.payload, ...prev];
          });
        } else if (data.event === "message:add" || data.event === "order:update") {
          handlersRef.current.forEach((h) => h(data as RealtimeEvent));
        }
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

  const value = useMemo<CtxValue>(
    () => ({
      notifications,
      unread: notifications.filter((n) => !n.isRead).length,
      markRead,
      clearAll,
      subscribeRealtime(handler) {
        handlersRef.current.add(handler);
        return () => handlersRef.current.delete(handler);
      },
    }),
    [notifications]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  return useContext(Ctx);
}
