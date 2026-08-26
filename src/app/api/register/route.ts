import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const { email, password, name, companySlug } = await req.json();
  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
  const customerOrg = await prisma.customerOrg.findFirst({ where: { companyId: company.id } });
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 10),
      platformRole: 'CUSTOMER',
      companyId: company.id,
      customerOrgId: customerOrg?.id,
    },
  });
  return NextResponse.json({ user: { id: user.id, email: user.email } });
}
