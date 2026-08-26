import { NextRequest, NextResponse } from "next/server";
import { calcItemPricing, calcTotals } from "@/lib/pricing-engine";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const pricing = calcItemPricing(body.item);
  const totals = calcTotals(body.lineTotals || [pricing.lineTotal], body.discountPercent || 0, body.taxRatePercent || 0);
  return NextResponse.json({ pricing, totals });
}
