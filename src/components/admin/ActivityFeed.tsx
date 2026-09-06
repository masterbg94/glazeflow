'use client';

import { useRouter } from 'next/navigation';

interface ActivityItem {
  type: 'company_created' | 'order_created' | 'user_created' | 'order_status_changed';
  timestamp: string;
  companyName: string;
  companySlug: string;
  entityId: string;
  entityType: 'company' | 'order' | 'user';
  details: string;
}

const typeIcons: Record<ActivityItem['type'], string> = {
  company_created: '🏢',
  order_created: '📦',
  user_created: '👤',
  order_status_changed: '🔄',
};

const typeLabels: Record<ActivityItem['type'], string> = {
  company_created: 'Nova kompanija',
  order_created: 'Nova narudžbina',
  user_created: 'Novi korisnik',
  order_status_changed: 'Promena statusa',
};

interface ActivityFeedProps {
  activities: ActivityItem[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const router = useRouter();

  const handleClick = (entityType: string, entityId: string, companySlug: string) => {
    switch (entityType) {
      case 'company':
        router.push(`/admin/companies/${entityId}`);
        break;
      case 'order':
        router.push(`/${companySlug}/my-orders/${entityId}`);
        break;
      case 'user':
        router.push(`/admin/companies/${entityId}`);
        break;
    }
  };

  if (activities.length === 0) {
    return <div className="p-8 text-center text-slate-500">Nema nedavne aktivnosti.</div>;
  }

  return (
    <div className="space-y-3">
      {activities.map((activity, index) => (
        <div
          key={index}
          className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
          onClick={() => handleClick(activity.entityType, activity.entityId, activity.companySlug)}
        >
          <span className="text-xl mt-0.5">{typeIcons[activity.type]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900">
              {typeLabels[activity.type]}: {activity.details}
            </p>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <span>@{activity.companySlug}</span>
              <span>•</span>
              <time dateTime={activity.timestamp}>
                {new Date(activity.timestamp).toLocaleString('sr-RS', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
