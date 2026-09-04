"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNotifications } from "@/components/notifications/NotificationProvider";

export function OrderMessages({ orderId }: { orderId: string }) {
  const { subscribeRealtime } = useNotifications();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${orderId}/messages`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages || []);
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: new messages arrive over SSE without a reload.
  useEffect(() => {
    const unsub = subscribeRealtime((e) => {
      if (e.event !== "message:add" || e.payload.orderId !== orderId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === e.payload.message.id)) return prev;
        return [...prev, e.payload.message];
      });
    });
    return unsub;
  }, [orderId, subscribeRealtime]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        setText("");
        await load();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 font-semibold">Poruke</h2>
      <div className="mb-4 max-h-64 space-y-3 overflow-y-auto">
        {messages.map((m) => (
          <div key={m.id} className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">
              {m.author?.name ?? "Nepoznato"} · {new Date(m.createdAt).toLocaleString('sr-RS')}
            </p>
            <p className="text-sm text-slate-800">{m.body}</p>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">Nema poruka.</p>
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="input"
          placeholder="Napišite poruku..."
        />
        <button type="submit" className="btn bg-blue-600 text-white" disabled={sending}>
          {sending ? "Slanje..." : "Pošalji"}
        </button>
      </form>
    </div>
  );
}
