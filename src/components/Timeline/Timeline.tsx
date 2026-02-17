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

function projectFeedsForDay(
  baby: BabyName, pred: Prediction, now: Date, allFeeds: FeedRecord[],
): ProjectedFeed[] {
  const profile = PROFILES[baby];
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const todayFeeds = allFeeds.filter(
    (f) => f.baby === baby && f.timestamp >= todayStart && f.timestamp <= todayEnd,
  );

  const tooCloseToReal = (time: Date) =>
    todayFeeds.some((f) => Math.abs(f.timestamp.getTime() - time.getTime()) < 90 * 60_000);

  const dayProjections = projectDayFromData(baby, allFeeds, now);
  const pastProjections = dayProjections
    .filter((p) => p.time < now)
    .filter((p) => !tooCloseToReal(p.time));

  const futureProjections: ProjectedFeed[] = [];
  let current = pred.timing.predictedTime;
  if (isToday(current, now)) {
    if (!tooCloseToReal(current)) {
      futureProjections.push({ time: current, volumeMl: pred.volume.predictedMl });
    }
    for (let i = 0; i < 10; i++) {
      const slot = profile.slots.find((s) => s.hours.includes(current.getHours())) ?? profile.slots[0];
      const intervalH = computeSlotInterval(slot.id, baby, allFeeds, now);
      const next = new Date(current.getTime() + intervalH * 3_600_000);
      if (!isToday(next, now) || next.getHours() >= 23) break;
      if (!tooCloseToReal(next)) {
        const nextSlot = profile.slots.find((s) => s.hours.includes(next.getHours())) ?? profile.slots[0];
        const nextVol = computeSlotVolume(nextSlot.id, baby, allFeeds, now);
        futureProjections.push({ time: next, volumeMl: nextVol.meanMl });
      }
      current = next;
    }
  }
  return [...pastProjections, ...futureProjections];
}

function projectNapsForDay(
  baby: BabyName, sleepAn: SleepAnalysis, now: Date,
  todaySleeps: SleepRecord[], allSleeps: SleepRecord[],
): ProjectedNap[] {
  const defaults = DEFAULT_SLEEP[baby];
  const napDuration = sleepAn.avgNapDurationMin;

  const tooCloseToReal = (time: Date, durationMin: number) => {
    const projStart = time.getTime();
    const projEnd = projStart + durationMin * 60_000;
    return todaySleeps.some((s) => {
      const realStart = s.startTime.getTime();
      const realEnd = s.endTime
        ? s.endTime.getTime()
        : realStart + s.durationMin * 60_000;
      // Overlap check: projections and real sleep overlap if they don't NOT overlap
      return projStart < realEnd + 90 * 60_000 && projEnd > realStart - 90 * 60_000;
    });
  };

  // Past projected naps
  const pastNaps: ProjectedNap[] = [];
  for (const t of defaults.bestNapTimes) {
    const napTime = new Date(now);
    napTime.setHours(Math.floor(t.startH), (t.startH % 1) * 60, 0, 0);
    const napEnd = new Date(napTime.getTime() + napDuration * 60_000);
    if (napEnd >= now) continue;
    if (!tooCloseToReal(napTime, napDuration)) {
      pastNaps.push({ time: napTime, durationMin: napDuration });
    }
  }

  const naps: ProjectedNap[] = [...pastNaps];

  // Future naps
  if (sleepAn.nextNap) {
    let current = sleepAn.nextNap.predictedTime;
    const nextDur = sleepAn.nextNap.estimatedDurationMin;
    if (!tooCloseToReal(current, nextDur)) {
      naps.push({ time: current, durationMin: nextDur });
    }
    const interNapMin = sleepAn.medianInterNapMin;
    if (interNapMin) {
      for (let i = sleepAn.napsToday + 1; i < defaults.napsPerDay; i++) {
        const napEnd = new Date(current.getTime() + napDuration * 60_000);
        const next = new Date(napEnd.getTime() + interNapMin * 60_000);
        if (next.getHours() >= 21 || !isToday(next, now)) break;
        if (!tooCloseToReal(next, napDuration)) {
          naps.push({ time: next, durationMin: napDuration });
        }
        current = next;
      }
    }
  }

  // Night blocks
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

  // Evening block: always use estimatedBedtimeDate (available even if past)
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
          const projFeeds = pred ? projectFeedsForDay(baby, pred, now, feeds) : [];
          const projNaps = projectNapsForDay(baby, sleepAn, now, babySleeps, sleeps);
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

                    {/* Real feeds */}
                    {babyFeeds.map((f) => (
                      <div
                        key={f.id}
                        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full -ml-1 z-[3]"
                        style={{ left: `${hourToPercent(f.timestamp)}%`, backgroundColor: color }}
                        title={`${format(f.timestamp, 'HH:mm', { locale: fr })} — ${f.volumeMl}ml`}
                      />
                    ))}

                    {/* Projected feeds */}
                    {projFeeds.map((pf, i) => {
                      const isPast = pf.time < now;
                      const isNext = pf === nextFeed;
                      const pct = hourToPercent(pf.time);
                      return (
                        <div key={`pf-${i}`}>
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 rounded-full border-2 z-[4] ${isNext ? 'w-3 h-3 -ml-1.5' : 'w-2 h-2 -ml-1'}`}
                            style={{
                              left: `${pct}%`, borderColor: color,
                              backgroundColor: 'white', opacity: isPast ? 0.3 : 1,
                            }}
                            title={`${isPast ? 'Proj.' : 'Prévu'} ${format(pf.time, 'HH:mm')} ~${pf.volumeMl}ml`}
                          />
                          {isNext && (
                            <span
                              className="absolute bottom-0 text-[8px] font-semibold z-[5] -translate-x-1/2"
                              style={{ left: `${pct}%`, color }}
                            >
                              {format(pf.time, 'HH:mm')}
                            </span>
                          )}
                        </div>
                      );
                    })}

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
