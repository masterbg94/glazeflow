import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { OrderKanban } from "@/components/dashboard/OrderKanban";

export default async function OrdersPage() {
  const session = await getSession();
  const companyId = (session?.user as any).companyId;
  const orders = await prisma.order.findMany({
    where: { companyId }, orderBy: { createdAt: "desc" }, include: { customerOrg: true, items: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Orders</h1>
      <OrderKanban orders={orders as any} />
    </div>
  );
}
