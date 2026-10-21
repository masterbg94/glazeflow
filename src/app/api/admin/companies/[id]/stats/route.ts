import type { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, toHttpError } from '@/lib/rbac';

/**
 * Revenue per calendar month for the last six months.
 *
 * Implemented in JavaScript rather than raw SQL so the route works on both
 * SQLite and PostgreSQL. The `strftime()` / `CAST(... AS REAL)` version was
 * SQLite-only and blocked the database move.
 */
async function monthlyRevenueFor(where: Prisma.OrderWhereInput) {
  const since = new Date();
  since.setMonth(since.getMonth() - 6);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: { ...where, createdAt: { gte: since } },
    select: { createdAt: true, total: true },
  });

  const byMonth = new Map<string, number>();
  for (const order of orders) {
    const month = order.createdAt.toISOString().slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + Number(order.total));
  }

  return [...byMonth.entries()]
    .map(([month, revenue]) => ({ month, revenue }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(['SUPER_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const { id } = await params;

  // Try to find as Company first
  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      currency: true,
      isMainCompany: true,
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

  let entity: any = null;
  let entityType: 'company' | 'tenant' = 'company';

  if (company) {
    entity = company;
    entityType = 'company';
  } else {
    // Try to find as CustomerOrg (tenant)
    const tenant = await prisma.customerOrg.findUnique({
      where: { id },
      include: {
        priceList: { select: { id: true, name: true, discountPercent: true } },
        _count: { select: { orders: true, members: true } },
      },
    });
    if (tenant) {
      entity = tenant;
      entityType = 'tenant';
    }
  }

  if (!entity) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
  }

  let ordersByStatus: any[] = [];
  let revenueAgg: any = { _sum: { total: null } };
  let monthlyRevenue: any[] = [];
  let topCustomers: any[] = [];

  // The monthly revenue trend used to be computed with `strftime()` and
  // `CAST(... AS REAL)`, which are SQLite-only and blocked the PostgreSQL
  // move. The rows are now read with Prisma and bucketed in JavaScript, which
  // works on both providers.
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const trendWhere = entityType === 'company' ? { companyId: id } : { customerOrgId: id };

  if (entityType === 'company') {
    [ordersByStatus, revenueAgg, monthlyRevenue, topCustomers] = await Promise.all([
      prisma.order.groupBy({
        where: { companyId: id },
        by: ['status'],
        _count: true,
      }),
      prisma.order.aggregate({
        where: { companyId: id },
        _sum: { total: true },
      }),
      monthlyRevenueFor(trendWhere),
      prisma.customerOrg.findMany({
        where: { companyId: id },
        include: {
          _count: { select: { orders: true } },
        },
        orderBy: { orders: { _count: 'desc' } },
        take: 5,
      }),
    ]);
  } else {
    // Tenant stats - orders where customerOrgId = id
    [ordersByStatus, revenueAgg, monthlyRevenue, topCustomers] = await Promise.all([
      prisma.order.groupBy({
        where: { customerOrgId: id },
        by: ['status'],
        _count: true,
      }),
      prisma.order.aggregate({
        where: { customerOrgId: id },
        _sum: { total: true },
      }),
      monthlyRevenueFor(trendWhere),
      prisma.order.groupBy({
        where: { customerOrgId: id },
        by: ['createdById'],
        _count: true,
        orderBy: { _count: { createdById: 'desc' } },
        take: 5,
      }),
    ]);
  }

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

  if (entityType === 'company') {
    return NextResponse.json({
      company: {
        id: entity.id,
        name: entity.name,
        slug: entity.slug,
        isActive: entity.isActive,
        isMainCompany: entity.isMainCompany,
        currency: entity.currency,
        type: 'company' as const,
        counts: {
          users: entity._count.users,
          orders: entity._count.orders,
          customerOrgs: entity._count.customerOrgs,
          catalog: {
            glassTypes: entity._count.glassTypes,
            pvcProfiles: entity._count.pvcProfiles,
            hardwareItems: entity._count.hardwareItems,
            productTemplates: entity._count.productTemplates,
            processingOptions: entity._count.processingOptions,
            priceLists: entity._count.priceLists,
          },
        },
      },
      ordersByStatus: statusData,
      totalRevenue: revenueAgg._sum.total?.toString() || '0',
      revenueTrend,
      topCustomers: topCustomers.map((c: any) => ({
        id: c.id,
        name: c.name,
        orderCount: c._count.orders,
      })),
      catalogCompleteness: {
        hasGlass: entity._count.glassTypes > 0,
        hasProfiles: entity._count.pvcProfiles > 0,
        hasHardware: entity._count.hardwareItems > 0,
        hasTemplates: entity._count.productTemplates > 0,
        hasProcessing: entity._count.processingOptions > 0,
        hasPriceLists: entity._count.priceLists > 0,
      },
    });
  } else {
    return NextResponse.json({
      company: {
        id: entity.id,
        name: entity.name,
        slug: entity.slug,
        isActive: true,
        type: 'tenant' as const,
        currency: 'RSD',
        priceList: entity.priceList
          ? { ...entity.priceList, discountPercent: entity.priceList.discountPercent.toString() }
          : null,
        counts: {
          users: entity._count.members,
          orders: entity._count.orders,
          customerOrgs: 0,
          catalog: {
            glassTypes: 0,
            pvcProfiles: 0,
            hardwareItems: 0,
            productTemplates: 0,
            processingOptions: 0,
            priceLists: 0,
          },
        },
      },
      ordersByStatus: statusData,
      totalRevenue: revenueAgg._sum.total?.toString() || '0',
      revenueTrend,
      topCustomers: topCustomers.map((c: any) => ({
        id: c.createdById,
        name: `User ${c.createdById.slice(0, 8)}`,
        orderCount: c._count.createdById,
      })),
      catalogCompleteness: {
        hasGlass: false,
        hasProfiles: false,
        hasHardware: false,
        hasTemplates: false,
        hasProcessing: false,
        hasPriceLists: false,
      },
    });
  }
}
