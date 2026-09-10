import type { ReadableStreamDefaultController } from 'stream/web';
import type {
  MessageAddPayload,
  NotificationPayload,
  OrderUpdatePayload,
  ServerEventPayload,
  ServerRealtimeEvent,
} from './events';

const encoder = new TextEncoder();

interface SseClient {
  controller: ReadableStreamDefaultController<Uint8Array>;
}

const globalForRealtime = globalThis as unknown as {
  __glazeflowRealtimeClients?: Map<string, Set<SseClient>>;
};

const sseClients: Map<string, Set<SseClient>> = globalForRealtime.__glazeflowRealtimeClients ??
new Map();
globalForRealtime.__glazeflowRealtimeClients = sseClients;

export function registerSSE(
  userId: string,
  controller: ReadableStreamDefaultController<Uint8Array>
) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId)!.add({ controller });
  sendTo(userId, { type: 'connected' });
}

export function unregisterSSE(
  userId: string,
  controller: ReadableStreamDefaultController<Uint8Array>
) {
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

/**
 * Publish a real-time event to specific users.
 * Called from API routes / server actions only.
 * @param userIds - Array of user IDs to send the event to
 * @param event - Event type ('notification' | 'message:add' | 'order:update')
 * @param payload - Event payload (userId is NOT included, it's the routing key)
 */
export function publishToUsers<E extends ServerRealtimeEvent['event']>(
  userIds: string[],
  event: E,
  payload: ServerEventPayload<E>
) {
  const data = { event, payload } as ServerRealtimeEvent;
  for (const userId of new Set(userIds)) sendTo(userId, data);
}

/**
 * Get connected client count for a user (useful for health checks).
 */
export function getClientCount(userId: string): number {
  return sseClients.get(userId)?.size ?? 0;
}

/**
 * Check if user has active SSE connection.
 */
export function isUserConnected(userId: string): boolean {
  const clients = sseClients.get(userId);
  return clients !== undefined && clients.size > 0;
}
