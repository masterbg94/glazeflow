import { describe, expect, it } from 'vitest';
import { areaSqm, calcItemPricing, calcTotals, glassPanePrice, perimeterM } from './pricing-engine';

const pane = {
  glassTypeId: 'g1',
  sellPricePerSqm: 2000,
  baseThicknessMm: 4,
  thicknessMm: 4,
  thicknessSurchargePercentPerMm: 5,
};

const window = {
  kind: 'FINISHED_WINDOW' as const,
  widthMm: 1200,
  heightMm: 1200,
  quantity: 1,
  profileSellPricePerMeter: 500,
  complexityMultiplier: 1.15,
  glassPanes: [pane, pane],
  hardware: [{ sellPrice: 1500, quantity: 2 }],
  processing: [1000],
};

describe('geometry', () => {
  it('computes square metres', () => {
    expect(areaSqm(1200, 1500)).toBeCloseTo(1.8);
  });

  it('computes the perimeter in metres', () => {
    expect(perimeterM(1200, 1500)).toBeCloseTo(5.4);
  });
});

describe('glassPanePrice', () => {
  it('charges no surcharge at the base thickness', () => {
    expect(glassPanePrice(pane, 1.8)).toBeCloseTo(3600);
  });

  it('charges 5% per extra millimetre', () => {
    const thick = { ...pane, thicknessMm: 6 };
    expect(glassPanePrice(thick, 1)).toBeCloseTo(2000 * 1.1);
  });

  it('never charges a negative surcharge below the base thickness', () => {
    const thin = { ...pane, thicknessMm: 2 };
    expect(glassPanePrice(thin, 1)).toBeCloseTo(2000);
  });
});

describe('calcItemPricing', () => {
  it('prices a finished window from profile, glass, hardware and processing', () => {
    const result = calcItemPricing(window);
    // 1200 × 1200 → 1.44 m², 4.8 m perimeter
    expect(result.profileCost).toBeCloseTo(4.8 * 500);
    expect(result.glassCost).toBeCloseTo(2 * 1.44 * 2000);
    expect(result.hardwareCost).toBe(3000);
    expect(result.processingCost).toBe(1000);
  });

  it('applies the complexity multiplier to the whole line', () => {
    const result = calcItemPricing(window);
    const expected = (4.8 * 500 + 2 * 1.44 * 2000 + 3000 + 1000) * 1.15;
    expect(result.unitPrice).toBeCloseTo(expected, 2);
  });

  it('prices a hardware-only item from its hardware', () => {
    const result = calcItemPricing({
      kind: 'HARDWARE',
      quantity: 1,
      complexityMultiplier: 1,
      glassPanes: [],
      hardware: [{ sellPrice: 1500, quantity: 2 }],
      processing: [],
    });
    expect(result.unitPrice).toBe(3000);
    expect(result.lineTotal).toBe(3000);
  });

  it('prices raw profile by length', () => {
    const result = calcItemPricing({
      kind: 'RAW_PROFILE',
      lengthM: 10,
      quantity: 1,
      profileSellPricePerMeter: 500,
      complexityMultiplier: 1,
      glassPanes: [],
      hardware: [],
      processing: [],
    });
    expect(result.unitPrice).toBe(5000);
  });

  it('multiplies the line total by the quantity', () => {
    const result = calcItemPricing({ ...window, quantity: 3 });
    expect(result.lineTotal).toBeCloseTo(result.unitPrice * 3, 2);
  });

  it('does not drift when the quantity is large', () => {
    // Rounding the unit before multiplying used to drift by up to
    // quantity × 0.005.
    const result = calcItemPricing({
      ...window,
      quantity: 1000,
      complexityMultiplier: 1.3333,
    });
    const raw = (4.8 * 500 + 2 * 1.44 * 2000 + 3000 + 1000) * 1.3333;
    expect(result.lineTotal).toBeCloseTo(Math.round(raw * 1000 * 100) / 100, 2);
  });

  it('applies the profile colour surcharge to the frame cost only', () => {
    const result = calcItemPricing({ ...window, profileColorFactor: 1.15 });
    expect(result.profileCost).toBeCloseTo(4.8 * 500 * 1.15);
    expect(result.glassCost).toBeCloseTo(2 * 1.44 * 2000);
  });

  it('prices each pane separately so a mixed thickness is not billed evenly', () => {
    const result = calcItemPricing({
      ...window,
      glassPanes: [pane, { ...pane, thicknessMm: 10 }],
    });
    expect(result.panePrices).toHaveLength(2);
    expect(result.panePrices[0]).not.toBeCloseTo(result.panePrices[1]);
    expect(result.panePrices[0] + result.panePrices[1]).toBeCloseTo(result.glassCost);
  });
});

describe('calcTotals', () => {
  it('applies the discount before the tax', () => {
    const totals = calcTotals([1000], 10, 20);
    expect(totals.subtotal).toBe(1000);
    expect(totals.discountAmount).toBe(100);
    expect(totals.taxAmount).toBeCloseTo(180); // 20% of 900, not of 1000
    expect(totals.total).toBeCloseTo(1080);
  });

  it('reconciles the discount against the subtotal', () => {
    const totals = calcTotals([333.33, 666.67], 7.5, 20);
    expect(totals.subtotal - totals.discountAmount).toBeCloseTo(totals.subtotal * 0.925, 2);
  });

  it('handles a zero discount and zero tax', () => {
    const totals = calcTotals([500], 0, 0);
    expect(totals.total).toBe(500);
  });

  it('rounds to two decimals', () => {
    const totals = calcTotals([100.005], 0, 0);
    expect(totals.total).toBe(100.01);
  });
});
