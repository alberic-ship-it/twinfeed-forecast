import type { BabyName, FeedRecord, DetectedPattern, Prediction } from '../types';
import { PROFILES } from './knowledge';

export type RecommendationType = 'info' | 'suggestion' | 'reassurance' | 'benchmark';

export interface Recommendation {
  id: string;
  baby?: BabyName;
  title: string;
  message: string;
  type: RecommendationType;
  category?: 'pattern' | 'feeding' | 'sleep' | 'development';
}

// ═══════════════════════════════════════════════════════════════════════════
// Connaissances bébés 6 mois (benchmarks)
// ═══════════════════════════════════════════════════════════════════════════

const AGE_6_MONTHS = {
  feeding: {
    typicalVolumeMl: [120, 180],
    typicalIntervalH: [3.5, 4.5],
    feedsPerDay: [4, 6],
    totalDailyMl: [700, 900],
  },
};

function avgVolumeLast24h(feeds: FeedRecord[], now: Date): number {
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  const recent = feeds.filter(
    (f) => f.type === 'bottle' && f.volumeMl > 0 && f.timestamp.getTime() > cutoff,
  );
  if (recent.length === 0) return 0;
  return recent.reduce((s, f) => s + f.volumeMl, 0) / recent.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// Génération des recommandations
// ═══════════════════════════════════════════════════════════════════════════

export function generateRecommendations(
  feeds: FeedRecord[],
  patterns: DetectedPattern[],
  predictions: Record<BabyName, Prediction | null>,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const now = new Date();

  // ── Pattern-based recommendations ──
  for (const baby of ['colette', 'isaure'] as BabyName[]) {
    const profile = PROFILES[baby];
    const babyFeeds = feeds.filter((f) => f.baby === baby);
    const prediction = predictions[baby];
    const babyPatterns = patterns.filter((p) => p.baby === baby);

    if (babyFeeds.length === 0) continue;

    const cluster = babyPatterns.find((p) => p.id === 'CLUSTER');
    if (cluster) {
      recs.push({
        id: `cluster-${baby}`,
        baby,
        title: 'Cluster feeding détecté',
        message: `${profile.name} a eu plusieurs petits repas rapprochés. L'intervalle après devrait être plus long que d'habitude.`,
        type: 'info',
        category: 'pattern',
      });
    }

    const growth = babyPatterns.find((p) => p.id === 'GROWTH');
    if (growth) {
      recs.push({
        id: `growth-${baby}`,
        baby,
        title: 'Possible pic de croissance',
        message: `${profile.name} mange plus que d'habitude depuis 2 jours. C'est normal et ça dure généralement 2-3 jours.`,
        type: 'reassurance',
        category: 'pattern',
      });
    }

    const compensation = babyPatterns.find((p) => p.id === 'COMPENSATION');
    if (compensation) {
      recs.push({
        id: `compensation-${baby}`,
        baby,
        title: 'Petit repas',
        message: `${profile.name} a mangé moins que d'habitude. Elle pourrait réclamer un peu plus tôt.`,
        type: 'suggestion',
        category: 'pattern',
      });
    }

    if (prediction && prediction.volume.predictedMl > 0) {
      const peakSlot = profile.slots.find((s) => s.peak);
      if (peakSlot && prediction.slot === peakSlot.id) {
        const slotLabel = prediction.slot === 'evening' ? 'le soir'
          : prediction.slot === 'midday' ? 'à mi-journée'
          : prediction.slot === 'morning' ? 'le matin'
          : prediction.slot === 'afternoon' ? 'l\'après-midi' : '';
        recs.push({
          id: `peak-slot-${baby}`,
          baby,
          title: 'Créneau pic',
          message: `C'est le moment où ${profile.name} mange généralement le plus (~${Math.round(prediction.volume.predictedMl)}ml). Préparez un biberon un peu plus grand ${slotLabel}.`,
          type: 'suggestion',
          category: 'pattern',
        });
      }
    }

    // ── Volume comparison with age benchmark ──
    const avg24h = avgVolumeLast24h(babyFeeds, now);
    if (avg24h > 0) {
      const [lowTypical, highTypical] = AGE_6_MONTHS.feeding.typicalVolumeMl;
      if (avg24h < lowTypical * 0.8) {
        recs.push({
          id: `low-volume-benchmark-${baby}`,
          baby,
          title: `${profile.name} : volume en dessous de la moyenne`,
          message: `Volume moyen sur 24h : ~${Math.round(avg24h)}ml par repas. La fourchette typique à 6 mois est ${lowTypical}-${highTypical}ml. Si ça persiste, observez les signes de faim.`,
          type: 'benchmark',
          category: 'feeding',
        });
      } else if (avg24h > highTypical * 1.2) {
        recs.push({
          id: `high-volume-benchmark-${baby}`,
          baby,
          title: `${profile.name} : bel appétit !`,
          message: `Volume moyen sur 24h : ~${Math.round(avg24h)}ml par repas. C'est au-dessus de la moyenne pour 6 mois (${lowTypical}-${highTypical}ml). Possible pic de croissance ou besoins accrus.`,
          type: 'benchmark',
          category: 'feeding',
        });
      }
    }
  }

  return recs;
}
