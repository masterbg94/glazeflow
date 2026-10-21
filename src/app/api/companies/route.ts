import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, toHttpError } from '@/lib/rbac';

// Only the single main company lives in Company. Tenants are CustomerOrg —
// use /api/tenants to create them. This route now manages main company
// settings (read + patch) and lists the platform overview.

export async function GET() {
  try {
    await requireRole(['SUPER_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const companies = await prisma.company.findMany({
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
  });
  return NextResponse.json({ companies });
}

export async function POST() {
  // Creating a second Company is forbidden: exactly one main company exists.
  return NextResponse.json(
    { error: 'Creating companies is not allowed. Create a tenant via /api/tenants instead.' },
    { status: 403 }
  );
}
