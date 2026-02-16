import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { BabyName, Prediction, FeedRecord, SleepRecord } from '../../types';
import type { SleepAnalysis } from '../../engine/sleep';
import { BABY_COLORS, PROFILES, DEFAULT_SLEEP } from '../../data/knowledge';
import { projectDayFromData, computeSlotInterval, computeSlotVolume } from '../../engine/predictor';

interface TimelineProps {
  predictions: Record<BabyName, Prediction | null>;
  feeds: FeedRecord[];
  sleeps: SleepRecord[];
  sleepAnalyses: Record<BabyName, SleepAnalysis>;
}

const START_H = 0;
const END_H = 24;
const TOTAL_H = END_H - START_H;

function hourToPercent(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60;
  return Math.max(0, Math.min(100, ((h - START_H) / TOTAL_H) * 100));
}

function isToday(date: Date, now: Date): boolean {
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

interface ProjectedFeed {
  time: Date;
  volumeMl: number;
}

/**
 * Generate projected feeds for the day.
 *
 * - Without manual entries today (profileBased): full day profile schedule
 *   with past projections faded as context.
 * - With manual entries today: forward projections from the prediction,
 *   consistent with BabyCard "prochain repas".
 */
function projectFeedsForDay(
  baby: BabyName,
  pred: Prediction,
  now: Date,
  allFeeds: FeedRecord[],
): ProjectedFeed[] {
  const profile = PROFILES[baby];

  // --- Profile-based mode: past context + future anchored on actual prediction ---
  // Past projections from projectDayFromData for context, future starts from
  // pred.timing.predictedTime to stay consistent with BabyCard "prochain repas".
  if (pred.profileBased) {
    const dayProjections = projectDayFromData(baby, allFeeds, now);
    const pastProjections = dayProjections.filter((p) => p.time < now);

    // Future: anchor on the actual prediction, then chain forward
    const futureProjections: ProjectedFeed[] = [];
    let current = pred.timing.predictedTime;
    if (isToday(current, now)) {
      futureProjections.push({ time: current, volumeMl: pred.volume.predictedMl });
      for (let i = 0; i < 10; i++) {
        const slot = profile.slots.find((s) => s.hours.includes(current.getHours())) ?? profile.slots[0];
        const intervalH = computeSlotInterval(slot.id, baby, allFeeds, now);
        const next = new Date(current.getTime() + intervalH * 3_600_000);
        if (!isToday(next, now) || next.getHours() >= 23) break;
        const nextSlot = profile.slots.find((s) => s.hours.includes(next.getHours())) ?? profile.slots[0];
        const nextVol = computeSlotVolume(nextSlot.id, baby, allFeeds, now);
        futureProjections.push({ time: next, volumeMl: nextVol.meanMl });
        current = next;
      }
    }
    return [...pastProjections, ...futureProjections];
  }

  // --- With manual entries: forward projections from the prediction ---
  // Uses data-driven intervals/volumes (same engine as predictor)
  const projected: ProjectedFeed[] = [];
  let current = pred.timing.predictedTime;
  if (!isToday(current, now)) return [];

  projected.push({ time: current, volumeMl: pred.volume.predictedMl });

  for (let i = 0; i < 10; i++) {
    const slot = profile.slots.find((s) => s.hours.includes(current.getHours())) ?? profile.slots[0];
    const intervalH = computeSlotInterval(slot.id, baby, allFeeds, now);
    const next = new Date(current.getTime() + intervalH * 3_600_000);
    if (!isToday(next, now) || next.getHours() >= 23) break;
    const nextSlot = profile.slots.find((s) => s.hours.includes(next.getHours())) ?? profile.slots[0];
    const nextVol = computeSlotVolume(nextSlot.id, baby, allFeeds, now);
    projected.push({ time: next, volumeMl: nextVol.meanMl });
    current = next;
  }

  return projected;
}

interface ProjectedNap {
  time: Date;
  durationMin: number;
}

/**
 * Project naps for the day — mirrors the feed projection logic:
 *
 * - Profile-based (no manual entries): full day from default nap windows,
 *   past ones faded as context.
 * - With manual entries: forward projections from the sleep analysis,
 *   chaining from the next predicted nap using data-driven inter-nap intervals.
 */
function projectNapsForDay(
  baby: BabyName,
  sleepAn: SleepAnalysis,
  now: Date,
  profileBased: boolean,
): ProjectedNap[] {
  const defaults = DEFAULT_SLEEP[baby];
  const napDuration = sleepAn.avgNapDurationMin;

  // Both modes use sleepAn.nextNap for the first future nap (consistent with SleepPanel).
  // Profile mode adds past default windows for context; manual mode only shows future.

  // Past nap windows (profile mode only — provides day context)
  const pastNaps: ProjectedNap[] = [];
  if (profileBased) {
    for (const t of defaults.bestNapTimes) {
      const napTime = new Date(now);
      napTime.setHours(Math.floor(t.startH), (t.startH % 1) * 60, 0, 0);
      const napEnd = new Date(napTime.getTime() + napDuration * 60_000);
      if (napEnd < now) {
        pastNaps.push({ time: napTime, durationMin: napDuration });
      }
    }
  }

  // Future nap projections — anchored on sleep analysis (same as SleepPanel)
  const naps: ProjectedNap[] = [...pastNaps];

  if (!sleepAn.nextNap) return naps;

  // First projected nap from the sleep engine (matches SleepPanel "Prochaine sieste")
  let current = sleepAn.nextNap.predictedTime;
  naps.push({ time: current, durationMin: sleepAn.nextNap.estimatedDurationMin });

  // Chain forward using median inter-nap interval (like feeds chain with slot intervals)
  const interNapMin = sleepAn.medianInterNapMin;
  if (interNapMin) {
    const maxNaps = defaults.napsPerDay;
    for (let i = sleepAn.napsToday + 1; i < maxNaps; i++) {
      const napEnd = new Date(current.getTime() + napDuration * 60_000);
      const next = new Date(napEnd.getTime() + interNapMin * 60_000);
      if (next.getHours() >= 21 || !isToday(next, now)) break;
      naps.push({ time: next, durationMin: napDuration });
      current = next;
    }
  }

  return naps;
}

const BABY_ROWS: { baby: BabyName; label: string }[] = [
  { baby: 'colette', label: 'C' },
  { baby: 'isaure', label: 'I' },
];

export function Timeline({ predictions, feeds, sleeps, sleepAnalyses }: TimelineProps) {
  const now = new Date();
  const nowPct = hourToPercent(now);

  const hours = Array.from({ length: TOTAL_H + 1 }, (_, i) => START_H + i);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
      <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-3">
        Journée en un coup d'oeil
      </h3>

      {/* Hour axis */}
      <div className="relative ml-6 mr-1">
        <div className="flex justify-between">
          {hours.filter((h) => h % 3 === 0).map((h) => (
            <span key={h} className="text-[10px] text-gray-300 w-0 text-center">
              {h}h
            </span>
          ))}
        </div>
      </div>

      {/* Baby rows */}
      <div className="space-y-1 mt-1">
        {BABY_ROWS.map(({ baby, label }) => {
          const color = BABY_COLORS[baby];
          const babyFeeds = feeds.filter(
            (f) => f.baby === baby && isToday(f.timestamp, now),
          );
          const babySleeps = sleeps.filter(
            (s) => s.baby === baby && isToday(s.startTime, now),
          );
          const pred = predictions[baby];
          const sleepAn = sleepAnalyses[baby];

          // Project feeds & naps for the day
          const projectedFeeds = pred
            ? projectFeedsForDay(baby, pred, now, feeds)
            : [];
          const projectedNaps = projectNapsForDay(baby, sleepAn, now, !!pred?.profileBased);

          // Next prediction text (for when projected feeds are empty = prediction is tomorrow)
          let nextPredText: string | null = null;
          if (pred && projectedFeeds.length === 0) {
            const t = pred.timing.predictedTime;
            nextPredText = `🍼 demain ${format(t, 'HH:mm')} ~${pred.volume.predictedMl}ml`;
          }

          return (
            <div key={baby}>
              <div className="flex items-center gap-1.5">
                {/* Label */}
                <span
                  className="text-xs font-bold w-5 text-center flex-shrink-0 rounded"
                  style={{ color }}
                >
                  {label}
                </span>

                {/* Track */}
                <div className="relative flex-1 h-8">
                  <div className="absolute inset-0 bg-gray-50 rounded-md border border-gray-100" />

                  {/* Past sleeps */}
                  {babySleeps.map((s) => {
                    const left = hourToPercent(s.startTime);
                    const endTime = s.endTime ?? new Date(s.startTime.getTime() + s.durationMin * 60000);
                    const right = hourToPercent(endTime);
                    const width = Math.max(1, right - left);
                    return (
                      <div
                        key={s.id}
                        className="absolute top-1 h-2.5 rounded-sm opacity-30"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          backgroundColor: color,
                        }}
                        title={`Dodo ${s.durationMin}min`}
                      />
                    );
                  })}

                  {/* Past feeds */}
                  {babyFeeds.map((f) => {
                    const left = hourToPercent(f.timestamp);
                    return (
                      <div
                        key={f.id}
                        className="absolute bottom-1 w-2 h-2 rounded-full -ml-1"
                        style={{
                          left: `${left}%`,
                          backgroundColor: color,
                        }}
                        title={`${format(f.timestamp, 'HH:mm', { locale: fr })} — ${f.volumeMl}ml`}
                      />
                    );
                  })}

                  {/* Projected feeds (hollow dots — past ones faded) */}
                  {projectedFeeds.map((pf, i) => {
                    const isPast = pf.time < now;
                    const isNext = !isPast && (i === 0 || projectedFeeds[i - 1].time < now);
                    return (
                      <div key={`pf-${i}`}>
                        <div
                          className="absolute bottom-1 w-3 h-3 rounded-full -ml-1.5 border-2 z-20"
                          style={{
                            left: `${hourToPercent(pf.time)}%`,
                            borderColor: color,
                            backgroundColor: 'white',
                            opacity: isPast ? 0.3 : 1,
                          }}
                          title={`${isPast ? 'Projection' : 'Prévu'} ${format(pf.time, 'HH:mm')} — ~${pf.volumeMl}ml`}
                        />
                        <span
                          className="absolute top-0 text-[8px] font-medium z-20 -translate-x-1/2 whitespace-nowrap"
                          style={{
                            left: `${hourToPercent(pf.time)}%`,
                            color,
                            opacity: isPast ? 0.25 : isNext ? 1 : 0.5,
                          }}
                        >
                          {format(pf.time, 'HH:mm')}
                        </span>
                      </div>
                    );
                  })}

                  {/* Projected naps (dashed blocks — past ones faded) */}
                  {projectedNaps.map((pn, i) => {
                    const napLeft = hourToPercent(pn.time);
                    const napWidth = Math.max(2, (pn.durationMin / (TOTAL_H * 60)) * 100);
                    const napEnd = new Date(pn.time.getTime() + pn.durationMin * 60_000);
                    const isPastNap = napEnd < now;
                    return (
                      <div
                        key={`pn-${i}`}
                        className="absolute top-1 h-2.5 rounded-sm border-2 border-dashed z-10"
                        style={{
                          left: `${napLeft}%`,
                          width: `${napWidth}%`,
                          borderColor: color,
                          backgroundColor: color,
                          opacity: isPastNap ? 0.15 : 0.35,
                        }}
                        title={`${isPastNap ? 'Sieste projetée' : 'Sieste prévue'} ${format(pn.time, 'HH:mm')} ~${pn.durationMin}min`}
                      />
                    );
                  })}

                  {/* Now marker */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
                    style={{ left: `${nowPct}%` }}
                  />
                </div>
              </div>

              {/* "Tomorrow" text when no projections fit today */}
              {nextPredText && (
                <div className="ml-6 mt-0.5">
                  <span className="text-[10px] font-medium" style={{ color }}>
                    {nextPredText}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 ml-6">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-[10px] text-gray-400">repas</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-gray-300" />
          <span className="text-[10px] text-gray-400">dodo</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full border-2 border-gray-400 bg-white" />
          <span className="text-[10px] text-gray-400">prévu</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm border border-dashed border-gray-400 bg-gray-200" />
          <span className="text-[10px] text-gray-400">sieste prévue</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-px h-3 bg-red-400" />
          <span className="text-[10px] text-gray-400">maintenant</span>
        </div>
      </div>
    </div>
  );
}
