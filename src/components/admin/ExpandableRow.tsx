'use client';

import { useState } from 'react';

interface CatalogCounts {
  glassTypes: number;
  pvcProfiles: number;
  hardwareItems: number;
  productTemplates: number;
  processingOptions: number;
  priceLists: number;
}

interface ExpandableRowProps {
  companyName: string;
  companySlug: string;
  counts: {
    users: number;
    orders: number;
    customerOrgs: number;
    catalog: CatalogCounts;
  };
  isActive: boolean;
  onManageClick: () => void;
  initiallyExpanded?: boolean;
}

const catalogLabels: Array<{ key: keyof CatalogCounts; label: string; icon: string }> = [
  { key: 'glassTypes', label: 'Staklo', icon: '🔍' },
  { key: 'pvcProfiles', label: 'PVC profili', icon: '📐' },
  { key: 'hardwareItems', label: 'Oprema', icon: '🔧' },
  { key: 'productTemplates', label: 'Šabloni', icon: '📋' },
  { key: 'processingOptions', label: 'Obrada', icon: '⚙️' },
  { key: 'priceLists', label: 'Cenovnici', icon: '💰' },
];

export function ExpandableRow({
  companyName,
  companySlug,
  counts,
  isActive,
  onManageClick,
  initiallyExpanded = false,
}: ExpandableRowProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  const catalogItems = catalogLabels.map(({ key, label, icon }) => ({
    label,
    value: counts.catalog[key],
    icon,
  }));

  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="p-4 font-medium">{companyName}</td>
        <td className="p-4 font-mono text-sm">{companySlug}</td>
        <td className="p-4">{counts.users}</td>
        <td className="p-4">{counts.orders}</td>
        <td className="p-4">{counts.customerOrgs}</td>
        <td className="p-4">
          <div className="flex gap-1 flex-wrap">
            {catalogItems.map(({ label, value, icon }) => (
              <span
                key={label}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs bg-slate-100 rounded text-slate-600"
                title={`${label}: ${value}`}
              >
                {icon} {value}
              </span>
            ))}
          </div>
        </td>
        <td className="p-4">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`}
            />
            {isActive ? 'Aktivan' : 'Neaktivan'}
          </span>
        </td>
        <td className="p-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onManageClick();
            }}
            className="text-blue-600 hover:underline text-sm font-medium"
          >
            Upravljaj
          </button>
        </td>
        <td className="p-4 text-center text-slate-400">{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={9} className="p-4">
            <div className="ml-4 border-l-2 border-slate-200 pl-4 py-2 space-y-2">
              <p className="text-sm font-medium text-slate-700">Katalog pregleda:</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                {catalogItems.map(({ label, value, icon }) => (
                  <div
                    key={label}
                    className="rounded-lg bg-white p-3 text-center shadow-sm border border-slate-100"
                  >
                    <p className="text-2xl font-bold text-slate-900">{value}</p>
                    <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                      {icon} {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
