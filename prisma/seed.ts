import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("Password123!", 10);

  await prisma.user.upsert({
    where: { email: "superadmin@glazeflow.app" },
    update: {},
    create: { email: "superadmin@glazeflow.app", name: "Platform Owner", passwordHash: hash, platformRole: "SUPER_ADMIN" },
  });

  const acme = await prisma.company.create({
    data: {
      name: "Acme Glass & PVC Systems",
      slug: "acme",
      tagline: "Precision glass & PVC manufactured in EU",
      primaryColor: "#1d4ed8",
      secondaryColor: "#0f172a",
      accentColor: "#f59e0b",
      currency: "USD",
      taxRatePercent: 8,
      defaultMarkupPercent: 25,
    },
  });

  await prisma.user.create({
    data: { email: "admin@acme.test", name: "Acme Admin", passwordHash: hash, platformRole: "COMPANY_ADMIN", companyId: acme.id },
  });

  await prisma.glassType.createMany({
    data: [
      { companyId: acme.id, name: "Clear Float", category: "float", availableThicknessMm: [4,5,6,8], baseThicknessMm: 4, costPricePerSqm: 22, sellPricePerSqm: 32 },
      { companyId: acme.id, name: "Tempered Safety", category: "tempered", availableThicknessMm: [4,5,6,8,10,12], baseThicknessMm: 4, costPricePerSqm: 34, sellPricePerSqm: 49, isSafetyGlass: true },
      { companyId: acme.id, name: "Low-E Energy", category: "lowE", availableThicknessMm: [4,6,8], baseThicknessMm: 4, costPricePerSqm: 38, sellPricePerSqm: 55, isLowE: true },
      { companyId: acme.id, name: "Laminated Acoustic", category: "laminated", availableThicknessMm: [6,8,10,12], baseThicknessMm: 6, costPricePerSqm: 46, sellPricePerSqm: 68, isSafetyGlass: true, soundReductionDb: 38 },
    ],
  });

  await prisma.pvcProfile.createMany({
    data: [
      { companyId: acme.id, brand: "REHAU", systemName: "Total70", chamberCount: 5, installDepthMm: 70, wallThicknessClass: "A", colorOptions: ["White","Anthracite Grey","Golden Oak","Black"], maxGlassThicknessMm: 40, costPricePerMeter: 18, sellPricePerMeter: 27 },
      { companyId: acme.id, brand: "VEKA", systemName: "Softline 70 AD", chamberCount: 5, installDepthMm: 70, wallThicknessClass: "A", colorOptions: ["White","Cream","Grey"], maxGlassThicknessMm: 41, costPricePerMeter: 16, sellPricePerMeter: 24 },
    ],
  });

  await prisma.hardwareItem.createMany({
    data: [
      { companyId: acme.id, name: "Tilt & Turn Handle", category: "handle", costPrice: 8, sellPrice: 14 },
      { companyId: acme.id, name: "Multi-Point Lock", category: "lock", costPrice: 22, sellPrice: 36 },
      { companyId: acme.id, name: "Aluminium Sill", category: "sill", unit: "meter", costPrice: 15, sellPrice: 25 },
    ],
  });

  await prisma.productTemplate.createMany({
    data: [
      { companyId: acme.id, name: "Fixed Window", kind: "FINISHED_WINDOW", openingCount: 0, complexityMultiplier: 0.9 },
      { companyId: acme.id, name: "Tilt & Turn Window", kind: "FINISHED_WINDOW", openingCount: 1, complexityMultiplier: 1.15 },
      { companyId: acme.id, name: "Sliding Patio Door", kind: "FINISHED_DOOR", openingCount: 2, complexityMultiplier: 1.4 },
      { companyId: acme.id, name: "Custom Glass Panel", kind: "GLASS_ONLY", openingCount: 0, complexityMultiplier: 1.0 },
      { companyId: acme.id, name: "Raw PVC Profile", kind: "RAW_PROFILE", openingCount: 0, complexityMultiplier: 1.0 },
    ],
  });

  await prisma.processingOption.createMany({
    data: [
      { companyId: acme.id, name: "Edge Polish", costPrice: 5, sellPrice: 9 },
      { companyId: acme.id, name: "Drill Holes", costPrice: 3, sellPrice: 6 },
      { companyId: acme.id, name: "Custom Shape Cut", costPrice: 12, sellPrice: 20 },
    ],
  });

  const defaultPL = await prisma.priceList.create({ data: { companyId: acme.id, name: "Retail", discountPercent: 0, isDefault: true } });
  await prisma.priceList.createMany({ data: [ { companyId: acme.id, name: "Reseller Bronze", discountPercent: 8 }, { companyId: acme.id, name: "Reseller Gold", discountPercent: 15 } ] });

  const customerOrg = await prisma.customerOrg.create({
    data: { companyId: acme.id, name: "Bob's Windows & Doors", taxId: "US-123456789", priceListId: defaultPL.id, shippingAddress: "123 Main St, Springfield" },
  });

  await prisma.user.create({
    data: { email: "bob@customers.test", name: "Bob Builder", passwordHash: hash, platformRole: "CUSTOMER", companyId: acme.id, customerOrgId: customerOrg.id },
  });

  console.log("✅ Seed complete!");
  console.log("Super admin : superadmin@glazeflow.app / Password123!");
  console.log("Supplier    : admin@acme.test / Password123!");
  console.log("Customer    : bob@customers.test / Password123!");
  console.log("Storefront  : http://acme.localhost:3000");
}

main().finally(() => prisma.$disconnect());
