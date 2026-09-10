import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, toHttpError } from '@/lib/rbac';

// Tenants = CustomerOrg rows under the single main company.
// Tenant company rows (Company model) must never be created.

export async function GET() {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const user = session.user as any;

  let companyId = user.companyId as string | null;
  if (!companyId && user.platformRole === 'SUPER_ADMIN') {
    const main = await prisma.company.findFirst({
      where: { isMainCompany: true },
      select: { id: true },
    });
    companyId = main?.id ?? null;
  }
  if (!companyId) return NextResponse.json({ error: 'No main company' }, { status: 400 });

  const tenants = await prisma.customerOrg.findMany({
    where: { companyId },
    include: {
      priceList: { select: { id: true, name: true, discountPercent: true } },
      _count: { select: { orders: true, members: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    tenants: tenants.map((t) => ({
      ...t,
      priceList: t.priceList
        ? { ...t.priceList, discountPercent: t.priceList.discountPercent.toString() }
        : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const user = session.user as any;
  const body = await req.json();
  const { name, slug, taxId, billingAddress, shippingAddress, discountPercent } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: 'name and slug are required' }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: 'slug must be lowercase letters, digits, dashes' },
      { status: 400 }
    );
  }

  // Resolve the single main company
  let companyId = user.companyId as string | null;
  if (!companyId && user.platformRole === 'SUPER_ADMIN') {
    const main = await prisma.company.findFirst({
      where: { isMainCompany: true },
      select: { id: true },
    });
    companyId = main?.id ?? null;
  }
  if (!companyId) return NextResponse.json({ error: 'No main company' }, { status: 400 });

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isMainCompany: true },
  });
  if (!company?.isMainCompany) {
    return NextResponse.json({ error: 'Only the main company can own tenants' }, { status: 403 });
  }

  const exists = await prisma.customerOrg.findUnique({ where: { slug } });
  if (exists) return NextResponse.json({ error: 'Slug already taken' }, { status: 409 });

  // Per-tenant price list: optional discount/margin chosen at creation
  const discount = Number(discountPercent) || 0;
  const priceList = await prisma.priceList.create({
    data: { companyId, name: `${name} cenovnik`, discountPercent: discount },
  });

  const tenant = await prisma.customerOrg.create({
    data: {
      companyId,
      name,
      slug,
      taxId: taxId || null,
      billingAddress: billingAddress || null,
      shippingAddress: shippingAddress || null,
      priceListId: priceList.id,
    },
  });

  return NextResponse.json({ tenant });
}
