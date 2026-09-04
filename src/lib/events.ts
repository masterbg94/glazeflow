import type { NotificationEvent } from '@prisma/client';

// ============================================
// SERVER-SIDE EVENT TYPES (published from API routes)
// ============================================

/** Payload sent to publishToUsers - userId is separate first argument */
export interface NotificationPayload {
  notification: {
    id: string;
    userId: string;
    orderId: string | null;
    event: NotificationEvent;
    title: string;
    body: string;
    isRead: boolean;
    createdAt: Date;
  };
}

export interface MessageAddPayload {
  orderId: string;
  message: {
    id: string;
    orderId: string;
    authorId: string;
    body: string;
    createdAt: Date;
    author: { name: string; platformRole: string };
  };
}

export interface OrderUpdatePayload {
  orderId: string;
  order: {
    id: string;
    status: string;
    orderNumber: string;
    customerNotes: string | null;
    shippingAddress: string | null;
  };
}

/** Union of all event types for type-safe publishing */
export type ServerRealtimeEvent =
  | { event: 'notification'; payload: NotificationPayload }
  | { event: 'message:add'; payload: MessageAddPayload }
  | { event: 'order:update'; payload: OrderUpdatePayload };

// Type helper to extract payload by event name
export type ServerEventPayload<E extends ServerRealtimeEvent['event']> = Extract<
  ServerRealtimeEvent,
  { event: E }
>['payload'];

// ============================================
// CLIENT-SIDE EVENT TYPES (received via SSE)
// ============================================

export interface ClientNotificationEvent {
  event: 'notification';
  payload: {
    id: string;
    userId: string;
    orderId: string | null;
    event: NotificationEvent;
    title: string;
    body: string;
    isRead: boolean;
    createdAt: string;
  };
}

export interface ClientMessageAddEvent {
  event: 'message:add';
  payload: {
    orderId: string;
    message: {
      id: string;
      orderId: string;
      authorId: string;
      body: string;
      createdAt: string;
      author: { name: string; platformRole: string };
    };
  };
}

export interface ClientOrderUpdateEvent {
  event: 'order:update';
  payload: {
    orderId: string;
    order: {
      id: string;
      status: string;
      orderNumber: string;
      customerNotes: string | null;
      shippingAddress: string | null;
    };
  };
}

export type ClientRealtimeEvent =
  ClientNotificationEvent | ClientMessageAddEvent | ClientOrderUpdateEvent;

// ============================================
// TYPE GUARDS
// ============================================

export function isClientRealtimeEvent(data: unknown): data is ClientRealtimeEvent {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.event === 'string' &&
    ['notification', 'message:add', 'order:update'].includes(d.event as string) &&
    d.payload !== undefined
  );
}

export function isNotificationEvent(data: unknown): data is ClientNotificationEvent {
  return isClientRealtimeEvent(data) && data.event === 'notification';
}

export function isMessageAddEvent(data: unknown): data is ClientMessageAddEvent {
  return isClientRealtimeEvent(data) && data.event === 'message:add';
}

export function isOrderUpdateEvent(data: unknown): data is ClientOrderUpdateEvent {
  return isClientRealtimeEvent(data) && data.event === 'order:update';
}
