"use client";
import { formatCurrency } from "@/lib/utils";

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
}

export function PriceSummary(p: Props) {
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
      <div className="mt-6 text-2xl font-bold text-blue-700">
        {formatCurrency(p.lineTotal, p.currency)}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Konačni ukupni iznos uključujući popuste i porez prikazuje se pri kasiranju.
      </p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-slate-900" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
