import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Development-only credentials.
 *
 * Every account has its own password, each one strong enough to satisfy the
 * production policy in `src/lib/password-policy.ts` (12+ characters, upper,
 * lower, digit, symbol). They are local seed accounts — never reuse them in
 * production, and change them before the first real deployment.
 */
const SEED_PASSWORDS = {
  superadmin: 'Gzf!Plat#2026Qx7mR2',
  acmeAdmin: 'Gzf!Dobav#2026Kr4pN8',
  acmeManager: 'Gzf!Proizv#2026Tv8sM3',
  acmeSales: 'Gzf!Prodaj#2026Bn3wD7',
  bobAdmin: 'Gzf!Kupac#2026Hd6qP9',
  bobWorker: 'Gzf!Radnik#2026Yc2rL5',
} as const;

/** bcrypt cost 12 — the same factor the application uses. */
const BCRYPT_ROUNDS = 12;

async function main() {
  const hashOf = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);

  const superAdminHash = await hashOf(SEED_PASSWORDS.superadmin);
  const acmeAdminHash = await hashOf(SEED_PASSWORDS.acmeAdmin);
  const acmeManagerHash = await hashOf(SEED_PASSWORDS.acmeManager);
  const acmeSalesHash = await hashOf(SEED_PASSWORDS.acmeSales);
  const bobAdminHash = await hashOf(SEED_PASSWORDS.bobAdmin);
  const bobWorkerHash = await hashOf(SEED_PASSWORDS.bobWorker);

  await prisma.user.upsert({
    where: { email: 'superadmin@glazeflow.app' },
    // The password is rewritten on every seed, so a rotation reaches the
    // local database as well as the source.
    update: { passwordHash: superAdminHash },
    create: {
      email: 'superadmin@glazeflow.app',
      name: 'Vlasnik platforme',
      passwordHash: superAdminHash,
      platformRole: 'SUPER_ADMIN',
    },
  });

  const acme = await prisma.company.upsert({
    where: { slug: 'acme' },
    update: {
      currency: 'RSD',
      taxRatePercent: 20,
      defaultMarkupPercent: 25,
      address: 'Bulevar kralja Aleksandra 10, 11000 Beograd',
      isProducer: true,
      isMainCompany: true,
    },
    create: {
      name: 'Akme Staklo & PVC Sistemi',
      slug: 'acme',
      tagline: 'Precizno staklo i PVC proizvedeno u EU',
      primaryColor: '#1d4ed8',
      secondaryColor: '#0f172a',
      accentColor: '#f59e0b',
      currency: 'RSD',
      taxRatePercent: 20,
      defaultMarkupPercent: 25,
      address: 'Bulevar kralja Aleksandra 10, 11000 Beograd',
      isProducer: true,
      isMainCompany: true,
    },
  });

  // Create or update main company users
  await prisma.user.upsert({
    where: { email: 'admin@acme.test' },
    update: { companyRole: 'COMPANY_ADMIN', passwordHash: acmeAdminHash },
    create: {
      email: 'admin@acme.test',
      name: 'Akme Admin',
      passwordHash: acmeAdminHash,
      platformRole: 'COMPANY_ADMIN',
      companyRole: 'COMPANY_ADMIN',
      companyId: acme.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'manager@acme.test' },
    update: { companyRole: 'COMPANY_PRODUCTION', passwordHash: acmeManagerHash },
    create: {
      email: 'manager@acme.test',
      name: 'Menadžer Proizvodnje',
      passwordHash: acmeManagerHash,
      platformRole: 'COMPANY_STAFF',
      companyRole: 'COMPANY_PRODUCTION',
      companyId: acme.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'sales@acme.test' },
    update: { companyRole: 'COMPANY_SALES', passwordHash: acmeSalesHash },
    create: {
      email: 'sales@acme.test',
      name: 'Prodavac',
      passwordHash: acmeSalesHash,
      platformRole: 'COMPANY_STAFF',
      companyRole: 'COMPANY_SALES',
      companyId: acme.id,
    },
  });

  for (const g of [
    {
      name: 'Jasno plavo staklo',
      category: 'float',
      availableThicknessMm: [4, 5, 6, 8],
      baseThicknessMm: 4,
      costPricePerSqm: 2400,
      sellPricePerSqm: 3500,
    },
    {
      name: 'Kaljeno bezbednosno staklo',
      category: 'tempered',
      availableThicknessMm: [4, 5, 6, 8, 10, 12],
      baseThicknessMm: 4,
      costPricePerSqm: 3700,
      sellPricePerSqm: 5400,
      isSafetyGlass: true,
    },
    {
      name: 'Low-E energetsko staklo',
      category: 'lowE',
      availableThicknessMm: [4, 6, 8],
      baseThicknessMm: 4,
      costPricePerSqm: 4200,
      sellPricePerSqm: 6000,
      isLowE: true,
    },
    {
      name: 'Laminirano akusto staklo',
      category: 'laminated',
      availableThicknessMm: [6, 8, 10, 12],
      baseThicknessMm: 6,
      costPricePerSqm: 5000,
      sellPricePerSqm: 7400,
      isSafetyGlass: true,
      soundReductionDb: 38,
    },
  ] as const) {
    await prisma.glassType.upsert({
      where: { companyId_name: { companyId: acme.id, name: g.name } },
      update: { ...g },
      create: { companyId: acme.id, ...g },
    });
  }

  for (const p of [
    {
      brand: 'REHAU',
      systemName: 'Total70',
      chamberCount: 5,
      installDepthMm: 70,
      wallThicknessClass: 'A',
      colorOptions: ['Bel', 'Antracit siva', 'Zlatni dub', 'Crna'],
      maxGlassThicknessMm: 40,
      costPricePerMeter: 1950,
      sellPricePerMeter: 2900,
    },
    {
      brand: 'VEKA',
      systemName: 'Softline 70 AD',
      chamberCount: 5,
      installDepthMm: 70,
      wallThicknessClass: 'A',
      colorOptions: ['Bel', 'Krem', 'Siva'],
      maxGlassThicknessMm: 41,
      costPricePerMeter: 1750,
      sellPricePerMeter: 2600,
    },
  ] as const) {
    await prisma.pvcProfile.upsert({
      where: {
        companyId_brand_systemName: {
          companyId: acme.id,
          brand: p.brand,
          systemName: p.systemName,
        },
      },
      update: { ...p },
      create: { companyId: acme.id, ...p },
    });
  }

  for (const h of [
    {
      name: 'Rukavica za nagib i okretanje',
      category: 'ruka',
      costPrice: 900,
      sellPrice: 1500,
      applicableKinds: ['FINISHED_WINDOW', 'FINISHED_DOOR'],
    },
    {
      name: 'Više tačkovni zaključak',
      category: 'zaključak',
      costPrice: 2400,
      sellPrice: 3900,
      applicableKinds: ['FINISHED_WINDOW', 'FINISHED_DOOR'],
    },
    {
      name: 'Aluminijski prag',
      category: 'prag',
      unit: 'meter',
      costPrice: 1600,
      sellPrice: 2700,
      applicableKinds: ['FINISHED_DOOR'],
    },
  ] as const) {
    await prisma.hardwareItem.upsert({
      where: { companyId_name: { companyId: acme.id, name: h.name } },
      update: { ...h },
      create: { companyId: acme.id, ...h },
    });
  }

  for (const t of [
    {
      name: 'Fiksni prozor',
      kind: 'FINISHED_WINDOW',
      openingCount: 0,
      complexityMultiplier: 0.9,
    },
    {
      name: 'Prozor za nagib i okretanje',
      kind: 'FINISHED_WINDOW',
      openingCount: 1,
      complexityMultiplier: 1.15,
    },
    {
      name: 'Klizna terasna vrata',
      kind: 'FINISHED_DOOR',
      openingCount: 2,
      complexityMultiplier: 1.4,
    },
    {
      name: 'Prilagođeni stakleni panel',
      kind: 'GLASS_ONLY',
      openingCount: 0,
      complexityMultiplier: 1.0,
    },
    {
      name: 'Raw PVC profil',
      kind: 'RAW_PROFILE',
      openingCount: 0,
      complexityMultiplier: 1.0,
    },
  ] as const) {
    await prisma.productTemplate.upsert({
      where: { companyId_name: { companyId: acme.id, name: t.name } },
      update: { ...t },
      create: { companyId: acme.id, ...t },
    });
  }

  for (const o of [
    {
      name: 'Poliranje ivica',
      costPrice: 550,
      sellPrice: 1000,
      applicableKinds: ['GLASS_ONLY'],
    },
    {
      name: 'Bušenje rupe',
      costPrice: 350,
      sellPrice: 650,
      applicableKinds: ['GLASS_ONLY'],
    },
    {
      name: 'Prilagođeni rez oblika',
      costPrice: 1300,
      sellPrice: 2200,
      applicableKinds: ['GLASS_ONLY', 'FINISHED_WINDOW', 'FINISHED_DOOR'],
    },
  ] as const) {
    await prisma.processingOption.upsert({
      where: { companyId_name: { companyId: acme.id, name: o.name } },
      update: { ...o },
      create: { companyId: acme.id, ...o },
    });
  }

  const defaultPL = await prisma.priceList.upsert({
    where: { companyId_name: { companyId: acme.id, name: 'Prodajna cena' } },
    update: { discountPercent: 0, isDefault: true },
    create: {
      companyId: acme.id,
      name: 'Prodajna cena',
      discountPercent: 0,
      isDefault: true,
    },
  });
  for (const [name, discountPercent] of [
    ['Bronzni prodavac', 8],
    ['Zlatni prodavac', 15],
  ] as const) {
    await prisma.priceList.upsert({
      where: { companyId_name: { companyId: acme.id, name } },
      update: { discountPercent },
      create: { companyId: acme.id, name, discountPercent },
    });
  }

  const customerOrg = await prisma.customerOrg.upsert({
    where: { slug: 'bob' },
    update: {},
    create: {
      companyId: acme.id,
      name: 'Prozori i vrata Boba',
      slug: 'bob',
      taxId: 'US-123456789',
      priceListId: defaultPL.id,
      shippingAddress: '123 Main St, Springfield',
    },
  });

  await prisma.user.upsert({
    where: { email: 'bob@customers.test' },
    update: { customerOrgRole: 'TENANT_ADMIN', companyRole: null, passwordHash: bobAdminHash },
    create: {
      email: 'bob@customers.test',
      name: 'Bob Građevinar',
      passwordHash: bobAdminHash,
      platformRole: 'CUSTOMER',
      customerOrgRole: 'TENANT_ADMIN',
      companyId: acme.id,
      customerOrgId: customerOrg.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'worker@customers.test' },
    update: { customerOrgRole: 'TENANT_MANAGER', companyRole: null, passwordHash: bobWorkerHash },
    create: {
      email: 'worker@customers.test',
      name: 'Radnik Mala Firma',
      passwordHash: bobWorkerHash,
      platformRole: 'CUSTOMER',
      customerOrgRole: 'TENANT_MANAGER',
      companyId: acme.id,
      customerOrgId: customerOrg.id,
    },
  });

  console.log('✅ seed uspešan!');
  console.log('Super admin : superadmin@glazeflow.app / ' + SEED_PASSWORDS.superadmin);
  console.log('Dobavljač    : admin@acme.test / ' + SEED_PASSWORDS.acmeAdmin);
  console.log('Menadžer     : manager@acme.test / ' + SEED_PASSWORDS.acmeManager);
  console.log('Prodavac     : sales@acme.test / ' + SEED_PASSWORDS.acmeSales);
  console.log('Kupac admin  : bob@customers.test / ' + SEED_PASSWORDS.bobAdmin);
  console.log('Kupac radnik : worker@customers.test / ' + SEED_PASSWORDS.bobWorker);
  // The storefront host is the TENANT slug (CustomerOrg.slug), not the main
  // company's slug — 'acme' is the main company and resolves to a 404.
  console.log('Prodavnica   : http://bob.localhost:3000');
}

main().finally(() => prisma.$disconnect());
