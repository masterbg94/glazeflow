import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, toHttpError } from '@/lib/rbac';

const typeMap: Record<string, any> = Object.assign(Object.create(null), {
  glass: prisma.glassType,
  profiles: prisma.pvcProfile,
  hardware: prisma.hardwareItem,
  templates: prisma.productTemplate,
  processing: prisma.processingOption,
});

/** Per-type writable fields. The whole request body is never spread into Prisma. */
const fieldWhitelist: Record<string, string[]> = {
  glass: [
    'name',
    'category',
    'availableThicknessMm',
    'isSafetyGlass',
    'isLowE',
    'soundReductionDb',
    'baseThicknessMm',
    'costPricePerSqm',
    'sellPricePerSqm',
    'thicknessSurchargePercentPerMm',
    'isActive',
  ],
  profiles: [
    'brand',
    'systemName',
    'chamberCount',
    'installDepthMm',
    'wallThicknessClass',
    'colorOptions',
    'colorSurchargeFactor',
    'maxGlassThicknessMm',
    'costPricePerMeter',
    'sellPricePerMeter',
    'isActive',
  ],
  hardware: ['name', 'category', 'unit', 'costPrice', 'sellPrice', 'applicableKinds', 'isActive'],
  templates: [
    'name',
    'kind',
    'openingCount',
    'complexityMultiplier',
    'minWidthMm',
    'maxWidthMm',
    'minHeightMm',
    'maxHeightMm',
    'isActive',
  ],
  processing: ['name', 'applicableKinds', 'costPrice', 'sellPrice', 'unit', 'isActive'],
};

function pickFields(type: string, data: unknown): Record<string, unknown> {
  const allowed = fieldWhitelist[type];
  if (!allowed || !data || typeof data !== 'object' || Array.isArray(data)) return {};
  const source = data as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of allowed) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return picked;
}

async function assertMainCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isMainCompany: true },
  });
  if (!company?.isMainCompany) {
    throw new Error('Only the main company manages the catalog');
  }
}

async function resolveCompanyId(user: {
  companyId: string | null;
  platformRole: string;
}): Promise<string | null> {
  let companyId = user.companyId as string | null;
  if (!companyId && user.platformRole === 'SUPER_ADMIN') {
    const main = await prisma.company.findFirst({
      where: { isMainCompany: true },
      select: { id: true },
    });
    companyId = main?.id ?? null;
  }
  return companyId;
}

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_STAFF']);
  } catch (err) {
    return toHttpError(err);
  }
  const user = session.user;
  // Superadmin without company: read catalog of the single main company.
  const companyId = await resolveCompanyId(user);
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
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const user = session.user;
  const companyId = await resolveCompanyId(user);
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });
  await assertMainCompany(companyId);
  const body = await req.json();
  const type = body.type;
  const model = typeMap[type];
  if (!model) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  // Only whitelisted fields reach the database. Spreading the whole body let a
  // caller set `id`, `createdAt` or any other column.
  const item = await model.create({
    data: { ...pickFields(type, body.data), companyId },
  });
  return NextResponse.json({ item });
}

export async function PATCH(req: NextRequest) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const user = session.user;
  const companyId = await resolveCompanyId(user);
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });
  await assertMainCompany(companyId);

  const body = await req.json();
  const type = body.type;
  const model = typeMap[type];
  if (!model) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // The item must belong to the company the caller is acting for.
  const existing = await model.findFirst({ where: { id: body.id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  const item = await model.update({
    where: { id: body.id },
    data: pickFields(type, body.data),
  });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }
  const user = session.user;
  const companyId = await resolveCompanyId(user);
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });
  await assertMainCompany(companyId);

  const type = new URL(req.url).searchParams.get('type') || '';
  const id = new URL(req.url).searchParams.get('id') || '';
  const model = typeMap[type];
  if (!model) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const existing = await model.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  // Soft delete. A hard delete would break the foreign key from any order
  // that already references the item, and the order history must stay intact.
  const item = await model.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true, item });
}
