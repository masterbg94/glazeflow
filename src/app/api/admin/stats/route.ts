import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';

export async function GET() {
  await requireRole(['SUPER_ADMIN']);

  const [
    companiesCount,
    usersCount,
    customerOrgsCount,
    ordersCount,
    revenueAgg,
    ordersByStatus,
    usersByPlatformRole,
    companiesDetail,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.user.count({ where: { platformRole: { not: 'CUSTOMER' } } }),
    prisma.customerOrg.count(),
    prisma.order.count(),
    prisma.order.aggregate({ _sum: { total: true } }),
    prisma.order.groupBy({ by: ['status'], _count: true }),
    prisma.user.groupBy({ by: ['platformRole'], _count: true }),
    prisma.company.findMany({
      include: {
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
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const recentCompanies = await prisma.company.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, slug: true, createdAt: true },
  });

  const recentOrders = await prisma.order.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      currency: true,
      createdAt: true,
      company: { select: { name: true, slug: true } },
    },
  });

  const recentUsers = await prisma.user.findMany({
    take: 5,
    where: { platformRole: { not: 'CUSTOMER' } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      platformRole: true,
      createdAt: true,
      company: { select: { name: true, slug: true } },
    },
  });

  const recentActivity = [
    ...recentCompanies.map((c) => ({
      type: 'company_created' as const,
      timestamp: c.createdAt.toISOString(),
      companyName: c.name,
      companySlug: c.slug,
      entityId: c.id,
      entityType: 'company' as const,
      details: `Company "${c.name}" created`,
    })),
    ...recentOrders.map((o) => ({
      type: 'order_created' as const,
      timestamp: o.createdAt.toISOString(),
      companyName: o.company.name,
      companySlug: o.company.slug,
      entityId: o.id,
      entityType: 'order' as const,
      details: `Order #${o.orderNumber} created (${o.currency} ${Number(o.total).toLocaleString()})`,
    })),
    ...recentUsers.map((u) => ({
      type: 'user_created' as const,
      timestamp: u.createdAt.toISOString(),
      companyName: u.company?.name || 'Platform',
      companySlug: u.company?.slug || 'platform',
      entityId: u.id,
      entityType: 'user' as const,
      details: `User "${u.name}" (${u.email}) added to ${u.company?.name || 'Platform'}`,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);

  const ordersByStatusMap: Record<string, number> = {};
  for (const item of ordersByStatus) {
    ordersByStatusMap[item.status] = item._count;
  }

  const usersByPlatformRoleMap: Record<string, number> = {};
  for (const item of usersByPlatformRole) {
    usersByPlatformRoleMap[item.platformRole] = item._count;
  }

  const companiesWithCatalog = companiesDetail.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    isActive: c.isActive,
    counts: {
      users: c._count.users,
      orders: c._count.orders,
      customerOrgs: c._count.customerOrgs,
      catalog: {
        glassTypes: c._count.glassTypes,
        pvcProfiles: c._count.pvcProfiles,
        hardwareItems: c._count.hardwareItems,
        productTemplates: c._count.productTemplates,
        processingOptions: c._count.processingOptions,
        priceLists: c._count.priceLists,
      },
    },
  }));

  return NextResponse.json({
    totals: {
      companies: companiesCount,
      users: usersCount,
      customerOrgs: customerOrgsCount,
      orders: ordersCount,
      revenue: revenueAgg._sum.total?.toString() || '0',
    },
    ordersByStatus: ordersByStatusMap,
    usersByPlatformRole: usersByPlatformRoleMap,
    companiesDetail: companiesWithCatalog,
    recentActivity,
  });
}
