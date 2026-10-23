import { NextRequest, NextResponse } from 'next/server';
import { auditFromSession } from '@/lib/audit';
import { checkPasswordPolicy, hashPassword } from '@/lib/password-policy';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { requireRole, toHttpError } from '@/lib/rbac';

// No open registration: third parties must not self-register and order.
// Only SUPER_ADMIN or main-company COMPANY_ADMIN creates tenant users.
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const admin = session.user;

  const body = await req.json();
  const { email, password, name, customerOrgId, customerOrgRole } = body;

  if (!email || !password || !name || !customerOrgId) {
    return NextResponse.json(
      { error: 'email, password, name and customerOrgId are required' },
      { status: 400 }
    );
  }
  if (!['TENANT_ADMIN', 'TENANT_MANAGER'].includes(customerOrgRole)) {
    return NextResponse.json(
      { error: 'customerOrgRole must be TENANT_ADMIN or TENANT_MANAGER' },
      { status: 400 }
    );
  }

  const policy = checkPasswordPolicy(password, { email, name });
  if (!policy.ok) {
    return NextResponse.json({ error: policy.errors.join('. ') }, { status: 400 });
  }

  const customerOrg = await prisma.customerOrg.findUnique({ where: { id: customerOrgId } });
  if (!customerOrg) {
    return NextResponse.json({ error: 'Customer org not found' }, { status: 404 });
  }
  // Company admins can only add users to tenants of their own (main) company.
  if (admin.platformRole !== 'SUPER_ADMIN' && customerOrg.companyId !== admin.companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // The same message for every failure, so the endpoint cannot be used to
    // find out which addresses are registered.
    return NextResponse.json(
      { error: 'The user could not be created with these details' },
      { status: 400 }
    );
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      platformRole: 'CUSTOMER',
      customerOrgRole,
      companyId: customerOrg.companyId,
      customerOrgId: customerOrg.id,
    },
  });

  await auditFromSession(admin, {
    action: 'user.create',
    entity: 'User',
    entityId: user.id,
    ip: getClientIp(req.headers),
    metadata: { email, customerOrgId: customerOrg.id, customerOrgRole },
  });

  return NextResponse.json({ user: { id: user.id, email: user.email } });
}
