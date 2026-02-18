import { Lightbulb, BookOpen, Baby, Moon } from 'lucide-react';
import type { Recommendation } from '../../data/recommendations';

interface RecommendationsProps {
  recommendations: Recommendation[];
}

const CATEGORY_ICONS = {
  pattern: Lightbulb,
  feeding: Baby,
  sleep: Moon,
  development: BookOpen,
};

const CATEGORY_LABELS: Record<string, string> = {
  pattern: 'Rythmes',
  feeding: 'Alimentation',
  sleep: 'Sommeil',
  development: 'Développement',
};

export function Recommendations({ recommendations }: RecommendationsProps) {
  if (recommendations.length === 0) return null;

  return (
    <details className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
      <summary className="text-xs text-gray-400 uppercase tracking-wide cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        Recommandations
      </summary>
      <div className="space-y-2 mt-3">
        {recommendations.map((rec) => (
          <RecItem key={rec.id} rec={rec} />
        ))}
      </div>
    </details>
  );
}

function RecItem({ rec }: { rec: Recommendation }) {
  const category = rec.category ?? 'pattern';
  const Icon = CATEGORY_ICONS[category] ?? Lightbulb;

  const iconColor =
    rec.type === 'benchmark'
      ? 'text-indigo-400'
      : rec.type === 'suggestion'
        ? 'text-amber-400'
        : rec.type === 'reassurance'
          ? 'text-green-400'
          : 'text-blue-400';

  return (
    <div className="flex items-start gap-2.5">
      <Icon className={`flex-shrink-0 mt-0.5 ${iconColor}`} size={14} />
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-700">{rec.title}</p>
          {rec.category && rec.category !== 'pattern' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">
              {CATEGORY_LABELS[rec.category]}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{rec.message}</p>
      </div>
    </div>
  );
}
