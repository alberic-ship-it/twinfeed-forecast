import { ArrowLeft } from 'lucide-react';
import { useStore } from '../../store';
import { PROFILES, BABY_COLORS } from '../../data/knowledge';
import type { BabyName, FeedRecord } from '../../types';

export function InsightsScreen() {
  const setScreen = useStore((s) => s.setScreen);
  const feeds = useStore((s) => s.feeds);
  const patterns = useStore((s) => s.patterns);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-4 py-3 safe-top">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => setScreen('dashboard')}
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 active:text-gray-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-800">Insights</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-3 sm:space-y-4">
        {/* Stats per baby */}
        {(['colette', 'isaure'] as BabyName[]).map((baby) => {
          const profile = PROFILES[baby];
          const color = BABY_COLORS[baby];
          const babyFeeds = feeds.filter((f) => f.baby === baby);
          const bottleFeeds = babyFeeds.filter((f) => f.type === 'bottle' && f.volumeMl > 0);
          const breastFeeds = babyFeeds.filter((f) => f.type === 'breast');

          const avgVolume =
            bottleFeeds.length > 0
              ? Math.round(
                  bottleFeeds.reduce((s, f) => s + f.volumeMl, 0) / bottleFeeds.length,
                )
              : 0;

          const avgInterval = computeAvgInterval(babyFeeds);

          return (
            <div
              key={baby}
              className="bg-white rounded-xl border-2 p-3 sm:p-4 space-y-3"
              style={{ borderColor: color }}
            >
              <h3 className="font-semibold text-gray-800">{profile.name}</h3>

              <div className="grid grid-cols-2 gap-2 sm:gap-3 text-center">
                <Stat label="Biberons" value={String(bottleFeeds.length)} />
                <Stat label="Tétées" value={String(breastFeeds.length)} />
                <Stat label="Volume moyen" value={`${avgVolume} ml`} />
                <Stat label="Intervalle moyen" value={`${avgInterval}h`} />
              </div>

              {/* Slot breakdown */}
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                  Moyenne par créneau
                </p>
                <div className="space-y-1">
                  {profile.slots.map((slot) => {
                    const slotFeeds = bottleFeeds.filter((f) =>
                      slot.hours.includes(f.timestamp.getHours()),
                    );
                    const slotAvg =
                      slotFeeds.length > 0
                        ? Math.round(
                            slotFeeds.reduce((s, f) => s + f.volumeMl, 0) / slotFeeds.length,
                          )
                        : slot.meanMl;
                    const slotLabel =
                      slot.id === 'morning'
                        ? 'Matin'
                        : slot.id === 'midday'
                          ? 'Mi-journée'
                          : slot.id === 'afternoon'
                            ? 'Après-midi'
                            : slot.id === 'evening'
                              ? 'Soir'
                              : 'Nuit';

                    const barWidth = Math.min(100, Math.round((slotAvg / 180) * 100));

                    return (
                      <div key={slot.id} className="flex items-center gap-2 text-xs">
                        <span className="w-16 sm:w-20 text-gray-500 text-right shrink-0">{slotLabel}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                        <span className="w-12 text-gray-500 shrink-0">{slotAvg}ml</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* Active patterns */}
        {patterns.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 space-y-2">
            <h3 className="text-xs text-gray-400 uppercase tracking-wide">
              Patterns détectés
            </h3>
            {patterns.map((p, i) => (
              <div key={`${p.id}-${p.baby}-${i}`} className="text-sm">
                <span className="font-medium text-gray-700">
                  {PROFILES[p.baby].name}
                </span>
                <span className="text-gray-400"> — </span>
                <span className="text-gray-600">{p.label}</span>
                <p className="text-xs text-gray-400">{p.description}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-semibold text-gray-800">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}

function computeAvgInterval(feeds: FeedRecord[]): string {
  if (feeds.length < 2) return '—';
  const sorted = [...feeds].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  let totalH = 0;
  let count = 0;
  for (let i = 1; i < sorted.length; i++) {
    const diffH = (sorted[i].timestamp.getTime() - sorted[i - 1].timestamp.getTime()) / (1000 * 60 * 60);
    if (diffH > 0.5 && diffH < 12) {
      totalH += diffH;
      count++;
    }
  }
  return count > 0 ? (totalH / count).toFixed(1) : '—';
}
