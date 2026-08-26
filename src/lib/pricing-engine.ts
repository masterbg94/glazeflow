/**
 * Pure pricing engine — no DB/network calls.
 * Used both client-side (live quote) and server-side (authoritative order creation).
 */

export interface GlassPaneInput {
  glassTypeId: string;
  sellPricePerSqm: number;
  baseThicknessMm: number;
  thicknessMm: number;
  thicknessSurchargePercentPerMm: number;
}

export interface HardwareInput {
  sellPrice: number;
  quantity: number;
}

export interface PricedItem {
  areaSqm?: number;
  perimeterM?: number;
  profileCost: number;
  glassCost: number;
  hardwareCost: number;
  processingCost: number;
  unitPrice: number;
  lineTotal: number;
}

export function areaSqm(widthMm: number, heightMm: number): number {
  return (widthMm / 1000) * (heightMm / 1000);
}

export function perimeterM(widthMm: number, heightMm: number): number {
  return (2 * (widthMm + heightMm)) / 1000;
}

export function glassPanePrice(pane: GlassPaneInput, area: number): number {
  const extra = Math.max(0, pane.thicknessMm - pane.baseThicknessMm);
  const multiplier = 1 + (extra * pane.thicknessSurchargePercentPerMm) / 100;
  return area * pane.sellPricePerSqm * multiplier;
}

export function calcItemPricing(input: {
  kind: 'GLASS_ONLY' | 'RAW_PROFILE' | 'FINISHED_WINDOW' | 'FINISHED_DOOR' | 'HARDWARE';
  widthMm?: number;
  heightMm?: number;
  lengthM?: number;
  quantity: number;
  profileSellPricePerMeter?: number;
  complexityMultiplier: number;
  glassPanes: GlassPaneInput[];
  hardware: HardwareInput[];
  processing: number[];
}): PricedItem {
  let glassCost = 0;
  let profileCost = 0;
  let hardwareCost = 0;
  let processingCost = 0;
  let area: number | undefined;
  let perim: number | undefined;

  if (
    input.kind === 'GLASS_ONLY' ||
    input.kind === 'FINISHED_WINDOW' ||
    input.kind === 'FINISHED_DOOR'
  ) {
    const w = input.widthMm ?? 0;
    const h = input.heightMm ?? 0;
    area = areaSqm(w, h);
    perim = perimeterM(w, h);
    glassCost = input.glassPanes.reduce((sum, p) => sum + glassPanePrice(p, area!), 0);
    if (input.kind !== 'GLASS_ONLY' && input.profileSellPricePerMeter) {
      profileCost = perim * input.profileSellPricePerMeter;
    }
  }

  if (input.kind === 'RAW_PROFILE') {
    const len = input.lengthM ?? 0;
    profileCost = len * (input.profileSellPricePerMeter ?? 0);
  }

  hardwareCost = input.hardware.reduce((s, h) => s + h.sellPrice * h.quantity, 0);
  processingCost = input.processing.reduce((a, b) => a + b, 0);

  const baseUnit =
    (profileCost + glassCost + hardwareCost + processingCost) * input.complexityMultiplier;
  const unitPrice = Math.round(baseUnit * 100) / 100;
  const lineTotal = Math.round(unitPrice * input.quantity * 100) / 100;

  return {
    areaSqm: area,
    perimeterM: perim,
    profileCost,
    glassCost,
    hardwareCost,
    processingCost,
    unitPrice,
    lineTotal,
  };
}

export function calcTotals(lineTotals: number[], discountPercent: number, taxRatePercent: number) {
  const subtotal = Math.round(lineTotals.reduce((a, b) => a + b, 0) * 100) / 100;
  const afterDiscount = Math.round(subtotal * (1 - discountPercent / 100) * 100) / 100;
  const discountAmount = Math.round((subtotal - afterDiscount) * 100) / 100;
  const taxAmount = Math.round(afterDiscount * (taxRatePercent / 100) * 100) / 100;
  const total = Math.round((afterDiscount + taxAmount) * 100) / 100;
  return { subtotal, discountAmount, taxAmount, total };
}
