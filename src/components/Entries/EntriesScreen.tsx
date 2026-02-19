import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { PROFILES } from '../../data/knowledge';
import type { BabyName, FeedRecord, SleepRecord } from '../../types';

function formatTime(date: Date): string {
  return format(date, 'HH:mm', { locale: fr });
}

function formatDuration(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
  }
  return `${min} min`;
}

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function EntriesScreen() {
  const setScreen = useStore((s) => s.setScreen);
  const feeds = useStore((s) => s.feeds);
  const sleeps = useStore((s) => s.sleeps);
  const deleteFeed = useStore((s) => s.deleteFeed);
  const deleteSleep = useStore((s) => s.deleteSleep);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const todayFeeds = useMemo(
    () => feeds.filter((f) => isToday(f.timestamp)).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    [feeds],
  );

  const todaySleeps = useMemo(
    () => sleeps.filter((s) => isToday(s.startTime)).sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
    [sleeps],
  );

  const babies: BabyName[] = ['colette', 'isaure'];

  function renderFeedRow(feed: FeedRecord) {
    const label = feed.type === 'bottle' ? `Biberon ${feed.volumeMl} ml` : 'Tétée';
    return (
      <div key={feed.id} className="flex items-center justify-between py-1.5">
        <p className="text-sm text-gray-600">
          <span className="text-gray-400">{formatTime(feed.timestamp)}</span>
          {' · '}
          {label}
        </p>
        {confirmDelete === feed.id ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { deleteFeed(feed.id); setConfirmDelete(null); }}
              className="text-[11px] text-red-500 font-medium px-2 py-0.5 rounded bg-red-50 hover:bg-red-100 active:bg-red-200 transition-colors"
            >
              Suppr
            </button>
            <button
              onClick={() => setConfirmDelete(null)}
              className="text-[11px] text-gray-400 px-1 py-0.5"
            >
              Non
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(feed.id)}
            className="p-1.5 text-gray-300 hover:text-red-400 active:text-red-500 transition-colors"
            title="Supprimer"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    );
  }

  function renderSleepRow(sleep: SleepRecord) {
    return (
      <div key={sleep.id} className="flex items-center justify-between py-1.5">
        <p className="text-sm text-gray-600">
          <span className="text-gray-400">{formatTime(sleep.startTime)}</span>
          {' · '}
          {formatDuration(sleep.durationMin)}
        </p>
        {confirmDelete === sleep.id ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { deleteSleep(sleep.id); setConfirmDelete(null); }}
              className="text-[11px] text-red-500 font-medium px-2 py-0.5 rounded bg-red-50 hover:bg-red-100 active:bg-red-200 transition-colors"
            >
              Suppr
            </button>
            <button
              onClick={() => setConfirmDelete(null)}
              className="text-[11px] text-gray-400 px-1 py-0.5"
            >
              Non
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(sleep.id)}
            className="p-1.5 text-gray-300 hover:text-red-400 active:text-red-500 transition-colors"
            title="Supprimer"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    );
  }

  function renderBabySection<T extends FeedRecord | SleepRecord>(
    baby: BabyName,
    items: T[],
    renderRow: (item: T) => React.ReactNode,
  ) {
    const babyItems = items.filter((i) => i.baby === baby);
    return (
      <div key={baby}>
        <p className="text-xs font-medium text-gray-500 mb-1">{PROFILES[baby].name}</p>
        {babyItems.length === 0 ? (
          <p className="text-xs text-gray-300 italic pl-1">Aucune saisie</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {babyItems.map(renderRow)}
          </div>
        )}
      </div>
    );
  }

  const totalFeeds = todayFeeds.length;
  const totalSleeps = todaySleeps.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-4 py-3 safe-top">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => setScreen('dashboard')}
            className="p-2 -ml-2 text-gray-500 hover:text-gray-700 active:text-gray-900 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-800">Saisies du jour</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 pb-8">
        {/* Repas */}
        <section className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 space-y-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide">Repas</h3>
          {babies.map((baby) => renderBabySection(baby, todayFeeds, renderFeedRow))}
        </section>

        {/* Siestes */}
        <section className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 space-y-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide">Siestes</h3>
          {babies.map((baby) => renderBabySection(baby, todaySleeps, renderSleepRow))}
        </section>

        {/* Footer counter */}
        <p className="text-xs text-gray-400 text-center">
          {totalFeeds} repas · {totalSleeps} sieste{totalSleeps > 1 ? 's' : ''}
        </p>
      </main>
    </div>
  );
}
