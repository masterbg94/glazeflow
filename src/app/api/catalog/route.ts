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

async function assertProducerCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isProducer: true },
  });
  if (!company?.isProducer) {
    throw new Error('Only producer company can manage catalog');
  }
}

export async function GET(req: NextRequest) {
  const session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_STAFF']);
  const companyId = (session.user as any).companyId;
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });
  await assertProducerCompany(companyId);
  const searchParams = new URL(req.url).searchParams;
  const type = searchParams.get('type') || 'glass';
  const model = typeMap[type];
  if (!model) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  const items = await model.findMany({ where: { companyId }, orderBy: { id: 'desc' } });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
  const companyId = (session.user as any).companyId;
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });
  await assertProducerCompany(companyId);
  const body = await req.json();
  const type = body.type;
  const model = typeMap[type];
  if (!model) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  const item = await model.create({ data: { ...body.data, companyId } });
  return NextResponse.json({ item });
}
