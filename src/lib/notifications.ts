import { NotificationEvent } from '@prisma/client';
import { sendEmail } from './email';
import type { NotificationPayload } from './events';
import { prisma } from './prisma';
import { publishToUsers } from './realtime';

export async function notify(input: {
  userId: string;
  event: NotificationEvent;
  title: string;
  body: string;
  orderId?: string;
  email?: boolean;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      orderId: input.orderId,
      event: input.event,
      title: input.title,
      body: input.body,
    },
  });
  const payload: NotificationPayload = notification;
  publishToUsers([input.userId], 'notification', payload);
  if (input.email) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (user) await sendEmail(user.email, input.title, input.body);
  }
  return notification;
}

/**
 * Notify many users at once.
 *
 * The per-user `notify()` above performs one INSERT, one SSE publish, one
 * extra user lookup and one awaited HTTPS call to Resend. Calling it in a
 * serial loop meant a `POST /api/orders` waited for one Resend round-trip per
 * main-company staff member before the response returned.
 *
 * Here the rows are written concurrently, the real-time events are published
 * per recipient with their own notification id, and the emails are sent
 * without blocking the caller.
 */
export async function notifyMany(input: {
  userIds: string[];
  event: NotificationEvent;
  title: string;
  body: string;
  orderId?: string;
  email?: boolean;
  /** Renders the body per recipient. */
  bodyFor?: (userId: string) => string;
}) {
  const userIds = [...new Set(input.userIds)].filter(Boolean);
  if (userIds.length === 0) return [];

  const created = await Promise.all(
    userIds.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          orderId: input.orderId ?? null,
          event: input.event,
          title: input.title,
          body: input.bodyFor ? input.bodyFor(userId) : input.body,
        },
      })
    )
  );

  for (const notification of created) {
    const payload: NotificationPayload = notification;
    publishToUsers([notification.userId], 'notification', payload);
  }

  if (input.email) {
    const recipients = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    });
    for (const recipient of recipients) {
      const body = input.bodyFor ? input.bodyFor(recipient.id) : input.body;
      void sendEmail(recipient.email, input.title, body).catch(() => {});
    }
  }

  return created;
}
