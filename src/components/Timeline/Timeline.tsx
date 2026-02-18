import { format, differenceInMinutes } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { BabyName, BabyProfile, TimeSlot, Prediction, FeedRecord, SleepRecord } from '../../types';
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

// ── Data helpers ──

interface ProjectedFeed { time: Date; volumeMl: number }
interface ProjectedNap { time: Date; durationMin: number; isNight?: boolean }

/**
 * Build a coherent list of projected feeds for the day.
 *
 * Coherence rules:
 * 1. Real feeds ALWAYS take priority — any projection within 90 min of a
 *    real feed is removed.
 * 2. No projection can fall during a sleep (real or projected nap).
 * 3. Future projections chain from the engine's prediction (nap-aware),
 *    and when a projection would land during a nap it's pushed to
 *    napEnd + 30 min.
 * 4. Past projections are anchored on real feeds: we only fill gaps
 *    between real feeds, not show a full mechanical chain.
 */
function projectFeedsForDay(
  baby: BabyName, pred: Prediction, now: Date, allFeeds: FeedRecord[],
  todaySleeps: SleepRecord[], projectedNaps: ProjectedNap[],
): ProjectedFeed[] {
  const profile = PROFILES[baby];
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const todayFeeds = allFeeds
    .filter((f) => f.baby === baby && f.timestamp >= todayStart && f.timestamp <= todayEnd)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Check if a projected feed is too close to a real feed
  const tooCloseToRealFeed = (time: Date) =>
    todayFeeds.some((f) => Math.abs(f.timestamp.getTime() - time.getTime()) < 90 * 60_000);

  // Check if a time falls during a sleep (real or projected nap)
  const duringASleep = (time: Date) => {
    const t = time.getTime();
    for (const s of todaySleeps) {
      const start = s.startTime.getTime();
      const end = s.endTime ? s.endTime.getTime() : start + s.durationMin * 60_000;
      if (t >= start && t <= end) return true;
    }
    for (const n of projectedNaps) {
      if (n.isNight) continue;
      const start = n.time.getTime();
      const end = start + n.durationMin * 60_000;
      if (t >= start && t <= end) return true;
    }
    return false;
  };

  const shouldFilter = (time: Date) => tooCloseToRealFeed(time) || duringASleep(time);

  // ── Past projections: only fill gaps between real feeds ──
  // Instead of a mechanical chain from morning, we project forward from
  // each real feed and only keep projections that don't collide with the
  // next real feed. If there are no real feeds, fall back to mechanical.
  const pastProjections: ProjectedFeed[] = [];
  if (todayFeeds.length > 0) {
    // Fill the gap BEFORE the first real feed (from morning)
    const morningSlot = profile.slots.find((s) => s.id === 'morning') ?? profile.slots[0];
    const morningAnchor = new Date(now);
    morningAnchor.setHours(morningSlot.hours[0], 0, 0, 0);
    fillGap(morningAnchor, todayFeeds[0].timestamp, baby, allFeeds, now, profile, pastProjections, shouldFilter);

    // Fill gaps BETWEEN consecutive real feeds
    for (let i = 0; i < todayFeeds.length - 1; i++) {
      fillGap(todayFeeds[i].timestamp, todayFeeds[i + 1].timestamp, baby, allFeeds, now, profile, pastProjections, shouldFilter);
    }

    // Fill gap from last real feed to now
    const lastFeed = todayFeeds[todayFeeds.length - 1];
    fillGap(lastFeed.timestamp, now, baby, allFeeds, now, profile, pastProjections, shouldFilter);
  } else {
    // No real feeds today — use mechanical projection
    const dayProjections = projectDayFromData(baby, allFeeds, now);
    for (const p of dayProjections) {
      if (p.time < now && !shouldFilter(p.time)) {
        pastProjections.push(p);
      }
    }
  }

  // ── Future projections: chain from the prediction (nap-aware) ──
  const futureProjections: ProjectedFeed[] = [];
  let current = pred.timing.predictedTime;
  if (isToday(current, now)) {
    if (!shouldFilter(current)) {
      futureProjections.push({ time: current, volumeMl: pred.volume.predictedMl });
    }
    for (let i = 0; i < 10; i++) {
      const slot = profile.slots.find((s) => s.hours.includes(current.getHours())) ?? profile.slots[0];
      const intervalH = computeSlotInterval(slot.id, baby, allFeeds, now);
      let next = new Date(current.getTime() + intervalH * 3_600_000);
      if (!isToday(next, now) || next.getHours() >= 23) break;

      // If the projected feed falls during a nap, push it after nap end + 30min
      if (duringASleep(next)) {
        const napEnd = findNapEndAfter(next, todaySleeps, projectedNaps);
        if (napEnd) {
          next = new Date(napEnd.getTime() + 30 * 60_000);
        }
      }
      if (!isToday(next, now) || next.getHours() >= 23) break;

      if (!tooCloseToRealFeed(next)) {
        const nextSlot = profile.slots.find((s) => s.hours.includes(next.getHours())) ?? profile.slots[0];
        const nextVol = computeSlotVolume(nextSlot.id, baby, allFeeds, now);
        futureProjections.push({ time: next, volumeMl: nextVol.meanMl });
      }
      current = next;
    }
  }
  return [...pastProjections, ...futureProjections];
}

