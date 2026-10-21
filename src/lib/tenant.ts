import { notFound } from 'next/navigation';
import { prisma } from './prisma';

/**
 * Prisma `Json` columns come back as `JsonValue`. These helpers narrow them to
 * the shape the client expects, so a malformed value in the database cannot
 * reach the browser as an unexpected type.
 */
function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(String);
}

function toNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(Number).filter((n) => Number.isFinite(n));
}

function toNumberMap(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(source)) {
    const n = Number(raw);
    if (Number.isFinite(n)) result[key] = n;
  }
  return result;
}

/**
 * Resolve a TENANT (CustomerOrg) by its subdomain slug.
 * Returns the tenant plus the single main company that owns the catalog.
 * Tenants are never Company rows; only one company (`isMainCompany`) exists.
 */
export async function getTenantBySlug(slug: string) {
  const tenant = await prisma.customerOrg.findUnique({
    where: { slug },
    include: {
      company: { select: { id: true, name: true, currency: true, isMainCompany: true } },
      priceList: { select: { id: true, discountPercent: true } },
    },
  });
  if (!tenant || !tenant.company.isMainCompany) notFound();
  return tenant;
}

/**
 * Load the main-company catalog priced for a specific tenant.
 * Order of price precedence per item:
 *   1. CustomerPriceOverride.overrideSellPrice (absolute)
 *   2. CustomerPriceOverride.discountPercent (relative)
 *   3. Base sell price
 * Cost prices are never exposed to tenants.
 */
export async function getTenantCatalog(customerOrgId: string) {
  const tenant = await prisma.customerOrg.findUnique({
    where: { id: customerOrgId },
    include: {
      company: {
        include: {
          glassTypes: { where: { isActive: true } },
          pvcProfiles: { where: { isActive: true } },
          hardwareItems: { where: { isActive: true } },
          productTemplates: { where: { isActive: true } },
          processingOptions: { where: { isActive: true } },
        },
      },
      priceList: { select: { discountPercent: true } },
      // Newest first, so the lookup below picks the most recent override when
      // more than one row exists for the same item.
      priceOverrides: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!tenant) notFound();

  // The override lookup was O(catalog × overrides) — a `find` inside a `map`.
  // A Map keyed by `${field}:${id}` makes it O(catalog + overrides).
  // The rows arrive newest-first, so the first row seen for a key wins —
  // `set` on every row would leave the oldest one in the map.
  const overrideByKey = new Map<string, (typeof tenant.priceOverrides)[number]>();
  for (const override of tenant.priceOverrides) {
    for (const field of ['glassTypeId', 'profileId', 'hardwareId', 'templateId'] as const) {
      const itemId = override[field];
      if (!itemId) continue;
      const key = `${field}:${itemId}`;
      if (!overrideByKey.has(key)) overrideByKey.set(key, override);
    }
  }

  const apply = (
    baseSell: number,
    item: { id: string },
    field: 'glassTypeId' | 'profileId' | 'hardwareId' | 'templateId'
  ) => {
    const override = overrideByKey.get(`${field}:${item.id}`);
    if (!override) return baseSell;
    if (override.overrideSellPrice != null) return Number(override.overrideSellPrice);
    if (override.discountPercent != null) {
      return Math.round(baseSell * (1 - Number(override.discountPercent) / 100) * 100) / 100;
    }
    return baseSell;
  };

  const c = tenant.company;
  return {
    company: {
      id: c.id,
      name: c.name,
      currency: c.currency,
      taxRatePercent: Number(c.taxRatePercent),
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      shippingAddress: tenant.shippingAddress,
      discountPercent: tenant.priceList ? Number(tenant.priceList.discountPercent) : 0,
    },
    glassTypes: c.glassTypes.map((g) => ({
      id: g.id,
      name: g.name,
      category: g.category,
      availableThicknessMm: toNumberArray(g.availableThicknessMm),
      isSafetyGlass: g.isSafetyGlass,
      isLowE: g.isLowE,
      soundReductionDb: g.soundReductionDb,
      baseThicknessMm: g.baseThicknessMm,
      sellPricePerSqm: apply(Number(g.sellPricePerSqm), g, 'glassTypeId'),
      thicknessSurchargePercentPerMm: Number(g.thicknessSurchargePercentPerMm),
    })),
    pvcProfiles: c.pvcProfiles.map((p) => ({
      id: p.id,
      brand: p.brand,
      systemName: p.systemName,
      chamberCount: p.chamberCount,
      installDepthMm: p.installDepthMm,
      wallThicknessClass: p.wallThicknessClass,
      colorOptions: toStringArray(p.colorOptions),
      colorSurchargeFactor: toNumberMap(p.colorSurchargeFactor),
      maxGlassThicknessMm: p.maxGlassThicknessMm,
      sellPricePerMeter: apply(Number(p.sellPricePerMeter), p, 'profileId'),
    })),
    hardwareItems: c.hardwareItems.map((h) => ({
      id: h.id,
      name: h.name,
      category: h.category,
      unit: h.unit,
      applicableKinds: toStringArray(h.applicableKinds),
      sellPrice: apply(Number(h.sellPrice), h, 'hardwareId'),
    })),
    productTemplates: c.productTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      openingCount: t.openingCount,
      complexityMultiplier: Number(t.complexityMultiplier),
      minWidthMm: t.minWidthMm,
      maxWidthMm: t.maxWidthMm,
      minHeightMm: t.minHeightMm,
      maxHeightMm: t.maxHeightMm,
    })),
    processingOptions: c.processingOptions.map((o) => ({
      id: o.id,
      name: o.name,
      unit: o.unit,
      applicableKinds: Array.isArray(o.applicableKinds) ? (o.applicableKinds as string[]) : null,
      sellPrice: Number(o.sellPrice),
    })),
  };
}
