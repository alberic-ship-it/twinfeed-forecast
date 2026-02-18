import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Lightbulb, BookOpen, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';
import type { BabyName, FeedSleepAnalysis, InsightConfidence } from '../../types';
import type { SleepAnalysis } from '../../engine/sleep';
import { useStore } from '../../store';
import { PROFILES, getHourlyFacts } from '../../data/knowledge';

interface SleepPanelProps {
  analyses: Record<BabyName, SleepAnalysis>;
  feedSleepInsights: Record<BabyName, FeedSleepAnalysis | null>;
  hour: number;
}

const confidenceColors: Record<InsightConfidence, { dot: string; text: string }> = {
  forte: { dot: 'bg-green-400', text: 'text-green-600' },
  moderee: { dot: 'bg-yellow-400', text: 'text-yellow-600' },
  faible: { dot: 'bg-gray-300', text: 'text-gray-400' },
};

const confidenceLabels: Record<InsightConfidence, string> = {
  forte: 'forte',
  moderee: 'modérée',
  faible: 'faible',
};

function formatTime(date: Date): string {
  return format(date, 'HH:mm', { locale: fr });
}

function formatDuration(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
  }
  return `${min} min`;
}

const FACT_CATEGORY_LABELS: Record<string, string> = {
  feeding: 'Alimentation',
  sleep: 'Sommeil',
  development: 'Développement',
  twins: 'Jumelles',
};

const FACT_CATEGORY_COLORS: Record<string, string> = {
  feeding: 'bg-orange-100 text-orange-600',
  sleep: 'bg-indigo-100 text-indigo-600',
  development: 'bg-emerald-100 text-emerald-600',
  twins: 'bg-pink-100 text-pink-600',
};

const QUALITY_COLORS: Record<string, string> = {
  good: 'bg-green-100 text-green-700',
  fair: 'bg-orange-100 text-orange-700',
  poor: 'bg-red-100 text-red-700',
};

/**
 * Pick 1 insight per baby, prioritizing the hourly contextual insight
 * (tied to the current time slot). Falls back to general insights
 * with hourly rotation if no contextual insight exists.
 */
function pickHourlyInsight(insights: FeedSleepAnalysis | null, hour: number) {
  const all = insights?.insights ?? [];
  if (all.length === 0) return null;

  const hourlyContextual = all.find((i) => i.id.startsWith('hourly-'));
  if (hourlyContextual) return hourlyContextual;

  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  const idx = (dayOfYear * 13 + hour) % all.length;
  return all[idx];
}

