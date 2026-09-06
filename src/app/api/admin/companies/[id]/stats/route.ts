import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(['SUPER_ADMIN']);
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      currency: true,
      _count: {
        select: {
          users: true,
          orders: true,
          customerOrgs: true,
          glassTypes: true,
          pvcProfiles: true,
          hardwareItems: true,
          productTemplates: true,
          processingOptions: true,
          priceLists: true,
        },
      },
    },
  });

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const [ordersByStatus, revenueAgg, monthlyRevenue, topCustomers] = await Promise.all([
    prisma.order.groupBy({
      where: { companyId: id },
      by: ['status'],
      _count: true,
    }),
    prisma.order.aggregate({
      where: { companyId: id },
      _sum: { total: true },
    }),
    prisma.$queryRaw<Array<{ month: string; revenue: number }>>`
      SELECT 
        strftime('%Y-%m', "createdAt") as month,
        SUM(CAST("total" AS REAL)) as revenue
      FROM "Order"
      WHERE "companyId" = ${id}
        AND "createdAt" >= datetime('now', '-6 months')
      GROUP BY strftime('%Y-%m', "createdAt")
      ORDER BY month ASC
    `,
    prisma.customerOrg.findMany({
      where: { companyId: id },
      include: {
        _count: { select: { orders: true } },
      },
      orderBy: { orders: { _count: 'desc' } },
      take: 5,
    }),
  ]);

  const statusOrder = [
    'NEW',
    'QUOTE_AMENDMENT',
    'CONFIRMED',
    'IN_PRODUCTION',
    'READY',
    'DELIVERED',
    'CLOSED',
    'CANCELLED',
  ];
  const ordersByStatusMap: Record<string, number> = {};
  for (const item of ordersByStatus) {
    ordersByStatusMap[item.status] = item._count;
  }

  const statusData = statusOrder
    .map((status) => ({
      status,
      count: ordersByStatusMap[status] || 0,
    }))
    .filter((d) => d.count > 0);

  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });

  const revenueTrend = last6Months.map((month) => {
    const found = monthlyRevenue.find((m) => m.month === month);
    return { month, revenue: found ? Number(found.revenue) : 0 };
  });

  return NextResponse.json({
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      isActive: company.isActive,
      currency: company.currency,
      counts: {
        users: company._count.users,
        orders: company._count.orders,
        customerOrgs: company._count.customerOrgs,
        catalog: {
          glassTypes: company._count.glassTypes,
          pvcProfiles: company._count.pvcProfiles,
          hardwareItems: company._count.hardwareItems,
          productTemplates: company._count.productTemplates,
          processingOptions: company._count.processingOptions,
          priceLists: company._count.priceLists,
        },
      },
    },
    ordersByStatus: statusData,
    totalRevenue: revenueAgg._sum.total?.toString() || '0',
    revenueTrend,
    topCustomers: topCustomers.map((c) => ({
      id: c.id,
      name: c.name,
      orderCount: c._count.orders,
    })),
    catalogCompleteness: {
      hasGlass: company._count.glassTypes > 0,
      hasProfiles: company._count.pvcProfiles > 0,
      hasHardware: company._count.hardwareItems > 0,
      hasTemplates: company._count.productTemplates > 0,
      hasProcessing: company._count.processingOptions > 0,
      hasPriceLists: company._count.priceLists > 0,
    },
  });
}
