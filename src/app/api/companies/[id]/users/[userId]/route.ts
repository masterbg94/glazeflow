import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, toHttpError } from '@/lib/rbac';

async function findUserAndEntity(id: string, userId: string) {
  // Check if it's a Company or CustomerOrg (tenant)
  const company = await prisma.company.findUnique({ where: { id }, select: { id: true } });

  if (company) {
    const user = await prisma.user.findFirst({
      where: { id: userId, companyId: id },
    });
    return { user, entityType: 'company' as const };
  } else {
    const tenant = await prisma.customerOrg.findUnique({ where: { id }, select: { id: true } });
    if (!tenant) return { user: null, entityType: 'tenant' as const };
    const user = await prisma.user.findFirst({
      where: { id: userId, customerOrgId: id },
    });
    return { user, entityType: 'tenant' as const };
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const { id, userId } = await params;

  const { user } = await findUserAndEntity(id, userId);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const { id, userId } = await params;
  const body = await req.json();

  const { user, entityType } = await findUserAndEntity(id, userId);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { name, phone, companyRole, customerOrgRole, isActive } = body;

  // The role field must match the entity that owns the user. Setting both
  // fields independently let a tenant member receive `companyRole:
  // COMPANY_ADMIN`, which is the value the transition-approval gate checks.
  if (companyRole && entityType !== 'company') {
    return NextResponse.json(
      { error: 'companyRole can only be set on a company user' },
      { status: 400 }
    );
  }
  if (customerOrgRole && entityType !== 'tenant') {
    return NextResponse.json(
      { error: 'customerOrgRole can only be set on a tenant user' },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name && { name }),
      ...(phone !== undefined && { phone }),
      ...(companyRole && { companyRole }),
      ...(customerOrgRole && { customerOrgRole }),
      ...(isActive !== undefined && { isActive }),
    },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      platformRole: true,
      companyRole: true,
      customerOrgRole: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user: updated });
}
