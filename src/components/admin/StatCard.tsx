'use client';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({ label, value, icon, trend, className }: StatCardProps) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${className || ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
          {trend && (
            <p className="mt-2 text-sm">
              <span
                className={`font-medium ${trend.value >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {trend.value >= 0 ? '+' : ''}
                {trend.value}% {trend.label}
              </span>
            </p>
          )}
        </div>
        {icon && <div className="text-slate-300">{icon}</div>}
      </div>
    </div>
  );
}
