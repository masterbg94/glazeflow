import { NextRequest, NextResponse } from 'next/server';
import { auditFromSession } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { requireRole, toHttpError } from '@/lib/rbac';

// Tenants = CustomerOrg rows under the single main company.
// Tenant company rows (Company model) must never be created.

async function resolveMainCompanyId(user: {
  companyId: string | null;
  platformRole: string;
}): Promise<string | null> {
  let companyId = user.companyId as string | null;
  if (!companyId && user.platformRole === 'SUPER_ADMIN') {
    const main = await prisma.company.findFirst({
      where: { isMainCompany: true },
      select: { id: true },
    });
    companyId = main?.id ?? null;
  }
  return companyId;
}

export async function GET() {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const user = session.user;

  const companyId = await resolveMainCompanyId(user);
  if (!companyId) return NextResponse.json({ error: 'No main company' }, { status: 400 });

  // POST asserts `isMainCompany`; GET must assert it too, otherwise a
  // COMPANY_ADMIN of a non-main company would receive that company's tenants.
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isMainCompany: true },
  });
  if (!company?.isMainCompany) {
    return NextResponse.json({ error: 'Only the main company can own tenants' }, { status: 403 });
  }

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
  const user = session.user;
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
  if (slug.length > 63) {
    return NextResponse.json({ error: 'slug is too long' }, { status: 400 });
  }

  // Resolve the single main company
  const companyId = await resolveMainCompanyId(user);
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

  // Per-tenant price list: optional discount/margin chosen at creation.
  // The price-list name is unique per company, so the slug is appended to keep
  // two tenants with the same name apart.
  const discount = Number(discountPercent) || 0;

  // One transaction: a failure on the second insert used to leave an orphan
  // PriceList row behind.
  const tenant = await prisma.$transaction(async (tx) => {
    const priceList = await tx.priceList.create({
      data: { companyId, name: `${name} cenovnik (${slug})`, discountPercent: discount },
    });
    return tx.customerOrg.create({
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
  });

  await auditFromSession(user, {
    action: 'tenant.create',
    entity: 'CustomerOrg',
    entityId: tenant.id,
    ip: getClientIp(req.headers),
    metadata: { name, slug, discountPercent: discount },
  });

  return NextResponse.json({ tenant });
}
