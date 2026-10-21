import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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
    return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 10),
      platformRole: 'CUSTOMER',
      customerOrgRole,
      companyId: customerOrg.companyId,
      customerOrgId: customerOrg.id,
    },
  });
  return NextResponse.json({ user: { id: user.id, email: user.email } });
}
