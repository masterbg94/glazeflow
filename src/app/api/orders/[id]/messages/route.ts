import { NextRequest, NextResponse } from 'next/server';
import { notifyMany } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { getSessionUser, type SessionUser } from '@/lib/rbac';
import { publishToUsers } from '@/lib/realtime';

const MAX_MESSAGE_LENGTH = 4000;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canAccessOrder(user, order))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const messages = await prisma.orderMessage.findMany({
    where: { orderId: id },
    include: { author: { select: { name: true, platformRole: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const text =
    typeof (body as { body?: unknown })?.body === 'string'
      ? ((body as { body: string }).body ?? '').trim()
      : '';
  if (!text) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: 'body is too long' }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canAccessOrder(user, order))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const message = await prisma.orderMessage.create({
    data: { orderId: id, authorId: user.id, body: text },
    include: { author: { select: { name: true, platformRole: true } } },
  });

  const recipients =
    user.platformRole === 'CUSTOMER'
      ? await prisma.user.findMany({
          where: {
            companyId: order.companyId,
            platformRole: { in: ['COMPANY_ADMIN', 'COMPANY_STAFF'] },
          },
        })
      : await prisma.user.findMany({ where: { customerOrgId: order.customerOrgId } });

  const recipientIds = [...new Set(recipients.map((r) => r.id).filter((rid) => rid !== user.id))];

  // Push the new message to everyone else on the order in real time.
  publishToUsers(recipientIds, 'message:add', { orderId: order.id, message });

  await notifyMany({
    userIds: recipientIds,
    event: 'ORDER_MESSAGE',
    title: `Message on order ${order.orderNumber}`,
    body: `${user.name}: ${text.slice(0, 120)}...`,
    orderId: order.id,
  });
  return NextResponse.json({ message });
}

function canAccessOrder(
  user: SessionUser,
  order: { companyId: string; customerOrgId: string; createdById: string }
) {
  if (user.platformRole === 'SUPER_ADMIN') return true;
  if (['COMPANY_ADMIN', 'COMPANY_STAFF'].includes(user.platformRole)) {
    return order.companyId === user.companyId;
  }
  // CUSTOMER
  return order.createdById === user.id || order.customerOrgId === user.customerOrgId;
}
