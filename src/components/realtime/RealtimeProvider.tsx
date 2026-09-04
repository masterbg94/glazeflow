'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ClientRealtimeEvent } from '@/lib/events';

interface RealtimeContextValue {
  /** Subscribe to real-time events. Returns unsubscribe function. */
  subscribe: (handler: (event: ClientRealtimeEvent) => void) => () => void;
  /** Current connection status */
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  /** Manually trigger reconnection */
  reconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({
  children,
  onError,
}: {
  children: React.ReactNode;
  onError?: (error: Error) => void;
}) {
  const [status, setStatus] = useState<RealtimeContextValue['status']>('connecting');
  const handlersRef = useRef(new Set<(event: ClientRealtimeEvent) => void>());
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000; // 1 second

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();
    setStatus('connecting');

    try {
      const es = new EventSource('/api/notifications/stream');
      eventSourceRef.current = es;

      es.onopen = () => {
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
      };

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          // Skip connection confirmation message
          if (data.type === 'connected') return;

          // Validate and dispatch to handlers
          if (data.event && data.payload) {
            handlersRef.current.forEach((handler) => {
              try {
                handler(data as ClientRealtimeEvent);
              } catch (handlerError) {
                console.error('[RealtimeProvider] Handler error:', handlerError);
              }
            });
          }
        } catch (parseError) {
          console.error('[RealtimeProvider] Parse error:', parseError);
        }
      };

      es.onerror = (err) => {
        setStatus('error');
        cleanup();

        // Exponential backoff reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else {
          setStatus('disconnected');
          onError?.(new Error('Max reconnection attempts reached'));
        }
      };
    } catch (err) {
      setStatus('error');
      onError?.(err as Error);
    }
  }, [cleanup, onError]);

  // Initial connection
  useEffect(() => {
    connect();
    return () => cleanup();
  }, [connect, cleanup]);

  const subscribe = useCallback((handler: (event: ClientRealtimeEvent) => void) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  const value: RealtimeContextValue = {
    subscribe,
    status,
    reconnect,
  };

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}