/**
 * Fill a time gap with projected feeds by chaining from `start` with
 * slot intervals. Only adds projections that are before `end` and pass
 * the filter.
 */
function fillGap(
  start: Date, end: Date, baby: BabyName, allFeeds: FeedRecord[],
  now: Date, profile: BabyProfile,
  out: ProjectedFeed[],
  shouldFilter: (time: Date) => boolean,
) {
  let cursor = start;
  for (let i = 0; i < 10; i++) {
    const slot = profile.slots.find((s: TimeSlot) => s.hours.includes(cursor.getHours())) ?? profile.slots[0];
    const intervalH = computeSlotInterval(slot.id, baby, allFeeds, now);
    const next = new Date(cursor.getTime() + intervalH * 3_600_000);
    if (next >= end) break;
    if (!shouldFilter(next)) {
      const nextSlot = profile.slots.find((s: TimeSlot) => s.hours.includes(next.getHours())) ?? profile.slots[0];
      const nextVol = computeSlotVolume(nextSlot.id, baby, allFeeds, now);
      out.push({ time: next, volumeMl: nextVol.meanMl });
    }
    cursor = next;
  }
}

/** Find the end time of the nap that contains a given time */
function findNapEndAfter(
  time: Date, realSleeps: SleepRecord[], projectedNaps: ProjectedNap[],
): Date | null {
  const t = time.getTime();
  // Prioritize real sleeps over projected naps
  for (const s of realSleeps) {
    const start = s.startTime.getTime();
    const end = s.endTime ? s.endTime.getTime() : start + s.durationMin * 60_000;
    if (t >= start && t <= end) return new Date(end);
  }
  for (const n of projectedNaps) {
    if (n.isNight) continue;
    const start = n.time.getTime();
    const end = start + n.durationMin * 60_000;
    if (t >= start && t <= end) return new Date(end);
  }
  return null;
}

/**
 * Project naps for the day using the sleep engine as SINGLE source of truth.
 *
 * Rules:
 * - Future naps come exclusively from sleepAn.nextNap + chaining via
 *   medianInterNapMin. This matches what the SleepPanel displays.
 * - Past projected naps: only fill gaps where no real nap exists.
 *   Count real naps vs expected, and only project missing ones.
 * - Any projected nap that overlaps a real nap (±60 min) is suppressed.
 * - Night blocks: morning (from data or default) + evening bedtime.
 */
