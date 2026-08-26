import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { calcItemPricing, calcTotals } from "@/lib/pricing-engine";
import { notify } from "@/lib/notifications";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  const where = user.platformRole === "CUSTOMER" ? { customerOrgId: user.customerOrgId } : { companyId: user.companyId };
  const orders = await prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, include: { items: true, customerOrg: true, createdBy: { select: { name: true, email: true } } } });
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const body = await req.json();
  const { companyId, items, shippingAddress, customerNotes, requestedDate } = body;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const customerOrg = await prisma.customerOrg.findUnique({ where: { id: user.customerOrgId }, include: { priceList: true } });
  const discountPercent = customerOrg?.priceList?.discountPercent ? Number(customerOrg.priceList.discountPercent) : 0;

  const computedItems = [];
  for (const item of items) {
    let profileSell;
    if (item.profileId) {
      const p = await prisma.pvcProfile.findUnique({ where: { id: item.profileId } });
      profileSell = p ? Number(p.sellPricePerMeter) : undefined;
    }
    const glassPanes = [];
    for (const pane of item.glassPanes ?? []) {
      const g = await prisma.glassType.findUnique({ where: { id: pane.glassTypeId } });
      if (!g) continue;
      glassPanes.push({ glassTypeId: pane.glassTypeId, sellPricePerSqm: Number(g.sellPricePerSqm), baseThicknessMm: g.baseThicknessMm, thicknessMm: pane.thicknessMm, thicknessSurchargePercentPerMm: Number(g.thicknessSurchargePercentPerMm) });
    }
    const hardware = [];
    for (const h of item.hardware ?? []) {
      const hw = await prisma.hardwareItem.findUnique({ where: { id: h.hardwareId } });
      if (!hw) continue;
      hardware.push({ sellPrice: Number(hw.sellPrice), quantity: h.quantity });
    }
    const processing = [];
    for (const pid of item.processingIds ?? []) {
      const po = await prisma.processingOption.findUnique({ where: { id: pid } });
      if (po) processing.push(Number(po.sellPrice));
    }
    const template = item.templateId ? await prisma.productTemplate.findUnique({ where: { id: item.templateId } }) : null;

    const pricing = calcItemPricing({
      kind: item.kind, widthMm: item.widthMm, heightMm: item.heightMm, lengthM: item.lengthM,
      quantity: item.quantity, profileSellPricePerMeter: profileSell,
      complexityMultiplier: template ? Number(template.complexityMultiplier) : 1,
      glassPanes, hardware, processing,
    });
    computedItems.push({ ...item, pricing, glassPanes, hardware });
  }

  const totals = calcTotals(computedItems.map((i) => i.pricing.lineTotal), discountPercent, Number(company.taxRatePercent));
  const orderNumber = `GF-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

  const order = await prisma.order.create({
    data: {
      companyId, customerOrgId: user.customerOrgId, createdById: user.id, orderNumber,
      status: "NEW", currency: company.currency,
      subtotal: totals.subtotal, taxAmount: totals.taxAmount, discountAmount: totals.discountAmount, total: totals.total,
      shippingAddress, customerNotes, requestedDate: requestedDate ? new Date(requestedDate) : null,
      items: {
        create: computedItems.map((item) => ({
          productKind: item.kind, templateId: item.templateId ?? null,
          widthMm: item.widthMm ?? null, heightMm: item.heightMm ?? null, lengthM: item.lengthM ?? null,
          quantity: item.quantity, profileId: item.profileId ?? null, profileColor: item.profileColor ?? null,
          glazingLayers: item.glazingLayers ?? "DOUBLE", airGapMm: item.airGapMm ?? 16, gasFill: item.gasFill ?? "air",
          unitPrice: item.pricing.unitPrice, lineTotal: item.pricing.lineTotal, status: "PENDING",
          glassPanes: { create: item.glassPanes.map((p: any, idx: number) => ({ glassTypeId: p.glassTypeId, paneIndex: idx + 1, thicknessMm: p.thicknessMm, areaSqm: item.pricing.areaSqm ?? 0, price: item.glassPanes.length ? item.pricing.glassCost / item.glassPanes.length : 0 })) },
          hardware: { create: item.hardware.map((h: any) => ({ hardwareId: h.hardwareId, quantity: h.quantity, price: h.sellPrice * h.quantity })) },
        })),
      },
      statusHistory: { create: { toStatus: "NEW", note: "Order placed" } },
    },
    include: { items: true },
  });

  const staff = await prisma.user.findMany({ where: { companyId, platformRole: { in: ["COMPANY_ADMIN", "COMPANY_STAFF"] } } });
  for (const s of staff) {
    await notify({ userId: s.id, event: "ORDER_CREATED", title: `New order ${order.orderNumber}`, body: `Order from ${customerOrg?.name}: ${totals.total} ${company.currency}`, orderId: order.id, email: true });
  }

  return NextResponse.json({ order });
}
