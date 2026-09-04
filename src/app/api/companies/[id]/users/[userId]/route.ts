import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await requireRole(['SUPER_ADMIN']);
  const { id, userId } = await params;

  const user = await prisma.user.findFirst({
    where: { id: userId, companyId: id },
  });

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
  const session = await requireRole(['SUPER_ADMIN']);
  const { id, userId } = await params;
  const body = await req.json();

  const user = await prisma.user.findFirst({
    where: { id: userId, companyId: id },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { name, phone, companyRole, isActive } = body;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name && { name }),
      ...(phone !== undefined && { phone }),
      ...(companyRole && { companyRole }),
      ...(isActive !== undefined && { isActive }),
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

  return NextResponse.json({ user: updated });
}
