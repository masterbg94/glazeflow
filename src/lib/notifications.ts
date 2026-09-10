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
  const payload: NotificationPayload = { notification };
  publishToUsers([input.userId], 'notification', payload);
  if (input.email) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (user) await sendEmail(user.email, input.title, input.body);
  }
  return notification;
}
