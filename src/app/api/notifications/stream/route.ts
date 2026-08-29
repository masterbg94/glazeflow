import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { registerSSE, unregisterSSE } from '@/lib/realtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = (session.user as any).id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':keep-alive\n\n'));
        } catch {
          cleanup();
        }
      }, 25000);

      function cleanup() {
        clearInterval(heartbeat);
        unregisterSSE(userId, controller);
      }

      controller.enqueue(encoder.encode(':connected\n\n'));
      registerSSE(userId, controller);

      req.signal.addEventListener('abort', cleanup);
    },
    cancel(controller) {
      unregisterSSE(userId, controller);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
