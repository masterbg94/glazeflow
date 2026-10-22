import type { ProductKind } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { calcItemPricing, calcTotals } from '@/lib/pricing-engine';

const PRODUCT_KINDS: ProductKind[] = [
  'GLASS_ONLY',
  'RAW_PROFILE',
  'FINISHED_WINDOW',
  'FINISHED_DOOR',
  'HARDWARE',
];

/**
 * A live quote preview. The order-creation path is the authoritative one — it
 * recomputes every price from the database — so this endpoint only mirrors the
 * client-side calculation.
 *
 * It requires a session because it is part of the ordering flow, and an
 * unauthenticated caller could otherwise use it as free compute.
 *
 * The middleware rate limits this route separately from the other writes; the
 * body is bounded here as well so one request cannot ask for an unbounded
 * amount of arithmetic.
 */
const MAX_LINE_ITEMS = 200;
const MAX_QUANTITY = 100_000;
const MAX_DIMENSION_MM = 100_000;
const MAX_PRICE = 100_000_000;

function boundedNumber(value: unknown, max: number, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || !body.item || typeof body.item !== 'object') {
    return NextResponse.json({ error: 'item is required' }, { status: 400 });
  }

  const item = body.item;
  const glassPanes = Array.isArray(item.glassPanes) ? item.glassPanes.slice(0, 50) : [];
  const hardware = Array.isArray(item.hardware) ? item.hardware.slice(0, 50) : [];
  const processing = Array.isArray(item.processing) ? item.processing.slice(0, 50) : [];

  const pricing = calcItemPricing({
    kind: PRODUCT_KINDS.includes(item.kind) ? (item.kind as ProductKind) : 'GLASS_ONLY',
    widthMm: boundedNumber(item.widthMm, MAX_DIMENSION_MM) || undefined,
    heightMm: boundedNumber(item.heightMm, MAX_DIMENSION_MM) || undefined,
    lengthM: boundedNumber(item.lengthM, MAX_DIMENSION_MM) || undefined,
    quantity: boundedNumber(item.quantity, MAX_QUANTITY, 1),
    profileSellPricePerMeter: boundedNumber(item.profileSellPricePerMeter, MAX_PRICE),
    profileColorFactor: boundedNumber(item.profileColorFactor, 100, 1),
    complexityMultiplier: boundedNumber(item.complexityMultiplier, 100, 1),
    glassPanes: glassPanes.map((p: any) => ({
      ...p,
      sellPricePerSqm: boundedNumber(p?.sellPricePerSqm, MAX_PRICE),
    })),
    hardware: hardware.map((h: any) => ({
      ...h,
      sellPrice: boundedNumber(h?.sellPrice, MAX_PRICE),
      quantity: boundedNumber(h?.quantity, MAX_QUANTITY, 1),
    })),
    processing: processing.map((p: unknown) => boundedNumber(p, MAX_PRICE)),
  });

  const rawLineTotals = Array.isArray(body.lineTotals) ? body.lineTotals : [];
  const lineTotals = rawLineTotals
    .slice(0, MAX_LINE_ITEMS)
    .map((t: unknown) => boundedNumber(t, MAX_PRICE));

  const totals = calcTotals(
    lineTotals.length > 0 ? lineTotals : [pricing.lineTotal],
    Math.min(Math.max(Number(body.discountPercent) || 0, 0), 100),
    Math.min(Math.max(Number(body.taxRatePercent) || 0, 0), 100)
  );
  return NextResponse.json({ pricing, totals });
}
