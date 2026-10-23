import { NextRequest, NextResponse } from 'next/server';
import { auditFromSession } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { requireRole, toHttpError } from '@/lib/rbac';

/**
 * Update one tenant.
 *
 * Assigning a price list was impossible before: a price list was only ever
 * created as a side effect of tenant creation, and nothing could change the
 * assignment afterwards.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const user = session.user;
  const { id } = await params;

  const tenant = await prisma.customerOrg.findUnique({
    where: { id },
    select: { id: true, companyId: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }
  if (user.platformRole !== 'SUPER_ADMIN' && tenant.companyId !== user.companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    data.name = body.name.trim();
  }
  if (body.taxId !== undefined) data.taxId = body.taxId || null;
  if (body.billingAddress !== undefined) data.billingAddress = body.billingAddress || null;
  if (body.shippingAddress !== undefined) data.shippingAddress = body.shippingAddress || null;

  if (body.priceListId !== undefined) {
    if (body.priceListId === null || body.priceListId === '') {
      data.priceListId = null;
    } else {
      const priceList = await prisma.priceList.findFirst({
        where: { id: body.priceListId, companyId: tenant.companyId },
        select: { id: true },
      });
      if (!priceList) {
        return NextResponse.json({ error: 'Unknown price list for this company' }, { status: 400 });
      }
      data.priceListId = priceList.id;
    }
  }

  const updated = await prisma.customerOrg.update({
    where: { id: tenant.id },
    data,
    include: { priceList: { select: { id: true, name: true, discountPercent: true } } },
  });

  await auditFromSession(user, {
    action: 'tenant.update',
    entity: 'CustomerOrg',
    entityId: tenant.id,
    ip: getClientIp(req.headers),
    metadata: { data: Object.keys(data) },
  });

  return NextResponse.json({
    tenant: {
      ...updated,
      priceList: updated.priceList
        ? { ...updated.priceList, discountPercent: updated.priceList.discountPercent.toString() }
        : null,
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const { id } = await params;

  const tenant = await prisma.customerOrg.findUnique({
    where: { id },
    select: { id: true, _count: { select: { orders: true, members: true } } },
  });
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }
  // A tenant with orders or members must not disappear: the order history
  // would be orphaned.
  if (tenant._count.orders > 0 || tenant._count.members > 0) {
    return NextResponse.json(
      { error: 'Cannot delete a tenant that has orders or members' },
      { status: 409 }
    );
  }

  await prisma.customerOrg.delete({ where: { id: tenant.id } });
  await auditFromSession(session.user, {
    action: 'tenant.delete',
    entity: 'CustomerOrg',
    entityId: tenant.id,
    ip: getClientIp(req.headers),
  });
  return NextResponse.json({ success: true });
}
