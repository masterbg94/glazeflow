'use client';

interface BarData {
  label: string;
  value: number;
  color?: string;
}

interface HorizontalBarChartProps {
  data: BarData[];
  maxValue?: number;
  showValue?: boolean;
  height?: number;
}

export function HorizontalBarChart({
  data,
  maxValue,
  showValue = true,
  height = 28,
}: HorizontalBarChartProps) {
  const computedMax = maxValue ?? Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-3">
      {data.map((item, index) => {
        const percentage = (item.value / computedMax) * 100;
        return (
          <div key={index} className="flex items-center gap-3">
            <div className="w-24 text-sm font-medium text-slate-700 text-right pr-2">
              {item.label}
            </div>
            <div className="flex-1 relative" style={{ height }}>
              <div
                className="absolute inset-0 rounded-full bg-slate-100"
                style={{ width: '100%' }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: item.color || '#3b82f6',
                }}
              />
              {showValue && item.value > 0 && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-600">
                  {item.value}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
