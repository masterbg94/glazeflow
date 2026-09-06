import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(['SUPER_ADMIN']);
  const { id } = await params;

  const users = await prisma.user.findMany({
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

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(['SUPER_ADMIN']);
  const { id } = await params;
  const body = await req.json();

  const { email, name, password, companyRole, platformRole = 'COMPANY_ADMIN' } = body;

  if (!email || !name || !password) {
    return NextResponse.json({ error: 'Email, name, and password are required' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'User with this email already exists' }, { status: 400 });
  }

  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
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

  return NextResponse.json({ user });
}
