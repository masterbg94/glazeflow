import type { ReadableStreamDefaultController } from 'stream/web';

export type RealtimeEvent =
  | 'notification'
  | 'message:add'
  | 'order:update';

const encoder = new TextEncoder();

interface SseClient {
  controller: ReadableStreamDefaultController<Uint8Array>;
}

const globalForRealtime = globalThis as unknown as {
  __glazeflowRealtimeClients?: Map<string, Set<SseClient>>;
};

const sseClients: Map<string, Set<SseClient>> =
  globalForRealtime.__glazeflowRealtimeClients ?? new Map();
globalForRealtime.__glazeflowRealtimeClients = sseClients;

export function registerSSE(userId: string, controller: ReadableStreamDefaultController<Uint8Array>) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId)!.add({ controller });
  sendTo(userId, { type: 'connected' });
}

export function unregisterSSE(userId: string, controller: ReadableStreamDefaultController<Uint8Array>) {
  const clients = sseClients.get(userId);
  if (!clients) return;
  const client = [...clients].find((c) => c.controller === controller);
  if (client) clients.delete(client);
  if (clients.size === 0) sseClients.delete(userId);
}

function sendTo(userId: string, data: unknown) {
  const clients = sseClients.get(userId);
  if (!clients) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of [...clients]) {
    try {
      client.controller.enqueue(encoder.encode(payload));
    } catch {
      clients.delete(client);
    }
  }
}

export function publishToUsers(userIds: string[], event: RealtimeEvent, payload: unknown) {
  const data = { event, payload };
  for (const userId of new Set(userIds)) sendTo(userId, data);
}
