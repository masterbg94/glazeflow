import { NextRequest, NextResponse } from 'next/server';
import { auditFromSession } from '@/lib/audit';
import { checkPasswordPolicy, hashPassword } from '@/lib/password-policy';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { requireRole, toHttpError } from '@/lib/rbac';

const COMPANY_ROLES = ['COMPANY_ADMIN', 'COMPANY_SALES', 'COMPANY_PRODUCTION'] as const;
const CUSTOMER_ORG_ROLES = ['TENANT_ADMIN', 'TENANT_MANAGER'] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const { id } = await params;

  // Check if it's a Company or CustomerOrg (tenant)
  const company = await prisma.company.findUnique({ where: { id }, select: { id: true } });

  let users: any[] = [];

  if (company) {
    // Company users
    users = await prisma.user.findMany({
      where: { companyId: id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        platformRole: true,
        companyRole: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  } else {
    // Tenant users (CustomerOrg members)
    const tenant = await prisma.customerOrg.findUnique({ where: { id }, select: { id: true } });
    if (tenant) {
      users = await prisma.user.findMany({
        where: { customerOrgId: id },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          platformRole: true,
          customerOrgRole: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }
  }

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const { id } = await params;
  const body = await req.json();

  const { email, name, password, companyRole, customerOrgRole } = body;

  if (!email || !name || !password) {
    return NextResponse.json({ error: 'Email, name, and password are required' }, { status: 400 });
  }

  if (companyRole && !COMPANY_ROLES.includes(companyRole)) {
    return NextResponse.json({ error: 'Invalid companyRole' }, { status: 400 });
  }
  if (customerOrgRole && !CUSTOMER_ORG_ROLES.includes(customerOrgRole)) {
    return NextResponse.json({ error: 'Invalid customerOrgRole' }, { status: 400 });
  }

  const policy = checkPasswordPolicy(password, { email, name });
  if (!policy.ok) {
    return NextResponse.json({ error: policy.errors.join('. ') }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // One message for every rejection, so the endpoint cannot be used to
    // find out which addresses exist.
    return NextResponse.json(
      { error: 'The user could not be created with these details' },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(password);

  // Check if it's a Company or CustomerOrg (tenant)
  const company = await prisma.company.findUnique({ where: { id }, select: { id: true } });

  let user: any;

  if (company) {
    // Create company user. `platformRole` is derived from the context, never
    // taken from the request body: a body-supplied role let a SUPER_ADMIN mint
    // another SUPER_ADMIN.
    user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        platformRole: 'COMPANY_ADMIN',
        companyRole: companyRole || 'COMPANY_ADMIN',
        companyId: id,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        platformRole: true,
        companyRole: true,
        isActive: true,
        createdAt: true,
      },
    });
    await auditFromSession(session.user, {
      action: 'user.create',
      entity: 'User',
      entityId: user.id,
      ip: getClientIp(req.headers),
      metadata: { email, scope: 'company', companyId: id, companyRole: user.companyRole },
    });
  } else {
    // Create tenant user
    const tenant = await prisma.customerOrg.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        platformRole: 'CUSTOMER',
        customerOrgRole: customerOrgRole || 'TENANT_MANAGER',
        companyId: tenant.companyId,
        customerOrgId: id,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        platformRole: true,
        customerOrgRole: true,
        isActive: true,
        createdAt: true,
      },
    });
    await auditFromSession(session.user, {
      action: 'user.create',
      entity: 'User',
      entityId: user.id,
      ip: getClientIp(req.headers),
      metadata: {
        email,
        scope: 'tenant',
        customerOrgId: id,
        customerOrgRole: user.customerOrgRole,
      },
    });
  }

  return NextResponse.json({ user });
}