export function SleepPanel({ analyses, feedSleepInsights, hour }: SleepPanelProps) {
  const deleteSleep = useStore((s) => s.deleteSleep);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const coletteInsight = useMemo(() => pickHourlyInsight(feedSleepInsights.colette, hour), [feedSleepInsights.colette, hour]);
  const isaureInsight = useMemo(() => pickHourlyInsight(feedSleepInsights.isaure, hour), [feedSleepInsights.isaure, hour]);
  const hasInsights = coletteInsight || isaureInsight;

  const facts = useMemo(() => getHourlyFacts(hour), [hour]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 space-y-3">
      <h3 className="text-xs text-gray-400 uppercase tracking-wide">
        Sommeil
      </h3>

      {/* Predictions grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {(['colette', 'isaure'] as BabyName[]).map((baby) => {
          const analysis = analyses[baby];
          const profile = PROFILES[baby];

          return (
            <div key={baby} className="space-y-2">
              <span className="text-sm font-medium text-gray-700">
                {profile.name}
              </span>

              {/* Next nap — normal */}
              {analysis.nextNap && analysis.sleepStatus === 'naps_remaining' && (
                <div className="bg-indigo-50 rounded-lg p-2.5">
                  <p className="text-[11px] text-indigo-400 uppercase tracking-wide font-medium">Prochaine sieste</p>
                  <p className="text-xl sm:text-2xl font-bold text-indigo-700 leading-tight">
                    {formatTime(analysis.nextNap.predictedTime)}
                  </p>
                  <p className="text-[11px] text-indigo-300 mt-0.5">
                    ±{analysis.nextNap.confidenceMin} min · ~{analysis.nextNap.estimatedDurationMin} min
                  </p>
                  {analysis.nextNap.hint && (
                    <p className="text-[11px] text-amber-500 mt-0.5">
                      {analysis.nextNap.hint}
                    </p>
                  )}
                </div>
              )}

              {/* Rescue nap */}
              {analysis.nextNap && analysis.sleepStatus === 'rescue_nap' && (
                <div className="bg-orange-50 rounded-lg p-2.5">
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="text-orange-400" size={11} />
                    <p className="text-[11px] text-orange-400 uppercase tracking-wide font-medium">Rattrapage</p>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-orange-600 leading-tight">
                    {formatTime(analysis.nextNap.predictedTime)}
                  </p>
                  <p className="text-[11px] text-orange-300 mt-0.5">
                    ±{analysis.nextNap.confidenceMin} min · ~{analysis.nextNap.estimatedDurationMin} min
                  </p>
                  {analysis.nextNap.hint && (
                    <p className="text-[11px] text-orange-500 mt-0.5">
                      {analysis.nextNap.hint}
                    </p>
                  )}
                </div>
              )}

              {/* Naps done — enriched card */}
              {analysis.sleepStatus === 'naps_done' && (
                <div className="bg-green-50 rounded-lg p-2.5">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="text-green-500" size={11} />
                    <p className="text-[11px] text-green-500 uppercase tracking-wide font-medium">Siestes terminées</p>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-green-700 leading-tight">
                    {analysis.napsToday} sieste{analysis.napsToday > 1 ? 's' : ''}
                  </p>
                  <p className="text-[11px] text-green-400 mt-0.5">
                    {formatDuration(analysis.totalSleepToday)} de sommeil · moy. {analysis.napsToday > 0 ? Math.round(analysis.totalSleepToday / analysis.napsToday) : 0} min
                  </p>
                </div>
              )}

              {/* Bedtime */}
              {analysis.bedtime && (() => {
                const wakeTime = new Date(analysis.bedtime.predictedTime.getTime() + analysis.bedtime.estimatedDurationMin * 60_000);
                return (
                  <div className="bg-purple-50 rounded-lg p-2.5">
                    <p className="text-[11px] text-purple-400 uppercase tracking-wide font-medium">Dodo</p>
                    <p className="text-xl sm:text-2xl font-bold text-purple-700 leading-tight">
                      {formatTime(analysis.bedtime.predictedTime)}
                    </p>
                    <p className="text-[11px] text-purple-300 mt-0.5">
                      ±{analysis.bedtime.confidenceMin} min · réveil ~{formatTime(wakeTime)}
                    </p>
                  </div>
                );
              })()}

              {/* Post-bedtime summary: no nextNap AND no bedtime */}
              {!analysis.nextNap && !analysis.bedtime && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">
                    {analysis.napsToday} sieste{analysis.napsToday > 1 ? 's' : ''} · {formatDuration(analysis.totalSleepToday)} de sommeil · dodo à {formatTime(analysis.estimatedBedtimeDate)}
                  </p>
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${QUALITY_COLORS[analysis.sleepQuality]}`}>
                    {analysis.sleepQuality === 'good' ? 'Bon sommeil' : analysis.sleepQuality === 'fair' ? 'Sommeil moyen' : 'Sommeil insuffisant'}
                  </span>
                </div>
              )}

              {/* Today's nap list with delete */}
              {analysis.todayNapRecords.length > 0 && (
                <div className="space-y-0.5">
                  {analysis.todayNapRecords.map((nap) => (
                    <div key={nap.id} className="flex items-center justify-between group">
                      <p className="text-[11px] text-gray-400">
                        {formatTime(nap.startTime)} · {nap.durationMin} min
                      </p>
                      {confirmDelete === nap.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { deleteSleep(nap.id); setConfirmDelete(null); }}
                            className="text-[10px] text-red-500 font-medium px-1.5 py-0.5 rounded bg-red-50 hover:bg-red-100 active:bg-red-200 transition-colors"
                          >
                            Suppr
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-[10px] text-gray-400 px-1 py-0.5"
                          >
                            Non
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(nap.id)}
                          className="p-1 text-gray-300 hover:text-red-400 active:text-red-500 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Feed-Sleep Insights — 1 per baby, collapsed by default */}
      {hasInsights && (
        <details className="border-t border-gray-100 pt-3">
          <summary className="flex items-center gap-1.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <Lightbulb className="text-amber-400" size={14} />
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Observations repas & sommeil
            </span>
          </summary>

          <div className="space-y-2 mt-2">
            {([
              { baby: 'colette' as BabyName, insight: coletteInsight },
              { baby: 'isaure' as BabyName, insight: isaureInsight },
            ]).map(({ baby, insight }) => {
              if (!insight) return null;
              const colors = confidenceColors[insight.confidence];
              return (
                <div key={baby} className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700">
                      {PROFILES[baby].name} — {insight.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                      <span className={`text-[10px] ${colors.text}`}>
                        {confidenceLabels[insight.confidence]}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {insight.observation}
                  </p>
                  {insight.stat && (
                    <p className="text-xs font-semibold text-gray-700">
                      {insight.stat}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Repères bébé de 6 mois — collapsed by default */}
      <details className="border-t border-gray-100 pt-3">
        <summary className="flex items-center gap-1.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <BookOpen className="text-indigo-400" size={14} />
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Repères bébé de 6 mois
          </span>
        </summary>

        <div className="space-y-2 mt-2">
          {facts.map((fact) => (
            <div key={fact.id} className="bg-gray-50 rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700">
                  {fact.title}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${FACT_CATEGORY_COLORS[fact.category]}`}>
                  {FACT_CATEGORY_LABELS[fact.category]}
                </span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                {fact.message}
              </p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
