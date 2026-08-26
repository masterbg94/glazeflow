"use client";
import { useEffect, useState } from "react";

export function OrderMessages({ orderId }: { orderId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");

  async function load() {
    const res = await fetch(`/api/orders/${orderId}/messages`);
    const data = await res.json();
    setMessages(data.messages || []);
  }

  useEffect(() => {
    load();
  }, [orderId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await fetch(`/api/orders/${orderId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    setText("");
    load();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 font-semibold">Messages</h2>
      <div className="mb-4 max-h-64 space-y-3 overflow-y-auto">
        {messages.map((m) => (
          <div key={m.id} className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">{m.author.name}</p>
            <p className="text-sm text-slate-800">{m.body}</p>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="input"
          placeholder="Write a message..."
        />
        <button className="btn bg-blue-600 text-white">Send</button>
      </form>
    </div>
  );
}
