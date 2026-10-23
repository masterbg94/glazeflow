import type { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { auditFromSession } from '@/lib/audit';
import { getSession } from '@/lib/auth';
import { notifyMany } from '@/lib/notifications';
import { calcItemPricing, calcTotals } from '@/lib/pricing-engine';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { validateOrderBody, ValidationError, type ValidatedOrderItem } from '@/lib/validation';

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user;

  // The `where` object is built per role. A CUSTOMER without a tenant org would
  // otherwise produce `{ customerOrgId: undefined }`; Prisma drops an
  // undefined key, the filter becomes empty, and the query returns every order
  // in the database. A company user without a company has the same problem.
  let where: Prisma.OrderWhereInput;
  if (user.platformRole === 'CUSTOMER') {
    if (!user.customerOrgId) {
      return NextResponse.json(
        { error: 'Session missing customerOrgId — please log out and log in again' },
        { status: 401 }
      );
    }
    where = { customerOrgId: user.customerOrgId };
  } else if (user.platformRole === 'SUPER_ADMIN') {
    where = {};
  } else {
    if (!user.companyId) {
      return NextResponse.json(
        { error: 'Session missing companyId — please log out and log in again' },
        { status: 401 }
      );
    }
    where = { companyId: user.companyId };
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { items: true, customerOrg: true, createdBy: { select: { name: true, email: true } } },
  });
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user;

  if (user.platformRole !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Only customers can create orders' }, { status: 403 });
  }
  if (!user.customerOrgId) {
    return NextResponse.json(
      { error: 'Session missing customerOrgId — please log out and log in again' },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let validated;
  try {
    validated = validateOrderBody(body);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
    }
    throw err;
  }

  // companyId is NEVER trusted from client: derive from tenant's customerOrg.
  const customerOrg = await prisma.customerOrg.findUnique({
    where: { id: user.customerOrgId },
    include: { priceList: true },
  });
  if (!customerOrg) {
    return NextResponse.json(
      { error: 'Customer org not found — please log out and log in again' },
      { status: 401 }
    );
  }

  const company = await prisma.company.findUnique({ where: { id: customerOrg.companyId } });
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  const companyId = company.id;

  const discountPercent = customerOrg?.priceList?.discountPercent
    ? Number(customerOrg.priceList.discountPercent)
    : 0;

  // Per-tenant price overrides (override sell price wins over override
  // discount order: overrideSellPrice > override discountPercent > base price)
  const overrides = await prisma.customerPriceOverride.findMany({
    where: { customerOrgId: customerOrg.id, isActive: true },
    // Newest first, so the lookup below picks the most recent override when
    // more than one row exists for the same item.
    orderBy: { createdAt: 'desc' },
  });
  const overrideFor = (
    field: 'glassTypeId' | 'profileId' | 'hardwareId' | 'templateId',
    id?: string | null
  ) => {
    if (!id) return undefined;
    return overrides.find((o) => o[field] === id);
  };
  const applyOverride = (basePrice: number, override?: (typeof overrides)[number]): number => {
    if (!override) return basePrice;
    if (override.overrideSellPrice != null) return Number(override.overrideSellPrice);
    if (override.discountPercent != null) {
      return Math.round(basePrice * (1 - Number(override.discountPercent) / 100) * 100) / 100;
    }
    return basePrice;
  };

  // Load every referenced catalog row in one query per model, scoped to the
  // main company and to active items. A bare id lookup would let a tenant
  // order a deactivated product or a row belonging to another company.
  const [profiles, glassTypes, hardwareItems, processingOptions, templates] = await Promise.all([
    prisma.pvcProfile.findMany({
      where: {
        companyId,
        isActive: true,
        id: { in: uniqueIds(validated.items.map((i) => i.profileId)) },
      },
    }),
    prisma.glassType.findMany({
      where: {
        companyId,
        isActive: true,
        id: {
          in: uniqueIds(validated.items.flatMap((i) => i.glassPanes.map((p) => p.glassTypeId))),
        },
      },
    }),
    prisma.hardwareItem.findMany({
      where: {
        companyId,
        isActive: true,
        id: { in: uniqueIds(validated.items.flatMap((i) => i.hardware.map((h) => h.hardwareId))) },
      },
    }),
    prisma.processingOption.findMany({
      where: {
        companyId,
        isActive: true,
        id: { in: uniqueIds(validated.items.flatMap((i) => i.processingIds)) },
      },
    }),
    prisma.productTemplate.findMany({
      where: {
        companyId,
        isActive: true,
        id: { in: uniqueIds(validated.items.map((i) => i.templateId)) },
      },
    }),
  ]);

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const glassById = new Map(glassTypes.map((g) => [g.id, g]));
  const hardwareById = new Map(hardwareItems.map((h) => [h.id, h]));
  const processingById = new Map(processingOptions.map((o) => [o.id, o]));
  const templateById = new Map(templates.map((t) => [t.id, t]));

  const computedItems = [];
  for (const item of validated.items) {
    let profileSell: number | undefined;
    let profileColorFactor = 1;
    if (item.profileId) {
      const p = profileById.get(item.profileId);
      if (!p) {
        return NextResponse.json(
          { error: `Unknown or inactive profile: ${item.profileId}`, field: 'profileId' },
          { status: 400 }
        );
      }
      profileSell = applyOverride(Number(p.sellPricePerMeter), overrideFor('profileId', p.id));
      profileColorFactor = colorSurchargeFactor(p.colorSurchargeFactor, item.profileColor);
    } else if (item.kind === 'FINISHED_WINDOW' || item.kind === 'FINISHED_DOOR') {
      // A finished unit without a frame is priced as glass + hardware only.
      return NextResponse.json(
        { error: `A ${item.kind} requires a profile`, field: 'profileId' },
        { status: 400 }
      );
    }

    const glassPanes = [];
    for (const pane of item.glassPanes) {
      const g = glassById.get(pane.glassTypeId);
      if (!g) {
        return NextResponse.json(
          {
            error: `Unknown or inactive glass type: ${pane.glassTypeId}`,
            field: 'glassTypeId',
          },
          { status: 400 }
        );
      }
      const available = Array.isArray(g.availableThicknessMm)
        ? (g.availableThicknessMm as number[]).map(Number)
        : [];
      if (available.length > 0 && !available.includes(pane.thicknessMm)) {
        return NextResponse.json(
          {
            error: `Glass type ${g.name} is not available in ${pane.thicknessMm}mm`,
            field: 'thicknessMm',
          },
          { status: 400 }
        );
      }
      glassPanes.push({
        glassTypeId: pane.glassTypeId,
        sellPricePerSqm: applyOverride(Number(g.sellPricePerSqm), overrideFor('glassTypeId', g.id)),
        baseThicknessMm: g.baseThicknessMm,
        thicknessMm: pane.thicknessMm,
        thicknessSurchargePercentPerMm: Number(g.thicknessSurchargePercentPerMm),
      });
    }

    const hardware = [];
    for (const h of item.hardware) {
      const hw = hardwareById.get(h.hardwareId);
      if (!hw) {
        return NextResponse.json(
          { error: `Unknown or inactive hardware: ${h.hardwareId}`, field: 'hardwareId' },
          { status: 400 }
        );
      }
      if (!kindMatches(hw.applicableKinds, item.kind)) {
        return NextResponse.json(
          { error: `Hardware ${hw.name} does not apply to ${item.kind}`, field: 'hardwareId' },
          { status: 400 }
        );
      }
      hardware.push({
        hardwareId: h.hardwareId,
        sellPrice: applyOverride(Number(hw.sellPrice), overrideFor('hardwareId', hw.id)),
        quantity: h.quantity,
      });
    }

    const processing = [];
    const processingItems = [];
    for (const pid of item.processingIds) {
      const po = processingById.get(pid);
      if (!po) {
        return NextResponse.json(
          { error: `Unknown or inactive processing option: ${pid}`, field: 'processingIds' },
          { status: 400 }
        );
      }
      if (!kindMatches(po.applicableKinds, item.kind)) {
        return NextResponse.json(
          {
            error: `Processing option ${po.name} does not apply to ${item.kind}`,
            field: 'processingIds',
          },
          { status: 400 }
        );
      }
      const price = applyOverride(Number(po.sellPrice), undefined);
      processing.push(price);
      processingItems.push({ processingOptionId: pid, price, quantity: 1 });
    }

    let template = null;
    let complexityMultiplier = 1;
    if (item.templateId) {
      template = templateById.get(item.templateId) ?? null;
      if (!template) {
        return NextResponse.json(
          {
            error: `Unknown or inactive product template: ${item.templateId}`,
            field: 'templateId',
          },
          { status: 400 }
        );
      }
      if (template.kind !== item.kind) {
        return NextResponse.json(
          {
            error: `Template ${template.name} does not apply to ${item.kind}`,
            field: 'templateId',
          },
          { status: 400 }
        );
      }
      complexityMultiplier = Number(template.complexityMultiplier);
      // The template carries the production limits. The wizard ships them to
      // the client but never enforced them; the server must.
      const boundsError = checkTemplateBounds(template, item);
      if (boundsError) {
        return NextResponse.json({ error: boundsError, field: 'widthMm' }, { status: 400 });
      }
    } else {
      // Without a template the product's own production limits still apply.
      const boundsError = checkDefaultBounds(item);
      if (boundsError) {
        return NextResponse.json({ error: boundsError, field: 'widthMm' }, { status: 400 });
      }
    }

    const pricing = calcItemPricing({
      kind: item.kind,
      widthMm: item.widthMm ?? undefined,
      heightMm: item.heightMm ?? undefined,
      lengthM: item.lengthM ?? undefined,
      quantity: item.quantity,
      profileSellPricePerMeter: profileSell,
      profileColorFactor,
      complexityMultiplier,
      glassPanes,
      hardware,
      processing,
    });
    computedItems.push({ ...item, pricing, glassPanes, hardware, processingItems });
  }

  const totals = calcTotals(
    computedItems.map((i) => i.pricing.lineTotal),
    discountPercent,
    Number(company.taxRatePercent)
  );
  const orderNumber = await generateOrderNumber();

  const order = await prisma.order.create({
    data: {
      companyId,
      customerOrgId: user.customerOrgId,
      createdById: user.id,
      orderNumber,
      status: 'NEW',
      currency: company.currency,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      discountAmount: totals.discountAmount,
      total: totals.total,
      shippingAddress: validated.shippingAddress,
      customerNotes: validated.customerNotes,
      requestedDate: validated.requestedDate,
      items: {
        create: computedItems.map((item) => ({
          productKind: item.kind,
          templateId: item.templateId ?? null,
          widthMm: item.widthMm ?? null,
          heightMm: item.heightMm ?? null,
          lengthM: item.lengthM ?? null,
          quantity: item.quantity,
          profileId: item.profileId ?? null,
          profileColor: item.profileColor ?? null,
          glazingLayers: item.glazingLayers,
          airGapMm: item.airGapMm,
          gasFill: item.gasFill,
          unitPrice: item.pricing.unitPrice,
          lineTotal: item.pricing.lineTotal,
          status: 'PENDING',
          glassPanes: {
            // Each pane carries its own price. Splitting the total glass cost
            // evenly billed a 4mm pane the same as a 10mm one.
            create: item.glassPanes.map((p, idx) => ({
              glassTypeId: p.glassTypeId,
              paneIndex: idx + 1,
              thicknessMm: p.thicknessMm,
              areaSqm: item.pricing.areaSqm ?? 0,
              price: item.pricing.panePrices[idx] ?? 0,
            })),
          },
          hardware: {
            create: item.hardware.map((h) => ({
              hardwareId: h.hardwareId,
              quantity: h.quantity,
              price: h.sellPrice * h.quantity,
            })),
          },
          processing: {
            create: item.processingItems.map((p) => ({
              processingOptionId: p.processingOptionId,
              quantity: p.quantity,
              price: p.price,
            })),
          },
        })),
      },
      statusHistory: { create: { toStatus: 'NEW', note: 'Order placed' } },
    },
    include: { items: true },
  });

  await auditFromSession(user, {
    action: 'order.create',
    entity: 'Order',
    entityId: order.id,
    ip: getClientIp(req.headers),
    metadata: {
      orderNumber: order.orderNumber,
      customerOrgId: user.customerOrgId,
      total: order.total.toString(),
      currency: order.currency,
      itemCount: computedItems.length,
    },
  });

  const staff = await prisma.user.findMany({
    where: { companyId, platformRole: { in: ['COMPANY_ADMIN', 'COMPANY_STAFF'] } },
  });
  await notifyMany({
    userIds: staff.map((s) => s.id),
    event: 'ORDER_CREATED',
    title: `New order ${order.orderNumber}`,
    body: `Order from ${customerOrg?.name}: ${totals.total} ${company.currency}`,
    orderId: order.id,
    email: true,
  });

  return NextResponse.json({ order });
}

