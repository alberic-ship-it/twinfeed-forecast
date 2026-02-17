import { format, differenceInMinutes } from 'date-fns';
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

// Timeline spans 6h–23h (relevant waking hours + bedtime)
const START_H = 6;
const END_H = 23;
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

// ── Projected feed helpers ──

interface ProjectedFeed {
  time: Date;
  volumeMl: number;
}

function projectFeedsForDay(
  baby: BabyName,
  pred: Prediction,
  now: Date,
  allFeeds: FeedRecord[],
): ProjectedFeed[] {
  const profile = PROFILES[baby];

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayFeeds = allFeeds.filter(
    (f) => f.baby === baby && f.timestamp >= todayStart && f.timestamp <= now,
  );

  const dayProjections = projectDayFromData(baby, allFeeds, now);
  const pastProjections = dayProjections
    .filter((p) => p.time < now)
    .filter((p) => {
      return !todayFeeds.some(
        (f) => Math.abs(f.timestamp.getTime() - p.time.getTime()) < 45 * 60_000,
      );
    });

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

// ── Projected nap helpers ──

interface ProjectedNap {
  time: Date;
  durationMin: number;
  isNight?: boolean;
}

function projectNapsForDay(
  baby: BabyName,
  sleepAn: SleepAnalysis,
  now: Date,
  todaySleeps: SleepRecord[],
  allSleeps: SleepRecord[],
): ProjectedNap[] {
  const defaults = DEFAULT_SLEEP[baby];
  const napDuration = sleepAn.avgNapDurationMin;

  const pastNaps: ProjectedNap[] = [];
  for (const t of defaults.bestNapTimes) {
    const napTime = new Date(now);
    napTime.setHours(Math.floor(t.startH), (t.startH % 1) * 60, 0, 0);
    const napEnd = new Date(napTime.getTime() + napDuration * 60_000);
    if (napEnd >= now) continue;

    const overlaps = todaySleeps.some(
      (s) => Math.abs(s.startTime.getTime() - napTime.getTime()) < 45 * 60_000,
    );
    if (!overlaps) {
      pastNaps.push({ time: napTime, durationMin: napDuration });
    }
  }

  const naps: ProjectedNap[] = [...pastNaps];

  if (sleepAn.nextNap) {
    let current = sleepAn.nextNap.predictedTime;
    naps.push({ time: current, durationMin: sleepAn.nextNap.estimatedDurationMin });

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
  }

  // ── Night sleep blocks ──

  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  const todayNoon = new Date(now);
  todayNoon.setHours(12, 0, 0, 0);

  const lastNightSleep = [...allSleeps]
    .filter(
      (s) =>
        s.baby === baby &&
        s.startTime < todayMidnight &&
        s.endTime &&
        s.endTime > todayMidnight &&
        s.endTime < todayNoon,
    )
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];

  if (lastNightSleep?.endTime) {
    const wakeMin = differenceInMinutes(lastNightSleep.endTime, todayMidnight);
    if (wakeMin > 0) {
      naps.push({ time: todayMidnight, durationMin: wakeMin, isNight: true });
    }
  } else {
    const wakeMin = defaults.typicalWakeHour * 60;
    naps.push({ time: todayMidnight, durationMin: wakeMin, isNight: true });
  }

  if (sleepAn.bedtime) {
    const bedtime = sleepAn.bedtime.predictedTime;
    const minutesToMidnight = (24 * 60) - (bedtime.getHours() * 60 + bedtime.getMinutes());
    naps.push({ time: bedtime, durationMin: minutesToMidnight, isNight: true });
  }

  return naps;
}

// ── Component ──

const BABY_ROWS: { baby: BabyName; label: string }[] = [
  { baby: 'colette', label: 'C' },
  { baby: 'isaure', label: 'I' },
];

