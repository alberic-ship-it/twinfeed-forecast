import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Sunrise, X } from 'lucide-react';
import type { NightRecap as NightRecapType } from '../../types';
import { useStore } from '../../store';
import { PROFILES } from '../../data/knowledge';

function formatTime(date: Date): string {
  return format(date, 'HH:mm', { locale: fr });
}

function formatDurationHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
}

export function NightRecapCard() {
  const nightRecaps = useStore((s) => s.nightRecaps);
  const dismissNightRecap = useStore((s) => s.dismissNightRecap);

  const visibleRecaps = nightRecaps.filter((r) => !r.dismissed);
  if (visibleRecaps.length === 0) return null;

  return (
    <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sunrise className="text-indigo-400" size={16} />
        <h3 className="text-xs text-indigo-400 uppercase tracking-wide font-medium">
          Bilan de la nuit
        </h3>
      </div>

      <div className={`grid gap-3 ${visibleRecaps.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {visibleRecaps.map((recap) => (
          <RecapCard key={recap.baby} recap={recap} onDismiss={() => dismissNightRecap(recap.baby)} />
        ))}
      </div>
    </div>
  );
}

function RecapCard({ recap, onDismiss }: { recap: NightRecapType; onDismiss: () => void }) {
  const profile = PROFILES[recap.baby];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-indigo-700">
          {profile.name}
        </span>
        <button
          onClick={onDismiss}
          className="p-1 text-indigo-300 hover:text-indigo-500 transition-colors"
          title="Fermer"
        >
          <X size={14} />
        </button>
      </div>

      {/* Duration */}
      <p className="text-xl font-bold text-indigo-700 leading-tight">
        {formatDurationHM(recap.totalDurationMin)}
      </p>
      <p className="text-[11px] text-indigo-400">
        {formatTime(recap.session.startTime)} — {recap.session.endTime ? formatTime(recap.session.endTime) : '?'}
      </p>

      {/* Stats */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-indigo-400">Repas</span>
          <span className="text-indigo-700 font-medium">
            {recap.feedCount} ({recap.totalVolumeMl} ml)
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-indigo-400">Plus long stretch</span>
          <span className="text-indigo-700 font-medium">
            {formatDurationHM(recap.longestStretchMin)}
          </span>
        </div>
        {recap.feedCount > 0 && (
          <div className="flex justify-between text-[11px]">
            <span className="text-indigo-400">Intervalle moyen</span>
            <span className="text-indigo-700 font-medium">
              {formatDurationHM(recap.avgInterFeedMin)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
