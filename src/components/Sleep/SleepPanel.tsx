import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Moon, Clock, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import type { BabyName, FeedSleepAnalysis, InsightConfidence } from '../../types';
import type { SleepAnalysis } from '../../engine/sleep';
import { PROFILES } from '../../data/knowledge';

interface SleepPanelProps {
  analyses: Record<BabyName, SleepAnalysis>;
  feedSleepInsights: Record<BabyName, FeedSleepAnalysis | null>;
}

const confidenceColors: Record<InsightConfidence, { dot: string; text: string }> = {
  forte: { dot: 'bg-green-400', text: 'text-green-600' },
  moderee: { dot: 'bg-yellow-400', text: 'text-yellow-600' },
  faible: { dot: 'bg-gray-300', text: 'text-gray-400' },
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

export function SleepPanel({ analyses, feedSleepInsights }: SleepPanelProps) {
  const allInsights = [
    ...(feedSleepInsights.colette?.insights ?? []),
    ...(feedSleepInsights.isaure?.insights ?? []),
  ];
  const hasInsights = allInsights.length > 0;

  const [insightsOpen, setInsightsOpen] = useState(hasInsights);

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

              {/* Next nap */}
              {analysis.nextNap && (
                <div className="bg-indigo-50 rounded-lg p-2 space-y-0.5">
                  <div className="flex items-center gap-1">
                    <Clock className="text-indigo-400" size={12} />
                    <span className="text-xs font-medium text-indigo-600">
                      Prochaine sieste
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-indigo-700">
                    {formatTime(analysis.nextNap.predictedTime)}{' '}
                    <span className="text-xs font-normal text-indigo-400">
                      (±30 min)
                    </span>
                  </p>
                  <p className="text-[11px] text-indigo-400">
                    ~{analysis.nextNap.estimatedDurationMin} min estimées
                  </p>
                </div>
              )}

              {!analysis.nextNap && analysis.napsToday >= 1 && (
                <p className="text-xs text-gray-400 italic">
                  {analysis.napsToday} sieste{analysis.napsToday > 1 ? 's' : ''} aujourd'hui — pas d'autre prévue
                </p>
              )}

              {/* Bedtime */}
              {analysis.bedtime && (
                <div className="bg-purple-50 rounded-lg p-2 space-y-0.5">
                  <div className="flex items-center gap-1">
                    <Moon className="text-purple-400" size={12} />
                    <span className="text-xs font-medium text-purple-600">
                      Dodo
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-purple-700">
                    {formatTime(analysis.bedtime.predictedTime)}{' '}
                    <span className="text-xs font-normal text-purple-400">
                      (±30 min)
                    </span>
                  </p>
                  <p className="text-[11px] text-purple-400">
                    ~{formatDuration(analysis.bedtime.estimatedDurationMin)} de nuit estimées
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Feed-Sleep Insights section (kept as-is) */}
      {hasInsights && (
        <div className="border-t border-gray-100 pt-3 space-y-3">
          <button
            onClick={() => setInsightsOpen(!insightsOpen)}
            className="flex items-center justify-between w-full text-left min-h-[44px] py-1"
          >
            <div className="flex items-center gap-1.5">
              <Lightbulb className="text-amber-400" size={14} />
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                Observations repas & sommeil
              </span>
            </div>
            {insightsOpen ? (
              <ChevronUp className="text-gray-400" size={14} />
            ) : (
              <ChevronDown className="text-gray-400" size={14} />
            )}
          </button>

          {insightsOpen && (
            <div className="space-y-4">
              {(['colette', 'isaure'] as BabyName[]).map((baby) => {
                const insights = feedSleepInsights[baby]?.insights ?? [];
                if (insights.length === 0) return null;

                return (
                  <div key={baby} className="space-y-2">
                    <p className="text-xs font-medium text-gray-500">
                      {PROFILES[baby].name}
                    </p>
                    {insights.map((insight) => {
                      const colors = confidenceColors[insight.confidence];
                      return (
                        <div
                          key={insight.id}
                          className="bg-gray-50 rounded-lg p-3 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-700">
                              {insight.label}
                            </span>
                            <div className="flex items-center gap-1">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                              <span className={`text-[10px] ${colors.text}`}>
                                {insight.confidence}
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
                          <p className="text-[10px] text-gray-300">
                            {insight.dataPoints} observations
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              <p className="text-[10px] text-gray-300 italic text-center">
                Basé sur l'historique — indicateurs, pas des certitudes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
