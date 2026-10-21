import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, toHttpError } from '@/lib/rbac';

/**
 * Per-tenant price overrides.
 *
 * This is the third level of the price precedence:
 *   1. `overrideSellPrice`  — an absolute price for this tenant
 *   2. `discountPercent`     — a percentage off the base price
 *   3. the base sell price
 *
 * The table was read in two places but nothing could write it, so the
 * documented precedence was only two levels deep in practice.
 */

const OVERRIDE_FIELDS = ['glassTypeId', 'profileId', 'hardwareId', 'templateId'] as const;

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const user = session.user;

  const customerOrgId = req.nextUrl.searchParams.get('customerOrgId');
  if (!customerOrgId) {
    return NextResponse.json({ error: 'customerOrgId is required' }, { status: 400 });
  }

  const tenant = await prisma.customerOrg.findUnique({
    where: { id: customerOrgId },
    select: { id: true, companyId: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }
  // A company admin may only manage the tenants of their own company.
  if (user.platformRole !== 'SUPER_ADMIN' && tenant.companyId !== user.companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const overrides = await prisma.customerPriceOverride.findMany({
    where: { customerOrgId: tenant.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    overrides: overrides.map((o) => ({
      ...o,
      overrideSellPrice: o.overrideSellPrice?.toString() ?? null,
      discountPercent: o.discountPercent?.toString() ?? null,
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
  const { customerOrgId, glassTypeId, profileId, hardwareId, templateId } = body;

  if (!customerOrgId) {
    return NextResponse.json({ error: 'customerOrgId is required' }, { status: 400 });
  }

  const tenant = await prisma.customerOrg.findUnique({
    where: { id: customerOrgId },
    select: { id: true, companyId: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }
  if (user.platformRole !== 'SUPER_ADMIN' && tenant.companyId !== user.companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Exactly one catalog item may be referenced.
  const targets = [glassTypeId, profileId, hardwareId, templateId].filter(Boolean);
  if (targets.length !== 1) {
    return NextResponse.json(
      { error: 'Set exactly one of glassTypeId, profileId, hardwareId or templateId' },
      { status: 400 }
    );
  }

  // The referenced catalog item must belong to the same company as the tenant.
  if (glassTypeId) {
    const item = await prisma.glassType.findFirst({
      where: { id: glassTypeId, companyId: tenant.companyId },
    });
    if (!item) {
      return NextResponse.json(
        { error: `Unknown catalog item for glassTypeId: ${glassTypeId}` },
        { status: 400 }
      );
    }
  }
  if (profileId) {
    const item = await prisma.pvcProfile.findFirst({
      where: { id: profileId, companyId: tenant.companyId },
    });
    if (!item) {
      return NextResponse.json(
        { error: `Unknown catalog item for profileId: ${profileId}` },
        { status: 400 }
      );
    }
  }
  if (hardwareId) {
    const item = await prisma.hardwareItem.findFirst({
      where: { id: hardwareId, companyId: tenant.companyId },
    });
    if (!item) {
      return NextResponse.json(
        { error: `Unknown catalog item for hardwareId: ${hardwareId}` },
        { status: 400 }
      );
    }
  }
  if (templateId) {
    const item = await prisma.productTemplate.findFirst({
      where: { id: templateId, companyId: tenant.companyId },
    });
    if (!item) {
      return NextResponse.json(
        { error: `Unknown catalog item for templateId: ${templateId}` },
        { status: 400 }
      );
    }
  }

  const hasAbsolute = body.overrideSellPrice !== undefined && body.overrideSellPrice !== null;
  const hasPercent = body.discountPercent !== undefined && body.discountPercent !== null;
  if (!hasAbsolute && !hasPercent) {
    return NextResponse.json(
      { error: 'Set overrideSellPrice or discountPercent' },
      { status: 400 }
    );
  }
  if (hasAbsolute && hasPercent) {
    return NextResponse.json(
      { error: 'Set overrideSellPrice or discountPercent, not both' },
      { status: 400 }
    );
  }

  if (hasAbsolute && Number(body.overrideSellPrice) < 0) {
    return NextResponse.json({ error: 'overrideSellPrice must not be negative' }, { status: 400 });
  }
  if (hasPercent && (Number(body.discountPercent) < 0 || Number(body.discountPercent) > 100)) {
    return NextResponse.json(
      { error: 'discountPercent must be between 0 and 100' },
      { status: 400 }
    );
  }

  // One override per catalog item per tenant. The price lookup uses
  // `find`, so two rows for the same item would make the winning price
  // arbitrary.
  const existing = await prisma.customerPriceOverride.findFirst({
    where: {
      customerOrgId: tenant.id,
      OR: [
        ...(glassTypeId ? [{ glassTypeId }] : []),
        ...(profileId ? [{ profileId }] : []),
        ...(hardwareId ? [{ hardwareId }] : []),
        ...(templateId ? [{ templateId }] : []),
      ],
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'An override for this item already exists — update it instead' },
      { status: 409 }
    );
  }

  const override = await prisma.customerPriceOverride.create({
    data: {
      companyId: tenant.companyId,
      customerOrgId: tenant.id,
      glassTypeId: glassTypeId ?? null,
      profileId: profileId ?? null,
      hardwareId: hardwareId ?? null,
      templateId: templateId ?? null,
      overrideSellPrice: hasAbsolute ? Number(body.overrideSellPrice) : null,
      discountPercent: hasPercent ? Number(body.discountPercent) : null,
      isActive: body.isActive ?? true,
    },
  });

  return NextResponse.json({
    override: {
      ...override,
      overrideSellPrice: override.overrideSellPrice?.toString() ?? null,
      discountPercent: override.discountPercent?.toString() ?? null,
    },
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

  const body = await req.json();
  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const override = await prisma.customerPriceOverride.findUnique({
    where: { id: body.id },
    select: { id: true, customerOrgId: true, companyId: true },
  });
  if (!override) {
    return NextResponse.json({ error: 'Override not found' }, { status: 404 });
  }
  if (user.platformRole !== 'SUPER_ADMIN' && override.companyId !== user.companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (body.overrideSellPrice !== undefined) {
    if (body.overrideSellPrice === null) data.overrideSellPrice = null;
    else if (Number(body.overrideSellPrice) < 0) {
      return NextResponse.json(
        { error: 'overrideSellPrice must not be negative' },
        { status: 400 }
      );
    } else data.overrideSellPrice = Number(body.overrideSellPrice);
  }
  if (body.discountPercent !== undefined) {
    if (body.discountPercent === null) data.discountPercent = null;
    else if (Number(body.discountPercent) < 0 || Number(body.discountPercent) > 100) {
      return NextResponse.json(
        { error: 'discountPercent must be between 0 and 100' },
        { status: 400 }
      );
    } else data.discountPercent = Number(body.discountPercent);
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const updated = await prisma.customerPriceOverride.update({
    where: { id: body.id },
    data,
  });

  return NextResponse.json({
    override: {
      ...updated,
      overrideSellPrice: updated.overrideSellPrice?.toString() ?? null,
      discountPercent: updated.discountPercent?.toString() ?? null,
    },
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

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const override = await prisma.customerPriceOverride.findUnique({
    where: { id },
    select: { id: true, companyId: true },
  });
  if (!override) {
    return NextResponse.json({ error: 'Override not found' }, { status: 404 });
  }
  if (user.platformRole !== 'SUPER_ADMIN' && override.companyId !== user.companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.customerPriceOverride.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
