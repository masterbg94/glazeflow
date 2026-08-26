import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { notify } from "@/lib/notifications";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const messages = await prisma.orderMessage.findMany({ where: { orderId: id }, include: { author: { select: { name: true, platformRole: true } } }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { body } = await req.json();
  const user = session.user as any;

  const message = await prisma.orderMessage.create({ data: { orderId: id, authorId: user.id, body }, include: { author: { select: { name: true, platformRole: true } } } });

  const order = await prisma.order.findUnique({ where: { id } });
  if (order) {
    const recipients = user.platformRole === "CUSTOMER"
      ? await prisma.user.findMany({ where: { companyId: order.companyId, platformRole: { in: ["COMPANY_ADMIN", "COMPANY_STAFF"] } } })
      : await prisma.user.findMany({ where: { customerOrgId: order.customerOrgId } });
    for (const r of recipients) {
      if (r.id === user.id) continue;
      await notify({ userId: r.id, event: "ORDER_MESSAGE", title: `Message on order ${order.orderNumber}`, body: `${user.name}: ${body.slice(0, 120)}...`, orderId: order.id });
    }
  }
  return NextResponse.json({ message });
}
