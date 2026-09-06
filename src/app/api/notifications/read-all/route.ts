import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return NextResponse.json({ ok: true });
}
