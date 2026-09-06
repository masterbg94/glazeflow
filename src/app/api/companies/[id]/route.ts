import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(['SUPER_ADMIN']);
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: { _count: { select: { users: true, orders: true } } },
  });

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  return NextResponse.json({ company });
}
