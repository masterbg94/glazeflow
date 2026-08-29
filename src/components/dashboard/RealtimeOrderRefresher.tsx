"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/components/notifications/NotificationProvider";

export function RealtimeOrderRefresher({ orderId }: { orderId: string }) {
  const { subscribeRealtime } = useNotifications();
  const router = useRouter();

  useEffect(() => {
    const unsub = subscribeRealtime((e) => {
      const relevant =
        (e.event === "order:update" && e.payload.orderId === orderId) ||
        (e.event === "message:add" && e.payload.orderId === orderId);
      if (relevant) router.refresh();
    });
    return unsub;
  }, [orderId, router, subscribeRealtime]);

  return null;
}
