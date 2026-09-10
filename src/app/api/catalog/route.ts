import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';

const typeMap: Record<string, any> = {
  glass: prisma.glassType,
  profiles: prisma.pvcProfile,
  hardware: prisma.hardwareItem,
  templates: prisma.productTemplate,
  processing: prisma.processingOption,
};

async function assertMainCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isMainCompany: true },
  });
  if (!company?.isMainCompany) {
    throw new Error('Only the main company manages the catalog');
  }
}

export async function GET(req: NextRequest) {
  const session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_STAFF']);
  const user = session.user as any;
  // Superadmin without company: read catalog of the single main company.
  let companyId = user.companyId as string | null;
  if (!companyId && user.platformRole === 'SUPER_ADMIN') {
    const main = await prisma.company.findFirst({
      where: { isMainCompany: true },
      select: { id: true },
    });
    companyId = main?.id ?? null;
  }
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });
  await assertMainCompany(companyId);
  const searchParams = new URL(req.url).searchParams;
  const type = searchParams.get('type') || 'glass';
  const model = typeMap[type];
  if (!model) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  const items = await model.findMany({ where: { companyId }, orderBy: { id: 'desc' } });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  // Catalog writes: main company admin or superadmin only. Managers/workers no.
  const session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
  const user = session.user as any;
  let companyId = user.companyId as string | null;
  if (!companyId && user.platformRole === 'SUPER_ADMIN') {
    const main = await prisma.company.findFirst({
      where: { isMainCompany: true },
      select: { id: true },
    });
    companyId = main?.id ?? null;
  }
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });
  await assertMainCompany(companyId);
  const body = await req.json();
  const type = body.type;
  const model = typeMap[type];
  if (!model) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  const item = await model.create({ data: { ...body.data, companyId } });
  return NextResponse.json({ item });
}
