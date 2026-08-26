import { prisma } from "./prisma";
import { NotificationEvent } from "@prisma/client";
import { sendEmail } from "./email";

const sseClients = new Map<string, Set<ReadableStreamDefaultController>>();

export function registerSSE(userId: string, controller: ReadableStreamDefaultController) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId)!.add(controller);
}

export function unregisterSSE(userId: string, controller: ReadableStreamDefaultController) {
  sseClients.get(userId)?.delete(controller);
}

function pushSSE(userId: string, data: unknown) {
  const clients = sseClients.get(userId);
  if (!clients) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach((c) => {
    try { c.enqueue(new TextEncoder().encode(payload)); } catch { clients.delete(c); }
  });
}

export async function notify(input: { userId: string; event: NotificationEvent; title: string; body: string; orderId?: string; email?: boolean }) {
  const notification = await prisma.notification.create({
    data: { userId: input.userId, orderId: input.orderId, event: input.event, title: input.title, body: input.body },
  });
  pushSSE(input.userId, notification);
  if (input.email) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (user) await sendEmail(user.email, input.title, input.body);
  }
  return notification;
}