/** Distinct, non-null ids for a Prisma `in` filter. */
function uniqueIds(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))];
}

/** `applicableKinds` is a nullable JSON array; null or empty means "all kinds". */
function kindMatches(applicableKinds: unknown, kind: string): boolean {
  if (!Array.isArray(applicableKinds) || applicableKinds.length === 0) return true;
  return applicableKinds.map(String).includes(kind);
}

/**
 * `colorSurchargeFactor` is a JSON map from colour name to factor, e.g.
 * `{ "Golden Oak": 1.15 }`. A missing entry means no surcharge.
 */
function colorSurchargeFactor(raw: unknown, color: string | null): number {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 1;
  const map = raw as Record<string, unknown>;
  const key = color ?? '';
  const factor = map[key];
  if (typeof factor === 'number' && Number.isFinite(factor) && factor > 0) return factor;
  return 1;
}

interface TemplateBounds {
  minWidthMm: number;
  maxWidthMm: number;
  minHeightMm: number;
  maxHeightMm: number;
}

function checkTemplateBounds(
  template: {
    minWidthMm: number;
    maxWidthMm: number;
    minHeightMm: number;
    maxHeightMm: number;
  },
  item: ValidatedOrderItem
): string | null {
  if (item.widthMm === null || item.heightMm === null) return null;
  if (item.widthMm < template.minWidthMm || item.widthMm > template.maxWidthMm) {
    return `Width must be between ${template.minWidthMm} and ${template.maxWidthMm} mm`;
  }
  if (item.heightMm < template.minHeightMm || item.heightMm > template.maxHeightMm) {
    return `Height must be between ${template.minHeightMm} and ${template.maxHeightMm} mm`;
  }
  return null;
}

/** The schema default bounds, applied when no template is chosen. */
const DEFAULT_BOUNDS: TemplateBounds = {
  minWidthMm: 300,
  maxWidthMm: 3000,
  minHeightMm: 300,
  maxHeightMm: 3000,
};

function checkDefaultBounds(item: ValidatedOrderItem): string | null {
  return checkTemplateBounds(DEFAULT_BOUNDS, item);
}

/**
 * `GF-<year>-<6 digits>`. The number is unique-constrained, so a collision has
 * to be retried rather than surfaced as a 500.
 */
async function generateOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `GF-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const existing = await prisma.order.findUnique({ where: { orderNumber: candidate } });
    if (!existing) return candidate;
  }
  // Fall back to a value that cannot collide.
  return `GF-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}
