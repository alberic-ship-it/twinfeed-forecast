import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { BabyName, Prediction } from '../../types';
import { PROFILES, BABY_COLORS } from '../../data/knowledge';

interface TimelineProps {
  predictions: Record<BabyName, Prediction | null>;
}

export function Timeline({ predictions }: TimelineProps) {
  const items: { baby: BabyName; time: Date; ml: number }[] = [];

  for (const baby of ['colette', 'isaure'] as BabyName[]) {
    const pred = predictions[baby];
    if (pred) {
      items.push({
        baby,
        time: pred.timing.predictedTime,
        ml: pred.volume.predictedMl,
      });
    }
  }

  items.sort((a, b) => a.time.getTime() - b.time.getTime());

  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
      <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-3">
        Timeline prédictive
      </h3>
      <div className="space-y-3">
        {items.map((item) => {
          const profile = PROFILES[item.baby];
          const color = BABY_COLORS[item.baby];
          const timeStr = format(item.time, 'HH:mm', { locale: fr });
          const now = new Date();
          const diffMin = Math.round(
            (item.time.getTime() - now.getTime()) / (1000 * 60),
          );
          const relativeStr =
            diffMin <= 0
              ? 'Maintenant'
              : diffMin < 60
                ? `dans ${diffMin} min`
                : `dans ${Math.round(diffMin / 60)}h${String(diffMin % 60).padStart(2, '0')}`;

          return (
            <div key={item.baby} className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-sm text-gray-700">
                    {profile.name}
                  </span>
                  <span className="text-xs text-gray-400">{relativeStr}</span>
                </div>
                <p className="text-xs text-gray-500">
                  {timeStr} — ~{item.ml} ml
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
