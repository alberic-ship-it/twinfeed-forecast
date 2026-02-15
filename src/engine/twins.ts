import { differenceInMinutes, addMinutes } from 'date-fns';
import type { Prediction, FeedRecord, TwinsSyncStatus, SyncState } from '../types';
import { SYNC_THRESHOLDS, BEST_SYNC_WINDOWS } from '../data/knowledge';

export function computeSyncStatus(
  colettePred: Prediction | null,
  isaurePred: Prediction | null,
  feeds: FeedRecord[],
): TwinsSyncStatus | null {
  if (!colettePred || !isaurePred) return null;

  const gapMinutes = Math.abs(
    differenceInMinutes(colettePred.timing.predictedTime, isaurePred.timing.predictedTime),
  );

  let state: SyncState;
  if (gapMinutes <= SYNC_THRESHOLDS.synchronized) {
    state = 'synchronized';
  } else if (gapMinutes <= SYNC_THRESHOLDS.slightlyOffset) {
    state = 'slightly_offset';
  } else {
    state = 'desynchronized';
  }

  // Compute sync rate from recent feed pairs
  const syncRate = computeSyncRate(feeds);

  // Suggest common window
  let commonWindow: { start: Date; end: Date } | undefined;
  let suggestion: string | undefined;

  if (state === 'desynchronized' || state === 'slightly_offset') {
    const earlier = colettePred.timing.predictedTime < isaurePred.timing.predictedTime
      ? colettePred.timing.predictedTime
      : isaurePred.timing.predictedTime;
    const midpoint = addMinutes(earlier, Math.round(gapMinutes / 2));
    commonWindow = {
      start: addMinutes(midpoint, -15),
      end: addMinutes(midpoint, 15),
    };

    // Find best sync window
    const hour = midpoint.getHours();
    const bestWindow = BEST_SYNC_WINDOWS.find(
      (w) => hour >= w.start && hour < w.end,
    );
    if (bestWindow) {
      suggestion = `Fenêtre idéale : ${bestWindow.label} (${bestWindow.start}h-${bestWindow.end}h)`;
    } else {
      suggestion = `Essayez de nourrir les deux vers ${midpoint.getHours()}h${String(midpoint.getMinutes()).padStart(2, '0')}`;
    }
  }

  return {
    state,
    gapMinutes,
    syncRate,
    commonWindow,
    suggestion,
  };
}

function computeSyncRate(feeds: FeedRecord[]): number {
  const coletteFeeds = feeds
    .filter((f) => f.baby === 'colette')
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const isaureFeeds = feeds
    .filter((f) => f.baby === 'isaure')
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (coletteFeeds.length === 0 || isaureFeeds.length === 0) return 0;

  // Take last 20 feeds from each
  const recentC = coletteFeeds.slice(-20);
  let syncCount = 0;

  for (const cf of recentC) {
    const closest = isaureFeeds.reduce((best, f) => {
      const gap = Math.abs(differenceInMinutes(cf.timestamp, f.timestamp));
      const bestGap = Math.abs(differenceInMinutes(cf.timestamp, best.timestamp));
      return gap < bestGap ? f : best;
    });
    if (Math.abs(differenceInMinutes(cf.timestamp, closest.timestamp)) <= 30) {
      syncCount++;
    }
  }

  return recentC.length > 0 ? syncCount / recentC.length : 0;
}
