import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore, initData, syncFromServer } from '../store';

export function usePredictions() {
  // Un seul sélecteur shallow : Zustand ne déclenche qu'un seul re-render
  // même quand refreshPredictions met à jour plusieurs champs en un set().
  const {
    predictions,
    alerts,
    patterns,
    sleepAnalyses,
    feedSleepInsights,
    feeds,
    sleeps,
    dataLoaded,
    lastUpdated,
  } = useStore(
    useShallow((s) => ({
      predictions: s.predictions,
      alerts: s.alerts,
      patterns: s.patterns,
      sleepAnalyses: s.sleepAnalyses,
      feedSleepInsights: s.feedSleepInsights,
      feeds: s.feeds,
      sleeps: s.sleeps,
      dataLoaded: s.dataLoaded,
      lastUpdated: s.lastUpdated,
    }))
  );

  // refreshPredictions est une fonction stable (référence constante dans Zustand)
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
    alerts,
    patterns,
    sleepAnalyses,
    feedSleepInsights,
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
