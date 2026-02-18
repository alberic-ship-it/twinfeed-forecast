import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Moon, Square } from 'lucide-react';
import type { BabyName } from '../../types';
import type { SleepAnalysis } from '../../engine/sleep';
import { useStore } from '../../store';
import { PROFILES } from '../../data/knowledge';

interface NightModuleProps {
  analyses: Record<BabyName, SleepAnalysis>;
}

function formatTime(date: Date): string {
  return format(date, 'HH:mm', { locale: fr });
}

function formatDurationHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
}

export function NightModule({ analyses }: NightModuleProps) {
  const nightSessions = useStore((s) => s.nightSessions);
  const endNight = useStore((s) => s.endNight);
  const [, setTick] = useState(0);

  // Refresh every 60s for live timer
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const activeBabies = (['colette', 'isaure'] as BabyName[]).filter(
    (b) => nightSessions[b] && !nightSessions[b]!.endTime
  );

  if (activeBabies.length === 0) return null;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Moon className="text-indigo-300" size={16} />
        <h3 className="text-xs text-slate-400 uppercase tracking-wide font-medium">
          Nuit en cours
        </h3>
      </div>

      <div className={`grid gap-3 ${activeBabies.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {activeBabies.map((baby) => {
          const session = nightSessions[baby]!;
          const analysis = analyses[baby];
          const progress = analysis.nightProgress;
          const profile = PROFILES[baby];
          const now = new Date();

          const durationMin = Math.round((now.getTime() - session.startTime.getTime()) / 60_000);
          const medianNight = progress?.medianNightDurationMin ?? 600;
          const progressPct = Math.min(100, Math.round((durationMin / medianNight) * 100));

          const lastFeed = session.feeds.length > 0 ? session.feeds[session.feeds.length - 1] : null;
          const lastFeedAgoMin = lastFeed
            ? Math.round((now.getTime() - lastFeed.timestamp.getTime()) / 60_000)
            : null;

          return (
            <div key={baby} className="space-y-2.5">
              <span className="text-sm font-medium text-slate-200">
                {profile.name}
              </span>

              {/* Live timer */}
              <div>
                <p className="text-2xl sm:text-3xl font-bold text-indigo-300 leading-tight">
                  {formatDurationHM(durationMin)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  depuis {formatTime(session.startTime)}
                </p>
              </div>

              {/* Progress bar */}
              <div>
                <div className="w-full bg-slate-700 rounded-full h-1.5">
                  <div
                    className="bg-indigo-400 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {progressPct}% de la nuit médiane ({formatDurationHM(medianNight)})
                </p>
              </div>

              {/* Night feeds list */}
              {session.feeds.length > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[11px] text-slate-400 font-medium">
                    {session.feeds.length} repas cette nuit
                  </p>
                  {session.feeds.map((f) => (
                    <p key={f.id} className="text-[11px] text-slate-500">
                      {formatTime(f.timestamp)} · {f.volumeMl > 0 ? `${f.volumeMl} ml` : f.type === 'breast' ? 'Tétée' : 'Biberon'}
                    </p>
                  ))}
                </div>
              )}

              {/* Last feed ago */}
              {lastFeedAgoMin !== null && (
                <p className="text-[11px] text-slate-400">
                  Dernier repas il y a {lastFeedAgoMin} min
                </p>
              )}

              {/* Expected wake time */}
              {progress?.expectedWakeTime && (
                <p className="text-[11px] text-indigo-300">
                  Réveil estimé ~{formatTime(progress.expectedWakeTime)}
                </p>
              )}

              {/* End night button */}
              <button
                onClick={() => endNight(baby)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-200 text-xs font-medium rounded-lg transition-colors w-full justify-center"
              >
                <Square size={12} />
                Terminer la nuit
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
