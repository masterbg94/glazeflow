import { notFound } from 'next/navigation';
import { prisma } from './prisma';

export async function getCompanyBySlug(slug: string) {
  const company = await prisma.company.findUnique({
    where: { slug },
    include: {
      glassTypes: { where: { isActive: true } },
      pvcProfiles: { where: { isActive: true } },
      hardwareItems: { where: { isActive: true } },
      productTemplates: { where: { isActive: true } },
      processingOptions: { where: { isActive: true } },
    },
  });
  if (!company || !company.isActive) notFound();
  return company;
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
      priceOverrides: { where: { isActive: true } },
    },
  });
  if (!tenant) notFound();

  const apply = <T extends { id: string }>(
    baseSell: number,
    items: T[],
    item: T,
    field: 'glassTypeId' | 'profileId' | 'hardwareId' | 'templateId'
  ) => {
    const override = tenant.priceOverrides.find((o) => o[field] === item.id);
    if (!override) return baseSell;
    if (override.overrideSellPrice != null) return Number(override.overrideSellPrice);
    if (override.discountPercent != null) {
      return Math.round(baseSell * (1 - Number(override.discountPercent) / 100) * 100) / 100;
    }
    return baseSell;
  };

  const c = tenant.company;
  return {
    company: { id: c.id, name: c.name, currency: c.currency },
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
      availableThicknessMm: g.availableThicknessMm,
      isSafetyGlass: g.isSafetyGlass,
      isLowE: g.isLowE,
      soundReductionDb: g.soundReductionDb,
      baseThicknessMm: g.baseThicknessMm,
      sellPricePerSqm: apply(Number(g.sellPricePerSqm), c.glassTypes, g, 'glassTypeId'),
      thicknessSurchargePercentPerMm: Number(g.thicknessSurchargePercentPerMm),
    })),
    pvcProfiles: c.pvcProfiles.map((p) => ({
      id: p.id,
      brand: p.brand,
      systemName: p.systemName,
      chamberCount: p.chamberCount,
      installDepthMm: p.installDepthMm,
      wallThicknessClass: p.wallThicknessClass,
      colorOptions: p.colorOptions,
      maxGlassThicknessMm: p.maxGlassThicknessMm,
      sellPricePerMeter: apply(Number(p.sellPricePerMeter), c.pvcProfiles, p, 'profileId'),
    })),
    hardwareItems: c.hardwareItems.map((h) => ({
      id: h.id,
      name: h.name,
      category: h.category,
      unit: h.unit,
      applicableKinds: Array.isArray(h.applicableKinds) ? (h.applicableKinds as string[]) : null,
      sellPrice: apply(Number(h.sellPrice), c.hardwareItems, h, 'hardwareId'),
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
