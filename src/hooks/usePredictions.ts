import { useEffect } from 'react';
import { useStore, initData, syncFromServer } from '../store';

export function usePredictions() {
  const predictions = useStore((s) => s.predictions);
  const syncStatus = useStore((s) => s.syncStatus);
  const alerts = useStore((s) => s.alerts);
  const patterns = useStore((s) => s.patterns);
  const sleepAnalyses = useStore((s) => s.sleepAnalyses);
  const feeds = useStore((s) => s.feeds);
  const sleeps = useStore((s) => s.sleeps);
  const dataLoaded = useStore((s) => s.dataLoaded);
  const lastUpdated = useStore((s) => s.lastUpdated);
  const refreshPredictions = useStore((s) => s.refreshPredictions);

  // Auto-refresh predictions every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      refreshPredictions();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [refreshPredictions]);

  return {
    predictions,
    syncStatus,
    alerts,
    patterns,
    sleepAnalyses,
    feeds,
    sleeps,
    dataLoaded,
    lastUpdated,
    refreshPredictions,
  };
}

export function useInitApp() {
  useEffect(() => {
    // Load seed CSVs + fetch shared entries from server
    initData();

    // Poll server every 30s for updates from other users
    const interval = setInterval(() => {
      syncFromServer();
    }, 30_000);

    return () => clearInterval(interval);
  }, []);
}
