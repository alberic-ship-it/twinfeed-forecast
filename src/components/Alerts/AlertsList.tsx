import { AlertTriangle, Info, X } from 'lucide-react';
import type { Alert } from '../../types';

interface AlertsListProps {
  alerts: Alert[];
  onDismiss: (id: string) => void;
}

export function AlertsList({ alerts, onDismiss }: AlertsListProps) {
  const visibleAlerts = alerts.filter((a) => !a.dismissed);
  if (visibleAlerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {visibleAlerts.map((alert) => {
        const isWarning = alert.severity === 'warning';
        const bgColor = isWarning ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200';
        const iconColor = isWarning ? 'text-amber-500' : 'text-blue-500';
        const Icon = isWarning ? AlertTriangle : Info;

        return (
          <div
            key={alert.id}
            className={`rounded-xl border p-3 flex items-start gap-3 ${bgColor}`}
          >
            <Icon className={`flex-shrink-0 mt-0.5 ${iconColor}`} size={16} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700">{alert.message}</p>
              {alert.actionSuggested && (
                <p className="text-xs text-gray-500 mt-1">{alert.actionSuggested}</p>
              )}
            </div>
            <button
              onClick={() => onDismiss(alert.id)}
              className="flex-shrink-0 p-2 -m-1 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 active:text-gray-800"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
