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
  /** Per-pane price, so a mixed-thickness unit is not billed evenly. */
  panePrices: number[];
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
  /** Profile colour surcharge factor, e.g. 1.15 for a +15% colour surcharge. */
  profileColorFactor?: number;
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
  const panePrices: number[] = [];

  if (
    input.kind === 'GLASS_ONLY' ||
    input.kind === 'FINISHED_WINDOW' ||
    input.kind === 'FINISHED_DOOR'
  ) {
    const w = input.widthMm ?? 0;
    const h = input.heightMm ?? 0;
    area = areaSqm(w, h);
    perim = perimeterM(w, h);
    for (const pane of input.glassPanes) {
      const price = glassPanePrice(pane, area);
      panePrices.push(price);
      glassCost += price;
    }
    if (input.kind !== 'GLASS_ONLY' && input.profileSellPricePerMeter) {
      const colorFactor = input.profileColorFactor ?? 1;
      profileCost = perim * input.profileSellPricePerMeter * colorFactor;
    }
  }

  if (input.kind === 'RAW_PROFILE') {
    const len = input.lengthM ?? 0;
    const colorFactor = input.profileColorFactor ?? 1;
    profileCost = len * (input.profileSellPricePerMeter ?? 0) * colorFactor;
  }

  hardwareCost = input.hardware.reduce((s, h) => s + h.sellPrice * h.quantity, 0);
  processingCost = input.processing.reduce((a, b) => a + b, 0);

  const baseUnit =
    (profileCost + glassCost + hardwareCost + processingCost) * input.complexityMultiplier;
  const unitPrice = Math.round(baseUnit * 100) / 100;
  // Derive the line total from the unrounded base. Rounding the unit first and
  // then multiplying drifts by up to quantity × 0.005.
  const lineTotal = Math.round(baseUnit * input.quantity * 100) / 100;

  return {
    areaSqm: area,
    perimeterM: perim,
    profileCost,
    glassCost,
    hardwareCost,
    processingCost,
    unitPrice,
    lineTotal,
    panePrices,
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
