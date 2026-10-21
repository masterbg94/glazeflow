import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { calcItemPricing, calcTotals } from '@/lib/pricing-engine';

/**
 * A live quote preview. The order-creation path is the authoritative one — it
 * recomputes every price from the database — so this endpoint only mirrors the
 * client-side calculation.
 *
 * It requires a session because it is part of the ordering flow, and an
 * unauthenticated caller could otherwise use it as free compute.
 */
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

  const pricing = calcItemPricing(body.item);
  const totals = calcTotals(
    Array.isArray(body.lineTotals) && body.lineTotals.length > 0
      ? body.lineTotals
      : [pricing.lineTotal],
    Number(body.discountPercent) || 0,
    Number(body.taxRatePercent) || 0
  );
  return NextResponse.json({ pricing, totals });
}
