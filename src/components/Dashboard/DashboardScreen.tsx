import { useMemo } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { RefreshCw, ClipboardList, Upload } from 'lucide-react';
import { computeDayAccuracy } from '../../engine/accuracy';
import { useStore } from '../../store';
import { usePredictions } from '../../hooks/usePredictions';
import { generateRecommendations } from '../../data/recommendations';
import { BabyCard } from '../BabyCard/BabyCard';
import { AlertsList } from '../Alerts/AlertsList';
import { SleepPanel } from '../Sleep/SleepPanel';
import { Recommendations } from '../Recommendations/Recommendations';
import { QuickLog } from '../QuickLog/QuickLog';
import { SleepLog } from '../QuickLog/SleepLog';
import { NightModule } from '../Night/NightModule';
import { NightRecapCard } from '../Night/NightRecap';
import type { BabyName } from '../../types';
import { PROFILES, BABY_COLORS } from '../../data/knowledge';

export function DashboardScreen() {
  const {
    predictions,
    alerts,
    patterns,
    sleepAnalyses,
    feeds,
    sleeps,
    lastUpdated,
    refreshPredictions,
  } = usePredictions();

  const setScreen = useStore((s) => s.setScreen);
  const dismissAlert = useStore((s) => s.dismissAlert);
  const feedSleepInsights = useStore((s) => s.feedSleepInsights);

  const now = new Date();

  // Accuracy scores
  const accuracies = useMemo(() => {
    const n = new Date();
    return {
      colette: computeDayAccuracy(feeds, sleeps, 'colette', n),
      isaure: computeDayAccuracy(feeds, sleeps, 'isaure', n),
    };
  }, [feeds, sleeps]);

  // Recommendations
  const recommendations = generateRecommendations(feeds, patterns, predictions);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-4 py-3 safe-top">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-semibold text-gray-800">TwinFeed</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setScreen('import')}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 active:text-gray-800 transition-colors"
              title="Importer CSV"
            >
              <Upload size={20} />
            </button>
            <button
              onClick={refreshPredictions}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 active:text-gray-800 transition-colors"
              title="Rafraîchir"
            >
              <RefreshCw size={20} />
            </button>
            <button
              onClick={() => setScreen('entries')}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 active:text-gray-800 transition-colors"
              title="Saisies du jour"
            >
              <ClipboardList size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-3 sm:space-y-4 pb-8">
        {/* Night module (top when active) */}
        <NightModule analyses={sleepAnalyses} />

        {/* Night recap (after night ends) */}
        <NightRecapCard />

        {/* Accuracy block */}
        {(accuracies.colette !== null || accuracies.isaure !== null) && (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {(['colette', 'isaure'] as BabyName[]).map((baby) => {
              const acc = accuracies[baby];
              const babyColor = BABY_COLORS[baby];
              const scoreColor =
                acc === null
                  ? '#9ca3af'
                  : acc >= 0.8
                    ? '#16a34a'
                    : acc >= 0.6
                      ? '#d97706'
                      : '#ea580c';
              return (
                <div
                  key={baby}
                  className="bg-white rounded-xl p-3 sm:p-4 text-center"
                  style={{ borderTop: `3px solid ${babyColor}` }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-widest mb-2"
                    style={{ color: babyColor }}
                  >
                    {PROFILES[baby].name}
                  </p>
                  <p
                    className="text-4xl sm:text-5xl font-bold leading-none"
                    style={{ color: scoreColor }}
                  >
                    {acc !== null ? `${Math.round(acc * 100)}%` : '—'}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-2">précision repas & dodo</p>
                  {acc !== null && (
                    <div className="w-full h-1 bg-gray-100 rounded-full mt-2.5">
                      <div
                        className="h-1 rounded-full"
                        style={{ width: `${Math.round(acc * 100)}%`, backgroundColor: scoreColor }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Quick log */}
        <QuickLog />

        {/* Alerts */}
        <AlertsList alerts={alerts} onDismiss={dismissAlert} />

        {/* Baby cards */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {(['colette', 'isaure'] as BabyName[]).map((baby) => (
            <BabyCard key={baby} baby={baby} prediction={predictions[baby]} />
          ))}
        </div>

        {/* Sleep log + panel */}
        <SleepLog />
        <SleepPanel analyses={sleepAnalyses} feedSleepInsights={feedSleepInsights} hour={now.getHours()} />

        {/* Recommendations */}
        <Recommendations recommendations={recommendations} />

        {/* Footer */}
        {lastUpdated && (
          <p className="text-xs text-gray-400 text-center pb-4">
            Mis à jour à {format(lastUpdated, 'HH:mm', { locale: fr })} —{' '}
            {feeds.length} repas chargés
          </p>
        )}
      </main>
    </div>
  );
}
