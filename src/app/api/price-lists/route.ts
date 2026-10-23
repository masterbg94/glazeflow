import { NextRequest, NextResponse } from 'next/server';
import { auditFromSession } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { requireRole, toHttpError } from '@/lib/rbac';

/**
 * Price lists — the B2B discount tiers.
 *
 * A price list was only ever created as a side effect of tenant creation, so
 * the seeded "Bronzni prodavac" and "Zlatni prodavac" tiers could never be
 * assigned to a tenant.
 */

async function resolveCompanyId(user: {
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

  const companyId = await resolveCompanyId(user);
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });

  const priceLists = await prisma.priceList.findMany({
    where: { companyId },
    include: { _count: { select: { customers: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    priceLists: priceLists.map((p) => ({
      ...p,
      discountPercent: p.discountPercent.toString(),
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

  const companyId = await resolveCompanyId(user);
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });

  const body = await req.json();
  const { name, discountPercent } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const discount = Number(discountPercent) || 0;
  if (discount < 0 || discount > 100) {
    return NextResponse.json(
      { error: 'discountPercent must be between 0 and 100' },
      { status: 400 }
    );
  }

  const existing = await prisma.priceList.findUnique({
    where: { companyId_name: { companyId, name } },
  });
  if (existing) {
    return NextResponse.json({ error: 'A price list with that name exists' }, { status: 409 });
  }

  const priceList = await prisma.priceList.create({
    data: { companyId, name, discountPercent: discount },
  });

  await auditFromSession(user, {
    action: 'pricelist.create',
    entity: 'PriceList',
    entityId: priceList.id,
    ip: getClientIp(req.headers),
    metadata: { name, discountPercent: discount },
  });

  return NextResponse.json({
    priceList: { ...priceList, discountPercent: priceList.discountPercent.toString() },
  });
}

export async function PATCH(req: NextRequest) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const user = session.user;

  const companyId = await resolveCompanyId(user);
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });

  const body = await req.json();
  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const existing = await prisma.priceList.findFirst({ where: { id: body.id, companyId } });
  if (!existing) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    data.name = body.name;
  }
  if (body.discountPercent !== undefined) {
    const discount = Number(body.discountPercent);
    if (Number.isNaN(discount) || discount < 0 || discount > 100) {
      return NextResponse.json(
        { error: 'discountPercent must be between 0 and 100' },
        { status: 400 }
      );
    }
    data.discountPercent = discount;
  }
  if (body.isDefault !== undefined) data.isDefault = Boolean(body.isDefault);

  const updated = await prisma.priceList.update({ where: { id: body.id }, data });

  await auditFromSession(user, {
    action: 'pricelist.update',
    entity: 'PriceList',
    entityId: updated.id,
    ip: getClientIp(req.headers),
    metadata: {
      before: { name: existing.name, discountPercent: existing.discountPercent.toString() },
      after: { name: updated.name, discountPercent: updated.discountPercent.toString() },
    },
  });

  return NextResponse.json({
    priceList: { ...updated, discountPercent: updated.discountPercent.toString() },
  });
}

export async function DELETE(req: NextRequest) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const user = session.user;

  const companyId = await resolveCompanyId(user);
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const existing = await prisma.priceList.findFirst({
    where: { id, companyId },
    include: { _count: { select: { customers: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Price list not found' }, { status: 404 });
  }
  // Deleting a list that tenants point at would leave them without a tier.
  if (existing._count.customers > 0) {
    return NextResponse.json(
      { error: 'Cannot delete a price list that is assigned to a tenant' },
      { status: 409 }
    );
  }

  await prisma.priceList.delete({ where: { id } });
  await auditFromSession(user, {
    action: 'pricelist.delete',
    entity: 'PriceList',
    entityId: id,
    ip: getClientIp(req.headers),
    metadata: { name: existing.name },
  });
  return NextResponse.json({ success: true });
}
