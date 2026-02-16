import Papa from 'papaparse';
import { parse } from 'date-fns';
import type { RawCsvRow, FeedRecord, SleepRecord, BabyName } from '../types';

function parseDateTime(dateStr: string): Date | null {
  try {
    return parse(dateStr, 'dd/MM/yyyy HH:mm', new Date());
  } catch {
    return null;
  }
}

/**
 * Generate a deterministic ID from record content.
 * Same data always produces the same ID → proper deduplication on merge.
 */
function deterministicId(parts: (string | number)[]): string {
  return parts.join('|');
}

export function parseCsv(
  csvText: string,
  baby: BabyName,
): { feeds: FeedRecord[]; sleeps: SleepRecord[] } {
  const result = Papa.parse<RawCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const feeds: FeedRecord[] = [];
  const sleeps: SleepRecord[] = [];

  for (const row of result.data) {
    const activity = row['Activité']?.trim();
    const dateStr = row['Date et heure']?.trim();
    if (!dateStr) continue;

    const timestamp = parseDateTime(dateStr);
    if (!timestamp) continue;

    if (activity === 'Biberon' || activity === 'Tétée') {
      const volumeStr = row['Quantité']?.trim();
      const volumeMl = volumeStr ? parseFloat(volumeStr) : 0;
      const durationStr = row['Durée (mn)']?.trim();
      const durationMin = durationStr ? parseFloat(durationStr) : undefined;
      const type = activity === 'Biberon' ? 'bottle' : 'breast';
      const vol = isNaN(volumeMl) ? 0 : volumeMl;

      feeds.push({
        id: deterministicId(['f', baby, timestamp.toISOString(), type, vol]),
        baby,
        timestamp,
        type,
        volumeMl: vol,
        durationMin: durationMin && !isNaN(durationMin) ? durationMin : undefined,
        notes: row['Notes']?.trim() || undefined,
      });
    } else if (activity === 'Sommeil') {
      const durationStr = row['Durée (mn)']?.trim();
      const durationMin = durationStr ? parseFloat(durationStr) : 0;
      const endStr = row['Heure de fin']?.trim();
      const endTime = endStr ? parseDateTime(endStr) : undefined;
      const dur = isNaN(durationMin) ? 0 : durationMin;

      sleeps.push({
        id: deterministicId(['s', baby, timestamp.toISOString(), dur]),
        baby,
        startTime: timestamp,
        endTime: endTime ?? undefined,
        durationMin: dur,
      });
    }
  }

  feeds.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  sleeps.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return { feeds, sleeps };
}
