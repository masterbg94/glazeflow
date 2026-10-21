'use client';

import { formatCurrency } from '@/lib/utils';

interface Props {
  unitPrice: number;
  lineTotal: number;
  quantity: number;
  currency: string;
  areaSqm?: number;
  profileCost: number;
  glassCost: number;
  hardwareCost: number;
  processingCost: number;
  /** The tenant's price-list discount, in percent. */
  discountPercent?: number;
  /** The main company's tax rate, in percent. */
  taxRatePercent?: number;
}

export function PriceSummary(p: Props) {
  const discountPercent = p.discountPercent ?? 0;
  const taxRatePercent = p.taxRatePercent ?? 0;
  const subtotal = p.lineTotal;
  const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
  const afterDiscount = Math.round((subtotal - discountAmount) * 100) / 100;
  const taxAmount = Math.round(afterDiscount * (taxRatePercent / 100) * 100) / 100;
  const total = Math.round((afterDiscount + taxAmount) * 100) / 100;

  return (
    <div className="sticky top-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Live cena</h3>
      {p.areaSqm !== undefined && (
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <Row label="Površina stakla" value={`${p.areaSqm.toFixed(2)} m²`} />
        </div>
      )}
      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <Row label="Trošak profila" value={formatCurrency(p.profileCost, p.currency)} />
        <Row label="Trošak stakla" value={formatCurrency(p.glassCost, p.currency)} />
        <Row label="Trošak hardvera" value={formatCurrency(p.hardwareCost, p.currency)} />
        <Row label="Obrada" value={formatCurrency(p.processingCost, p.currency)} />
      </div>
      <div className="my-4 border-t border-slate-200" />
      <Row label="Jedinična cena" value={formatCurrency(p.unitPrice, p.currency)} bold />
      <Row label={`× ${p.quantity}`} value={formatCurrency(p.lineTotal, p.currency)} bold />
      <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
        <Row label="Ukupno stavki" value={formatCurrency(subtotal, p.currency)} />
        {discountPercent > 0 && (
          <Row
            label={`Popust (${discountPercent}%)`}
            value={`- ${formatCurrency(discountAmount, p.currency)}`}
          />
        )}
        {taxRatePercent > 0 && (
          <Row label={`Porez (${taxRatePercent}%)`} value={formatCurrency(taxAmount, p.currency)} />
        )}
      </div>
      <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-4">
        <span className="text-sm font-medium text-slate-700">Ukupno</span>
        <span className="text-2xl font-bold text-blue-700">
          {formatCurrency(total, p.currency)}
        </span>
      </div>
      {p.quantity > 1 && (
        <p className="mt-2 text-xs text-slate-400">
          Cena po stavki: {formatCurrency(p.unitPrice, p.currency)} × {p.quantity}
        </p>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold text-slate-900' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
