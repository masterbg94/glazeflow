import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('Password123!', 10);

  await prisma.user.upsert({
    where: { email: 'superadmin@glazeflow.app' },
    update: {},
    create: {
      email: 'superadmin@glazeflow.app',
      name: 'Vlasnik platforme',
      passwordHash: hash,
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
    },
  });

  // Idempotent: if the company already has users, only update settings and exit.
  const existingUsers = await prisma.user.count({ where: { companyId: acme.id } });
  if (existingUsers > 0) {
    console.log('✅ Kompanija već postoji — preskačem seed kataloga.');
    return;
  }

  await prisma.user.create({
    data: {
      email: 'admin@acme.test',
      name: 'Akme Admin',
      passwordHash: hash,
      platformRole: 'COMPANY_ADMIN',
      companyId: acme.id,
    },
  });

  await prisma.glassType.createMany({
    data: [
      {
        companyId: acme.id,
        name: 'Jasno plavo staklo',
        category: 'float',
        availableThicknessMm: [4, 5, 6, 8],
        baseThicknessMm: 4,
        costPricePerSqm: 2400,
        sellPricePerSqm: 3500,
      },
      {
        companyId: acme.id,
        name: 'Kaljeno bezbednosno staklo',
        category: 'tempered',
        availableThicknessMm: [4, 5, 6, 8, 10, 12],
        baseThicknessMm: 4,
        costPricePerSqm: 3700,
        sellPricePerSqm: 5400,
        isSafetyGlass: true,
      },
      {
        companyId: acme.id,
        name: 'Low-E energetsko staklo',
        category: 'lowE',
        availableThicknessMm: [4, 6, 8],
        baseThicknessMm: 4,
        costPricePerSqm: 4200,
        sellPricePerSqm: 6000,
        isLowE: true,
      },
      {
        companyId: acme.id,
        name: 'Laminirano akusto staklo',
        category: 'laminated',
        availableThicknessMm: [6, 8, 10, 12],
        baseThicknessMm: 6,
        costPricePerSqm: 5000,
        sellPricePerSqm: 7400,
        isSafetyGlass: true,
        soundReductionDb: 38,
      },
    ],
  });

  await prisma.pvcProfile.createMany({
    data: [
      {
        companyId: acme.id,
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
        companyId: acme.id,
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
    ],
  });

  await prisma.hardwareItem.createMany({
    data: [
      {
        companyId: acme.id,
        name: 'Rukavica za nagib i okretanje',
        category: 'ruka',
        costPrice: 900,
        sellPrice: 1500,
        applicableKinds: ['FINISHED_WINDOW', 'FINISHED_DOOR'],
      },
      {
        companyId: acme.id,
        name: 'Više tačkovni zaključak',
        category: 'zaključak',
        costPrice: 2400,
        sellPrice: 3900,
        applicableKinds: ['FINISHED_WINDOW', 'FINISHED_DOOR'],
      },
      {
        companyId: acme.id,
        name: 'Aluminijski prag',
        category: 'prag',
        unit: 'meter',
        costPrice: 1600,
        sellPrice: 2700,
        applicableKinds: ['FINISHED_DOOR'],
      },
    ],
  });

  await prisma.productTemplate.createMany({
    data: [
      {
        companyId: acme.id,
        name: 'Fiksni prozor',
        kind: 'FINISHED_WINDOW',
        openingCount: 0,
        complexityMultiplier: 0.9,
      },
      {
        companyId: acme.id,
        name: 'Prozor za nagib i okretanje',
        kind: 'FINISHED_WINDOW',
        openingCount: 1,
        complexityMultiplier: 1.15,
      },
      {
        companyId: acme.id,
        name: 'Klizna terasna vrata',
        kind: 'FINISHED_DOOR',
        openingCount: 2,
        complexityMultiplier: 1.4,
      },
      {
        companyId: acme.id,
        name: 'Prilagođeni stakleni panel',
        kind: 'GLASS_ONLY',
        openingCount: 0,
        complexityMultiplier: 1.0,
      },
      {
        companyId: acme.id,
        name: 'Raw PVC profil',
        kind: 'RAW_PROFILE',
        openingCount: 0,
        complexityMultiplier: 1.0,
      },
    ],
  });

  await prisma.processingOption.createMany({
    data: [
      {
        companyId: acme.id,
        name: 'Poliranje ivica',
        costPrice: 550,
        sellPrice: 1000,
        applicableKinds: ['GLASS_ONLY'],
      },
      {
        companyId: acme.id,
        name: 'Bušenje rupe',
        costPrice: 350,
        sellPrice: 650,
        applicableKinds: ['GLASS_ONLY'],
      },
      {
        companyId: acme.id,
        name: 'Prilagođeni rez oblika',
        costPrice: 1300,
        sellPrice: 2200,
        applicableKinds: ['GLASS_ONLY', 'FINISHED_WINDOW', 'FINISHED_DOOR'],
      },
    ],
  });

  const defaultPL = await prisma.priceList.create({
    data: { companyId: acme.id, name: 'Prodajna cena', discountPercent: 0, isDefault: true },
  });
  await prisma.priceList.createMany({
    data: [
      { companyId: acme.id, name: 'Bronzni prodavac', discountPercent: 8 },
      { companyId: acme.id, name: 'Zlatni prodavac', discountPercent: 15 },
    ],
  });

  const customerOrg = await prisma.customerOrg.create({
    data: {
      companyId: acme.id,
      name: 'Prozori i vrata Boba',
      taxId: 'US-123456789',
      priceListId: defaultPL.id,
      shippingAddress: '123 Main St, Springfield',
    },
  });

  await prisma.user.create({
    data: {
      email: 'bob@customers.test',
      name: 'Bob Građevinar',
      passwordHash: hash,
      platformRole: 'CUSTOMER',
      companyId: acme.id,
      customerOrgId: customerOrg.id,
    },
  });

  console.log('✅ seed uspešan!');
  console.log('Super admin : superadmin@glazeflow.app / Password123!');
  console.log('Dobavljač    : admin@acme.test / Password123!');
  console.log('Kupac        : bob@customers.test / Password123!');
  console.log('Prodavnica   : http://acme.localhost:3000');
}

main().finally(() => prisma.$disconnect());
