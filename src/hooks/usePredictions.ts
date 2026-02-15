import { useEffect } from 'react';
import { useStore, restoreFromStorage } from '../store';

export function usePredictions() {
  const predictions = useStore((s) => s.predictions);
  const syncStatus = useStore((s) => s.syncStatus);
  const alerts = useStore((s) => s.alerts);
  const patterns = useStore((s) => s.patterns);
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
    feeds,
    sleeps,
    dataLoaded,
    lastUpdated,
    refreshPredictions,
  };
}

export function useInitApp() {
  useEffect(() => {
    const restored = restoreFromStorage();
    if (!restored) {
      // No saved data — still generate profile-based predictions
      useStore.getState().refreshPredictions();
    }
  }, []);
}
