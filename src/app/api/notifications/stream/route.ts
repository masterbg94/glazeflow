import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { registerSSE, unregisterSSE } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = (session.user as any).id;

  const stream = new ReadableStream({
    start(controller) {
      registerSSE(userId, controller);
    },
    cancel(controller) {
      unregisterSSE(userId, controller);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}