import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { notify } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { publishToUsers } from '@/lib/realtime';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;

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
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { body } = await req.json();
  const user = session.user as any;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canAccessOrder(user, order))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const message = await prisma.orderMessage.create({
    data: { orderId: id, authorId: user.id, body },
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

  for (const rid of recipientIds) {
    await notify({
      userId: rid,
      event: 'ORDER_MESSAGE',
      title: `Message on order ${order.orderNumber}`,
      body: `${user.name}: ${body.slice(0, 120)}...`,
      orderId: order.id,
    });
  }
  return NextResponse.json({ message });
}

function canAccessOrder(
  user: any,
  order: { companyId: string; customerOrgId: string; createdById: string }
) {
  if (user.platformRole === 'SUPER_ADMIN') return true;
  if (['COMPANY_ADMIN', 'COMPANY_STAFF'].includes(user.platformRole)) {
    return order.companyId === user.companyId;
  }
  // CUSTOMER
  return order.createdById === user.id || order.customerOrgId === user.customerOrgId;
}
