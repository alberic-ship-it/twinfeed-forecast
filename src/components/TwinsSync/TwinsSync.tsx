import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { TwinsSyncStatus } from '../../types';

interface TwinsSyncProps {
  syncStatus: TwinsSyncStatus | null;
}

export function TwinsSync({ syncStatus }: TwinsSyncProps) {
  if (!syncStatus) return null;

  const stateLabels: Record<string, string> = {
    synchronized: 'Synchronisées',
    slightly_offset: 'Légèrement décalées',
    desynchronized: 'Désynchronisées',
  };

  const stateColors: Record<string, string> = {
    synchronized: 'text-green-600 bg-green-50',
    slightly_offset: 'text-yellow-600 bg-yellow-50',
    desynchronized: 'text-red-600 bg-red-50',
  };

  const syncPercent = Math.round(syncStatus.syncRate * 100);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs text-gray-400 uppercase tracking-wide">
          Synchronisation jumelles
        </h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${stateColors[syncStatus.state]}`}
        >
          {stateLabels[syncStatus.state]}
        </span>
      </div>

      <div className="flex items-center gap-4 sm:gap-6">
        <div>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{Math.round(syncStatus.gapMinutes)} min</p>
          <p className="text-xs text-gray-400">d'écart</p>
        </div>
        <div>
          <p className="text-xl sm:text-2xl font-bold text-gray-800">{syncPercent}%</p>
          <p className="text-xs text-gray-400">taux de sync</p>
        </div>
      </div>

      {syncStatus.commonWindow && (
        <div className="text-sm text-gray-600">
          <p>
            Fenêtre commune :{' '}
            <span className="font-medium">
              {format(syncStatus.commonWindow.start, 'HH:mm', { locale: fr })}–
              {format(syncStatus.commonWindow.end, 'HH:mm', { locale: fr })}
            </span>
          </p>
        </div>
      )}

      {syncStatus.suggestion && (
        <p className="text-xs text-gray-500 italic">{syncStatus.suggestion}</p>
      )}
    </div>
  );
}
