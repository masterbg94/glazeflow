'use client';

interface RoleDistributionProps {
  data: Record<string, number>;
  colors?: Record<string, string>;
}

const defaultColors: Record<string, string> = {
  SUPER_ADMIN: '#7c3aed',
  COMPANY_ADMIN: '#2563eb',
  COMPANY_STAFF: '#0891b2',
  CUSTOMER: '#65a30d',
};

export function RoleDistribution({ data, colors = {} }: RoleDistributionProps) {
  const mergedColors = { ...defaultColors, ...colors };
  const total = Object.values(data).reduce((a, b) => a + b, 0);

  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    COMPANY_ADMIN: 'Company Admin',
    COMPANY_STAFF: 'Company Staff',
    CUSTOMER: 'Customer',
  };

  return (
    <div className="space-y-2">
      {Object.entries(data).map(([role, count]) => {
        const percentage = total > 0 ? (count / total) * 100 : 0;
        const color = mergedColors[role] || '#64748b';
        return (
          <div key={role} className="flex items-center gap-3">
            <div className="w-24 text-sm font-medium text-slate-700 text-right pr-2">
              {roleLabels[role] || role}
            </div>
            <div className="flex-1 relative h-5">
              <div className="absolute inset-0 rounded-full bg-slate-100" />
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
                style={{ width: `${percentage}%`, backgroundColor: color }}
              />
            </div>
            <span className="w-16 text-sm font-medium text-slate-600" style={{ color }}>
              {count} ({percentage.toFixed(0)}%)
            </span>
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
          </div>
        );
      })}
    </div>
  );
}
