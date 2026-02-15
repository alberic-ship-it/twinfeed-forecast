import { Lightbulb, BookOpen, Baby, Moon, Users } from 'lucide-react';
import type { Recommendation } from '../../data/recommendations';

interface RecommendationsProps {
  recommendations: Recommendation[];
}

const CATEGORY_ICONS = {
  pattern: Lightbulb,
  feeding: Baby,
  sleep: Moon,
  development: BookOpen,
  twins: Users,
};

const CATEGORY_LABELS: Record<string, string> = {
  pattern: 'Patterns',
  feeding: 'Alimentation',
  sleep: 'Sommeil',
  development: 'Developpement',
  twins: 'Jumelles',
};

export function Recommendations({ recommendations }: RecommendationsProps) {
  if (recommendations.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 space-y-3">
      <h3 className="text-xs text-gray-400 uppercase tracking-wide">
        Recommandations
      </h3>
      <div className="space-y-2">
        {recommendations.map((rec) => (
          <RecItem key={rec.id} rec={rec} />
        ))}
      </div>
    </div>
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
