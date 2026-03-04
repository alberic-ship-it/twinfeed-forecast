import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Moon, Square, Pencil, Plus, X, Check, Trash2 } from 'lucide-react';
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

function getCurrentTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function buildTimestamp(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  // If more than 1 min in the future, assume it refers to yesterday
  if (d.getTime() > Date.now() + 60_000) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

export function NightModule({ analyses }: NightModuleProps) {
  const nightSessions = useStore((s) => s.nightSessions);
  const predictions = useStore((s) => s.predictions);
  const endNight = useStore((s) => s.endNight);
  const cancelNight = useStore((s) => s.cancelNight);
  const logFeed = useStore((s) => s.logFeed);
  const updateNightStartTime = useStore((s) => s.updateNightStartTime);
  const [, setTick] = useState(0);

  // Form state — one active form at a time
  const [activeForm, setActiveForm] = useState<{ baby: BabyName; kind: 'feed' | 'editStart' } | null>(null);
  const [cancelConfirmBaby, setCancelConfirmBaby] = useState<BabyName | null>(null);
  const [feedType, setFeedType] = useState<'bottle' | 'breast'>('bottle');
  const [mlValue, setMlValue] = useState(130);
  const [customTimeStr, setCustomTimeStr] = useState('');

  // Refresh every 60s for live timer
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const activeBabies = (['colette', 'isaure'] as BabyName[]).filter(
    (b) => nightSessions[b] && !nightSessions[b]!.endTime
  );

  if (activeBabies.length === 0) return null;

  const openFeedForm = (baby: BabyName) => {
    setActiveForm({ baby, kind: 'feed' });
    setFeedType('bottle');
    setMlValue(130);
    setCustomTimeStr(getCurrentTimeStr());
  };

  const openEditStart = (baby: BabyName) => {
    const session = nightSessions[baby];
    if (!session) return;
    setActiveForm({ baby, kind: 'editStart' });
    setCustomTimeStr(formatTime(session.startTime));
  };

  const closeForm = () => setActiveForm(null);

  const handleSubmitFeed = (baby: BabyName) => {
    if (!customTimeStr) return;
    // logFeed returns false if rejected as near-duplicate — close form regardless
    logFeed(baby, feedType, feedType === 'bottle' ? mlValue : undefined, buildTimestamp(customTimeStr));
    closeForm();
  };

  const handleSubmitEditStart = (baby: BabyName) => {
    if (!customTimeStr) return;
    updateNightStartTime(baby, buildTimestamp(customTimeStr));
    closeForm();
  };

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

          const nextFeedTime = predictions[baby]?.timing.predictedTime;
          const isIntermediateWake = nextFeedTime && progress?.expectedWakeTime
            && nextFeedTime < progress.expectedWakeTime;

          const isFormActive = activeForm?.baby === baby;
          const showFeedForm = isFormActive && activeForm?.kind === 'feed';
          const showEditStart = isFormActive && activeForm?.kind === 'editStart';

          return (
            <div key={baby} className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200">
                  {profile.name}
                </span>
                {cancelConfirmBaby !== baby && (
                  <button
                    onClick={() => setCancelConfirmBaby(baby)}
                    className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                    title="Supprimer cette session"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              {/* Live timer */}
              <div>
                <p className="text-2xl sm:text-3xl font-bold text-indigo-300 leading-tight">
                  {formatDurationHM(durationMin)}
                </p>

                {/* Start time — editable */}
                {showEditStart ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="time"
                      value={customTimeStr}
                      onChange={(e) => setCustomTimeStr(e.target.value)}
                      className="text-xs bg-slate-700 text-slate-200 rounded px-1.5 py-0.5 border border-slate-600 outline-none"
                    />
                    <button
                      onClick={() => handleSubmitEditStart(baby)}
                      className="p-1 text-indigo-300 hover:text-indigo-200 transition-colors"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={closeForm}
                      className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => openEditStart(baby)}
                    className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5 hover:text-slate-300 transition-colors group"
                  >
                    <span>depuis {formatTime(session.startTime)}</span>
                    <Pencil size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
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

              {/* Night wake-ups list */}
              {session.feeds.length > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[11px] text-slate-400 font-medium">
                    {session.feeds.length} réveil{session.feeds.length > 1 ? 's' : ''} cette nuit
                  </p>
                  {session.feeds.map((f) => (
                    <p key={f.id} className="text-[11px] text-slate-500">
                      {formatTime(f.timestamp)} · {f.type === 'solid' ? 'Solide' : f.volumeMl > 0 ? `${f.volumeMl} ml` : f.type === 'breast' ? 'Tétée' : 'Biberon'}
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

              {/* Prochain réveil intermédiaire */}
              {isIntermediateWake && nextFeedTime && (
                <p className="text-[11px] text-amber-300/80">
                  Prochain réveil ~{formatTime(nextFeedTime)}
                </p>
              )}

              {/* Réveil matinal estimé */}
              {progress?.expectedWakeTime && (
                <p className="text-[11px] text-indigo-300">
                  Réveil matin ~{formatTime(progress.expectedWakeTime)}
                </p>
              )}

              {/* Inline réveil form */}
              {showFeedForm && (
                <div className="bg-slate-700 rounded-lg p-2.5 space-y-2">
                  {/* Biberon / Tétée toggle */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setFeedType('bottle')}
                      className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                        feedType === 'bottle'
                          ? 'bg-indigo-500 text-white'
                          : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                      }`}
                    >
                      Biberon
                    </button>
                    <button
                      onClick={() => setFeedType('breast')}
                      className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                        feedType === 'breast'
                          ? 'bg-indigo-500 text-white'
                          : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                      }`}
                    >
                      Tétée
                    </button>
                  </div>

                  {/* ml selector */}
                  {feedType === 'bottle' && (
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setMlValue(Math.max(30, mlValue - 10))}
                        className="w-7 h-7 rounded-full bg-slate-600 text-slate-200 text-sm font-bold hover:bg-slate-500 transition-colors"
                      >
                        -
                      </button>
                      <span className="text-base font-bold text-slate-200 w-16 text-center tabular-nums">
                        {mlValue} ml
                      </span>
                      <button
                        onClick={() => setMlValue(Math.min(300, mlValue + 10))}
                        className="w-7 h-7 rounded-full bg-slate-600 text-slate-200 text-sm font-bold hover:bg-slate-500 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  )}

                  {/* Time */}
                  <div className="flex items-center justify-between px-0.5">
                    <span className="text-[11px] text-slate-400">Heure</span>
                    <input
                      type="time"
                      value={customTimeStr}
                      onChange={(e) => setCustomTimeStr(e.target.value)}
                      className="text-xs bg-slate-600 text-slate-200 rounded px-1.5 py-0.5 border border-slate-500 outline-none"
                    />
                  </div>

                  {/* Validate / Cancel */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={closeForm}
                      className="flex-1 py-1.5 rounded text-xs text-slate-400 bg-slate-600 hover:bg-slate-500 transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={() => handleSubmitFeed(baby)}
                      className="flex-1 py-1.5 rounded text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-400 transition-colors"
                    >
                      Valider
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {!showFeedForm && (
                cancelConfirmBaby === baby ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { cancelNight(baby); setCancelConfirmBaby(null); }}
                      className="flex-1 py-2 rounded-lg text-xs font-medium text-white bg-red-500 hover:bg-red-400 active:bg-red-600 transition-colors"
                    >
                      Supprimer
                    </button>
                    <button
                      onClick={() => setCancelConfirmBaby(null)}
                      className="flex-1 py-2 rounded-lg text-xs text-slate-400 bg-slate-700 hover:bg-slate-600 transition-colors"
                    >
                      Conserver
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => openFeedForm(baby)}
                      className="flex items-center gap-1 px-2.5 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-300 text-xs font-medium rounded-lg transition-colors flex-1 justify-center"
                    >
                      <Plus size={12} />
                      Réveil
                    </button>
                    <button
                      onClick={() => endNight(baby)}
                      className="flex items-center gap-1.5 px-2.5 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-200 text-xs font-medium rounded-lg transition-colors flex-1 justify-center"
                    >
                      <Square size={12} />
                      Terminer
                    </button>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