function projectNapsForDay(
  baby: BabyName, sleepAn: SleepAnalysis, now: Date,
  todaySleeps: SleepRecord[], allSleeps: SleepRecord[],
): ProjectedNap[] {
  const defaults = DEFAULT_SLEEP[baby];
  const napDuration = sleepAn.avgNapDurationMin;
  const naps: ProjectedNap[] = [];

  // Helper: does a projected nap overlap with any real nap?
  const overlapsReal = (time: Date, durationMin: number) => {
    const projStart = time.getTime();
    const projEnd = projStart + durationMin * 60_000;
    return todaySleeps.some((s) => {
      const realStart = s.startTime.getTime();
      const realEnd = s.endTime
        ? s.endTime.getTime()
        : realStart + s.durationMin * 60_000;
      // 60 min buffer on each side
      return projStart < realEnd + 60 * 60_000 && projEnd > realStart - 60 * 60_000;
    });
  };

  // ── Future naps: from sleep engine only (matches SleepPanel) ──
  // IMPORTANT: only add naps that are actually in the future.
  // Past naps are handled by the window loop below.
  if (sleepAn.nextNap) {
    let current = sleepAn.nextNap.predictedTime;
    const nextDur = sleepAn.nextNap.estimatedDurationMin;
    if (current >= now && !overlapsReal(current, nextDur)) {
      naps.push({ time: current, durationMin: nextDur });
    }

    // Chain additional future naps using the same interval the engine uses
    const interNapMin = sleepAn.medianInterNapMin;
    if (interNapMin) {
      const remainingNaps = defaults.napsPerDay - sleepAn.napsToday - 1;
      for (let i = 0; i < remainingNaps; i++) {
        const napEnd = new Date(current.getTime() + napDuration * 60_000);
        const next = new Date(napEnd.getTime() + interNapMin * 60_000);
        if (next.getHours() >= 21 || !isToday(next, now)) break;
        if (!overlapsReal(next, napDuration)) {
          naps.push({ time: next, durationMin: napDuration });
        }
        current = next;
      }
    }
  }

  // ── Past naps: only project for missing default windows ──
  const realDayNaps = todaySleeps.filter(
    (s) => s.startTime.getHours() >= 6 && s.startTime.getHours() < 21,
  );
  const currentH = now.getHours() + now.getMinutes() / 60;

  for (const window of defaults.bestNapTimes) {
    // Only consider windows that have fully elapsed
    if (currentH < window.endH) continue;

    const napTime = new Date(now);
    napTime.setHours(Math.floor(window.startH), Math.round((window.startH % 1) * 60), 0, 0);
    const napEnd = new Date(napTime.getTime() + napDuration * 60_000);

    // Check if any real nap covers this window (within the window's time range)
    const windowStart = new Date(now);
    windowStart.setHours(Math.floor(window.startH), 0, 0, 0);
    const windowEnd = new Date(now);
    windowEnd.setHours(Math.floor(window.endH), Math.round((window.endH % 1) * 60), 0, 0);

    const realNapInWindow = realDayNaps.some((s) => {
      const sEnd = s.endTime ? s.endTime.getTime() : s.startTime.getTime() + s.durationMin * 60_000;
      // Real nap overlaps with this window if it starts before window end and ends after window start
      return s.startTime.getTime() < windowEnd.getTime() + 60 * 60_000 &&
             sEnd > windowStart.getTime() - 60 * 60_000;
    });

    if (!realNapInWindow && napEnd < now) {
      naps.push({ time: napTime, durationMin: napDuration });
    }
  }

  // ── Dedup: remove naps that are too close to each other (within 60min) ──
  // Keep the first occurrence (future naps added first take priority)
  for (let i = naps.length - 1; i > 0; i--) {
    for (let j = 0; j < i; j++) {
      if (Math.abs(naps[i].time.getTime() - naps[j].time.getTime()) < 60 * 60_000) {
        naps.splice(i, 1);
        break;
      }
    }
  }

  // ── Night blocks ──
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  const todayNoon = new Date(now);
  todayNoon.setHours(12, 0, 0, 0);

  const lastNightSleep = [...allSleeps]
    .filter((s) =>
      s.baby === baby &&
      s.startTime < todayMidnight &&
      s.endTime && s.endTime > todayMidnight && s.endTime < todayNoon,
    )
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];

  if (lastNightSleep?.endTime) {
    const wakeMin = differenceInMinutes(lastNightSleep.endTime, todayMidnight);
    if (wakeMin > 0) naps.push({ time: todayMidnight, durationMin: wakeMin, isNight: true });
  } else {
    naps.push({ time: todayMidnight, durationMin: defaults.typicalWakeHour * 60, isNight: true });
  }

  // Evening block: always use estimatedBedtimeDate (matches SleepPanel)
  const bt = sleepAn.estimatedBedtimeDate;
  const toMidnight = (24 * 60) - (bt.getHours() * 60 + bt.getMinutes());
  if (toMidnight > 0) {
    naps.push({ time: bt, durationMin: toMidnight, isNight: true });
  }

  return naps;
}

