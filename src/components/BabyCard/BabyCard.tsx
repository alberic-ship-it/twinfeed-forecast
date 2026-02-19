import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { BabyName, Prediction } from '../../types';
import { PROFILES, BABY_COLORS } from '../../data/knowledge';

function accuracyColor(score: number): string {
  if (score >= 0.8) return 'text-green-600';
  if (score >= 0.6) return 'text-yellow-500';
  return 'text-orange-500';
}

interface BabyCardProps {
  baby: BabyName;
  prediction: Prediction | null;
  accuracy: number | null;
}

export function BabyCard({ baby, prediction, accuracy }: BabyCardProps) {
  const profile = PROFILES[baby];
  const color = BABY_COLORS[baby];

  if (!prediction) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
        <h3 className="font-semibold text-gray-700">{profile.name}</h3>
        <p className="text-sm text-gray-400 mt-1">Pas assez de données</p>
      </div>
    );
  }

  const timeStr = format(prediction.timing.predictedTime, 'HH:mm', { locale: fr });
  const confidenceLabel =
    prediction.confidence === 'high'
      ? 'Fiable'
      : prediction.confidence === 'medium'
        ? 'Modérée'
        : 'Estimée';
  const confidenceColor =
    prediction.confidence === 'high'
      ? 'bg-green-100 text-green-700'
      : prediction.confidence === 'medium'
        ? 'bg-yellow-100 text-yellow-700'
        : 'bg-gray-100 text-gray-500';

  return (
    <div
      className="bg-white rounded-xl border-2 p-3 sm:p-4 space-y-2 sm:space-y-3"
      style={{ borderColor: color }}
    >
      {/* Accuracy score — topmost element */}
      {accuracy !== null && (
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold leading-none ${accuracyColor(accuracy)}`}>
            {Math.round(accuracy * 100)}%
          </span>
          <span className="text-[10px] text-gray-400 uppercase tracking-wide">précision</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{profile.name}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceColor}`}>
          {confidenceLabel}
        </span>
      </div>

      {/* Timing */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide">Prochain repas</p>
        <p className="text-xl sm:text-2xl font-bold text-gray-800">{timeStr}</p>
        <p className="text-xs text-gray-400">
          ±{prediction.timing.confidenceMinutes} min
        </p>
      </div>

      {/* Volume */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide">Volume estimé</p>
        <p className="text-base sm:text-lg font-semibold text-gray-700">
          {prediction.volume.predictedMl} ml
        </p>
        <p className="text-xs text-gray-400">
          {prediction.volume.p10Ml}–{prediction.volume.p90Ml} ml
        </p>
      </div>

      {/* Explanations */}
      {prediction.explanations.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Raisons</p>
          {prediction.explanations.slice(0, 3).map((exp) => (
            <p key={exp.ruleId} className="text-xs text-gray-500">
              • {exp.text} <span className="text-gray-400">({exp.impact})</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
