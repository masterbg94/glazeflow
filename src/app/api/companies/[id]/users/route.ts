import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(['SUPER_ADMIN']);
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
  const session = await requireRole(['SUPER_ADMIN']);
  const { id } = await params;
  const body = await req.json();

  const { email, name, password, companyRole, customerOrgRole, platformRole = 'COMPANY_ADMIN' } = body;

  if (!email || !name || !password) {
    return NextResponse.json({ error: 'Email, name, and password are required' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'User with this email already exists' }, { status: 400 });
  }

  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash(password, 12);

  // Check if it's a Company or CustomerOrg (tenant)
  const company = await prisma.company.findUnique({ where: { id }, select: { id: true } });
  
  let user: any;

  if (company) {
    // Create company user
    user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        platformRole,
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
  } else {
    // Create tenant user
    const tenant = await prisma.customerOrg.findUnique({ where: { id }, select: { id: true, companyId: true } });
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
  }

  return NextResponse.json({ user });
}