// ── Component ──

const BABIES: { baby: BabyName; label: string }[] = [
  { baby: 'colette', label: 'C' },
  { baby: 'isaure', label: 'I' },
];

export function Timeline({ predictions, feeds, sleeps, sleepAnalyses }: TimelineProps) {
  const now = new Date();
  const nowPct = hourToPercent(now);
  const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
      <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-3">
        Journée en un coup d'oeil
      </h3>

      {/* Hour axis */}
      <div className="relative ml-7 mr-1 h-4">
        {hours.map((h) => (
          <span
            key={h}
            className="absolute text-[10px] text-gray-400 -translate-x-1/2"
            style={{ left: `${((h - START_H) / TOTAL_H) * 100}%` }}
          >
            {h}h
          </span>
        ))}
      </div>

      {/* Baby rows */}
      <div className="space-y-3">
        {BABIES.map(({ baby, label }) => {
          const color = BABY_COLORS[baby];
          const babyFeeds = feeds.filter((f) => f.baby === baby && isToday(f.timestamp, now));
          const babySleeps = sleeps.filter((s) => s.baby === baby && isToday(s.startTime, now));
          const pred = predictions[baby];
          const sleepAn = sleepAnalyses[baby];
          const projNapsRaw = projectNapsForDay(baby, sleepAn, now, babySleeps, sleeps);

          // Final safety net: remove any projected nap that overlaps a real sleep
          const projNaps = projNapsRaw.filter((pn) => {
            if (pn.isNight) return true;
            const pStart = pn.time.getTime();
            const pEnd = pStart + pn.durationMin * 60_000;
            return !babySleeps.some((s) => {
              const rStart = s.startTime.getTime();
              const rEnd = s.endTime ? s.endTime.getTime() : rStart + s.durationMin * 60_000;
              // Overlap with 60min buffer
              return pStart < rEnd + 60 * 60_000 && pEnd > rStart - 60 * 60_000;
            });
          });

          const projFeeds = pred ? projectFeedsForDay(baby, pred, now, feeds, babySleeps, projNaps) : [];
          const nightBlocks = projNaps.filter((n) => n.isNight);
          const napBlocks = projNaps.filter((n) => !n.isNight);
          const nextFeed = projFeeds.find((pf) => pf.time >= now);

          return (
            <div key={baby}>
              {/* Baby label */}
              <div className="flex items-start gap-1.5">
                <span className="text-[11px] font-bold w-6 text-right mt-0.5" style={{ color }}>
                  {label}
                </span>

                <div className="flex-1 space-y-px">
                  {/* ── Sleep row ── */}
                  <div className="relative h-5 sm:h-6">
                    <div className="absolute inset-0 bg-gray-50 rounded-t border border-b-0 border-gray-100" />

                    {/* Night blocks */}
                    {nightBlocks.map((nb, i) => {
                      const left = hourToPercent(nb.time);
                      const end = new Date(nb.time.getTime() + nb.durationMin * 60_000);
                      // If end is next day (past midnight), clamp to 100%
                      const right = !isToday(end, now) || (end.getHours() === 0 && end.getMinutes() === 0) ? 100 : hourToPercent(end);
                      const width = Math.max(0.5, right - left);
                      const isPast = end < now;
                      return (
                        <div
                          key={`n-${i}`}
                          className="absolute inset-y-0 z-[1]"
                          style={{
                            left: `${left}%`, width: `${width}%`,
                            backgroundColor: '#C7D2FE',
                            opacity: isPast ? 0.5 : 0.7,
                            borderRadius: i === 0 ? '4px 0 0 0' : '0 4px 0 0',
                          }}
                          title={isPast ? `Nuit → réveil ${format(end, 'HH:mm')}` : `Coucher ${format(nb.time, 'HH:mm')}`}
                        />
                      );
                    })}

                    {/* Real sleeps */}
                    {babySleeps.map((s) => {
                      const left = hourToPercent(s.startTime);
                      const end = s.endTime ?? new Date(s.startTime.getTime() + s.durationMin * 60000);
                      const width = Math.max(1, hourToPercent(end) - left);
                      return (
                        <div
                          key={s.id}
                          className="absolute inset-y-0.5 rounded-sm z-[3]"
                          style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color, opacity: 0.35 }}
                          title={`Dodo ${s.durationMin}min`}
                        />
                      );
                    })}

                    {/* Projected naps */}
                    {napBlocks.map((pn, i) => {
                      const left = hourToPercent(pn.time);
                      const end = new Date(pn.time.getTime() + pn.durationMin * 60_000);
                      const width = Math.max(1, hourToPercent(end) - left);
                      const isPast = end < now;
                      return (
                        <div
                          key={`np-${i}`}
                          className="absolute inset-y-0.5 rounded-sm border border-dashed z-[2]"
                          style={{
                            left: `${left}%`, width: `${width}%`,
                            borderColor: color, backgroundColor: color,
                            opacity: isPast ? 0.12 : 0.25,
                          }}
                          title={`${isPast ? 'Sieste projetée' : 'Sieste prévue'} ${format(pn.time, 'HH:mm')} ~${pn.durationMin}min`}
                        />
                      );
                    })}

                    {/* Bedtime label */}
                    <span
                      className="absolute bottom-0 text-[8px] font-semibold z-[5] translate-x-1"
                      style={{ left: `${hourToPercent(sleepAn.estimatedBedtimeDate)}%`, color: '#4F46E5' }}
                    >
                      {format(sleepAn.estimatedBedtimeDate, 'HH:mm')}
                    </span>

                    {/* Now marker */}
                    <div className="absolute inset-y-0 w-0.5 bg-red-400 z-[6] rounded-full" style={{ left: `${nowPct}%` }} />
                  </div>

                  {/* ── Feed row ── */}
                  <div className="relative h-5 sm:h-6">
                    <div className="absolute inset-0 bg-gray-50 rounded-b border border-t-0 border-gray-100" />

                    {/* Projected feeds (below real feeds) */}
                    {projFeeds.map((pf, i) => {
                      const isPast = pf.time < now;
                      const isNext = pf === nextFeed;
                      const pct = hourToPercent(pf.time);
                      return (
                        <div key={`pf-${i}`}>
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 rounded-full border-2 z-[3] ${isNext ? 'w-3 h-3 -ml-1.5' : 'w-2 h-2 -ml-1'}`}
                            style={{
                              left: `${pct}%`, borderColor: color,
                              backgroundColor: 'white', opacity: isPast ? 0.3 : 1,
                            }}
                            title={`${isPast ? 'Proj.' : 'Prévu'} ${format(pf.time, 'HH:mm')} ~${pf.volumeMl}ml`}
                          />
                          {isNext && (
                            <span
                              className="absolute bottom-0 text-[8px] font-semibold z-[4] -translate-x-1/2"
                              style={{ left: `${pct}%`, color }}
                            >
                              {format(pf.time, 'HH:mm')}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* Real feeds (always on top of projections) */}
                    {babyFeeds.map((f) => (
                      <div
                        key={f.id}
                        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full -ml-1 z-[5]"
                        style={{ left: `${hourToPercent(f.timestamp)}%`, backgroundColor: color }}
                        title={`${format(f.timestamp, 'HH:mm', { locale: fr })} — ${f.volumeMl}ml`}
                      />
                    ))}

                    {/* Now marker */}
                    <div className="absolute inset-y-0 w-0.5 bg-red-400 z-[6] rounded-full" style={{ left: `${nowPct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 ml-7 flex-wrap">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-[10px] text-gray-500">repas</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full border-2 border-gray-400 bg-white" />
          <span className="text-[10px] text-gray-500">prévu</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-2 rounded-sm bg-gray-300 opacity-50" />
          <span className="text-[10px] text-gray-500">sieste</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-2 rounded-sm bg-indigo-200" />
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