export function Timeline({ predictions, feeds, sleeps, sleepAnalyses }: TimelineProps) {
  const now = new Date();
  const nowPct = hourToPercent(now);

  // Hour markers: every 2h from 6 to 22
  const hours = [6, 8, 10, 12, 14, 16, 18, 20, 22];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
      <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">
        Journée en un coup d'oeil
      </h3>

      {/* Hour axis */}
      <div className="relative ml-7 mr-1 mb-1">
        <div className="flex justify-between">
          {hours.map((h) => {
            const pct = ((h - START_H) / TOTAL_H) * 100;
            return (
              <span
                key={h}
                className="text-[9px] text-gray-400 font-medium absolute -translate-x-1/2"
                style={{ left: `${pct}%` }}
              >
                {h}h
              </span>
            );
          })}
        </div>
      </div>

      {/* Baby rows */}
      <div className="space-y-2 mt-4">
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

          const projectedFeeds = pred
            ? projectFeedsForDay(baby, pred, now, feeds)
            : [];
          const projectedNaps = projectNapsForDay(baby, sleepAn, now, babySleeps, sleeps);

          // Find the next projected feed (first one in the future)
          const nextFeed = projectedFeeds.find((pf) => pf.time >= now);

          return (
            <div key={baby} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                {/* Label */}
                <span
                  className="text-[11px] font-bold w-6 text-right flex-shrink-0"
                  style={{ color }}
                >
                  {label}
                </span>

                {/* Track */}
                <div className="relative flex-1 h-10 sm:h-12">
                  {/* Background */}
                  <div className="absolute inset-0 bg-gray-50 rounded-lg border border-gray-100" />

                  {/* Night blocks (full height, behind everything) */}
                  {projectedNaps
                    .filter((pn) => pn.isNight)
                    .map((pn, i) => {
                      const napLeft = hourToPercent(pn.time);
                      const napEndDate = new Date(pn.time.getTime() + pn.durationMin * 60_000);
                      const napRight = hourToPercent(napEndDate);
                      const napWidth = Math.max(1, napRight - napLeft);
                      const isPast = napEndDate < now;
                      return (
                        <div
                          key={`night-${i}`}
                          className="absolute inset-y-0 rounded-sm z-[1]"
                          style={{
                            left: `${napLeft}%`,
                            width: `${napWidth}%`,
                            backgroundColor: '#E0E7FF',
                            opacity: isPast ? 0.6 : 0.8,
                          }}
                          title={
                            isPast
                              ? `Nuit — réveil ~${format(napEndDate, 'HH:mm')}`
                              : `Coucher prévu ~${format(pn.time, 'HH:mm')}`
                          }
                        />
                      );
                    })}

                  {/* Projected naps (dashed blocks — top half) */}
                  {projectedNaps
                    .filter((pn) => !pn.isNight)
                    .map((pn, i) => {
                      const napLeft = hourToPercent(pn.time);
                      const napEndDate = new Date(pn.time.getTime() + pn.durationMin * 60_000);
                      const napRight = hourToPercent(napEndDate);
                      const napWidth = Math.max(2, napRight - napLeft);
                      const isPastNap = napEndDate < now;
                      return (
                        <div
                          key={`nap-${i}`}
                          className="absolute top-1 h-[40%] rounded-sm border border-dashed z-[5]"
                          style={{
                            left: `${napLeft}%`,
                            width: `${napWidth}%`,
                            borderColor: color,
                            backgroundColor: color,
                            opacity: isPastNap ? 0.15 : 0.3,
                          }}
                          title={`${isPastNap ? 'Sieste projetée' : 'Sieste prévue'} ${format(pn.time, 'HH:mm')} ~${pn.durationMin}min`}
                        />
                      );
                    })}

                  {/* Real sleeps (solid blocks — top half) */}
                  {babySleeps.map((s) => {
                    const left = hourToPercent(s.startTime);
                    const endTime = s.endTime ?? new Date(s.startTime.getTime() + s.durationMin * 60000);
                    const right = hourToPercent(endTime);
                    const width = Math.max(1.5, right - left);
                    return (
                      <div
                        key={s.id}
                        className="absolute top-1 h-[40%] rounded-sm z-[6]"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          backgroundColor: color,
                          opacity: 0.4,
                        }}
                        title={`Dodo ${s.durationMin}min — ${format(s.startTime, 'HH:mm')}`}
                      />
                    );
                  })}

                  {/* Real feeds (solid dots — bottom half) */}
                  {babyFeeds.map((f) => {
                    const left = hourToPercent(f.timestamp);
                    return (
                      <div
                        key={f.id}
                        className="absolute bottom-1.5 w-2.5 h-2.5 rounded-full -ml-[5px] z-[8]"
                        style={{
                          left: `${left}%`,
                          backgroundColor: color,
                        }}
                        title={`${format(f.timestamp, 'HH:mm', { locale: fr })} — ${f.volumeMl}ml`}
                      />
                    );
                  })}

                  {/* Projected feeds (hollow dots — bottom half) */}
                  {projectedFeeds.map((pf, i) => {
                    const isPast = pf.time < now;
                    const isNext = pf === nextFeed;
                    const pct = hourToPercent(pf.time);
                    return (
                      <div key={`pf-${i}`}>
                        <div
                          className={`absolute bottom-1.5 rounded-full -ml-[5px] border-2 z-[9] ${
                            isNext ? 'w-3 h-3 -ml-[6px]' : 'w-2.5 h-2.5 -ml-[5px]'
                          }`}
                          style={{
                            left: `${pct}%`,
                            borderColor: color,
                            backgroundColor: 'white',
                            opacity: isPast ? 0.3 : 1,
                          }}
                          title={`${isPast ? 'Projection' : 'Prévu'} ${format(pf.time, 'HH:mm')} — ~${pf.volumeMl}ml`}
                        />
                        {isNext && (
                          <span
                            className="absolute -bottom-0.5 text-[9px] font-semibold z-[10] -translate-x-1/2 whitespace-nowrap"
                            style={{ left: `${pct}%`, color }}
                          >
                            {format(pf.time, 'HH:mm')}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Bedtime label */}
                  {sleepAn.bedtime && (
                    <span
                      className="absolute top-0 text-[9px] font-semibold z-[10] -translate-x-1/2 whitespace-nowrap"
                      style={{
                        left: `${hourToPercent(sleepAn.bedtime.predictedTime)}%`,
                        color: '#6366F1',
                      }}
                    >
                      {format(sleepAn.bedtime.predictedTime, 'HH:mm')}
                    </span>
                  )}

                  {/* Now marker */}
                  <div
                    className="absolute inset-y-0 w-0.5 bg-red-400 z-[12] rounded-full"
                    style={{ left: `${nowPct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 ml-7 flex-wrap">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
          <span className="text-[10px] text-gray-500">repas</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-400 bg-white" />
          <span className="text-[10px] text-gray-500">prévu</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-2 rounded-sm bg-gray-300" />
          <span className="text-[10px] text-gray-500">sieste</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-2 rounded-sm bg-indigo-100 border border-indigo-200" />
          <span className="text-[10px] text-gray-500">nuit</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-0.5 h-3 bg-red-400 rounded-full" />
          <span className="text-[10px] text-gray-500">maintenant</span>
        </div>
      </div>
    </div>
  );
}
