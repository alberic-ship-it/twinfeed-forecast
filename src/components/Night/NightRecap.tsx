import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Sunrise, X, Pencil, Check } from 'lucide-react';
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

function buildTimestamp(timeStr: string, reference: Date): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(reference);
  d.setHours(h, m, 0, 0);
  // If more than 1 min in the future relative to now, assume it refers to the day before reference
  if (d.getTime() > Date.now() + 60_000) {
    d.setDate(d.getDate() - 1);
  }
  return d;
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
  const updateNightRecapStartTime = useStore((s) => s.updateNightRecapStartTime);
  const [editingStart, setEditingStart] = useState(false);
  const [startTimeStr, setStartTimeStr] = useState('');

  const openEditStart = () => {
    setStartTimeStr(formatTime(recap.session.startTime));
    setEditingStart(true);
  };

  const handleSubmitStart = () => {
    if (!startTimeStr) return;
    updateNightRecapStartTime(recap.session.id, buildTimestamp(startTimeStr, recap.session.startTime));
    setEditingStart(false);
  };

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

      {/* Times — start is editable */}
      <div className="text-[11px] text-indigo-400">
        {editingStart ? (
          <span className="flex items-center gap-1">
            <input
              type="time"
              value={startTimeStr}
              onChange={(e) => setStartTimeStr(e.target.value)}
              className="bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 border border-indigo-300 outline-none text-[11px]"
            />
            <button
              onClick={handleSubmitStart}
              className="p-0.5 text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              <Check size={12} />
            </button>
            <button
              onClick={() => setEditingStart(false)}
              className="p-0.5 text-indigo-300 hover:text-indigo-500 transition-colors"
            >
              <X size={12} />
            </button>
            {recap.session.endTime && (
              <span className="ml-1">— {formatTime(recap.session.endTime)}</span>
            )}
          </span>
        ) : (
          <button
            onClick={openEditStart}
            className="flex items-center gap-1 hover:text-indigo-600 transition-colors group"
          >
            <span>{formatTime(recap.session.startTime)}</span>
            <Pencil size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            {recap.session.endTime && (
              <span> — {formatTime(recap.session.endTime)}</span>
            )}
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-indigo-400">Repas</span>
          <span className="text-indigo-700 font-medium">
            {recap.feedCount}{recap.totalVolumeMl > 0 ? ` (${recap.totalVolumeMl} ml)` : ''}
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
