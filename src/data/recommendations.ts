import type { BabyName, FeedRecord, DetectedPattern, Prediction, TwinsSyncStatus, TimeSlotId, PatternId } from '../types';
import { PROFILES, DEFAULT_SLEEP } from './knowledge';

export type RecommendationType = 'info' | 'suggestion' | 'reassurance' | 'benchmark';

export interface Recommendation {
  id: string;
  baby?: BabyName;
  title: string;
  message: string;
  type: RecommendationType;
  category?: 'pattern' | 'feeding' | 'sleep' | 'development' | 'twins';
}

// ═══════════════════════════════════════════════════════════════════════════
// Connaissances bébés 6 mois
// ═══════════════════════════════════════════════════════════════════════════

const AGE_6_MONTHS = {
  feeding: {
    typicalVolumeMl: [120, 180],
    typicalIntervalH: [3.5, 4.5],
    feedsPerDay: [4, 6],
    totalDailyMl: [700, 900],
  },
  sleep: {
    totalHours: [12, 15],
    nightStretchH: [6, 10],
    napsPerDay: [2, 4],
    napDurationMin: [30, 90],
  },
};

interface AgeInsight {
  id: string;
  title: string;
  message: string;
  category: 'feeding' | 'sleep' | 'development' | 'twins';
  condition?: (ctx: InsightContext) => boolean;
  relevantSlots?: TimeSlotId[];
  patternBoost?: PatternId;
}

interface InsightContext {
  hour: number;
  slotId: TimeSlotId;
  feeds: FeedRecord[];
  coletteFeeds: FeedRecord[];
  isaureFeeds: FeedRecord[];
  predictions: Record<BabyName, Prediction | null>;
  patterns: DetectedPattern[];
  syncStatus: TwinsSyncStatus | null;
}

function getSlotId(hour: number): TimeSlotId {
  if (hour >= 6 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

function avgVolumeLast24h(feeds: FeedRecord[], now: Date): number {
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  const recent = feeds.filter(
    (f) => f.type === 'bottle' && f.volumeMl > 0 && f.timestamp.getTime() > cutoff,
  );
  if (recent.length === 0) return 0;
  return recent.reduce((s, f) => s + f.volumeMl, 0) / recent.length;
}

function feedCountLast24h(feeds: FeedRecord[], now: Date): number {
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  return feeds.filter((f) => f.timestamp.getTime() > cutoff).length;
}

const AGE_INSIGHTS: AgeInsight[] = [
  // ── Alimentation ──────────────────────────────────────────────────
  {
    id: 'benchmark-volume',
    title: 'Volume typique a 6 mois',
    message: `A 6 mois, un biberon fait en moyenne 120-180 ml. Colette et Isaure sont dans cette fourchette avec respectivement ~${PROFILES.colette.stats.meanVolumeMl}ml et ~${PROFILES.isaure.stats.meanVolumeMl}ml de moyenne.`,
    category: 'feeding',
  },
  {
    id: 'benchmark-feeds-per-day',
    title: 'Nombre de repas par jour',
    message: 'A 6 mois, 4 a 6 repas par jour est la norme. Si vous en comptez plus, c\'est souvent du cluster feeding — pas un probleme.',
    category: 'feeding',
    condition: (ctx) => feedCountLast24h(ctx.feeds, new Date()) > 0,
  },
  {
    id: 'benchmark-total-daily',
    title: 'Apport journalier',
    message: 'Un bebe de 6 mois consomme generalement 700-900 ml par jour (lait maternel + biberon). Si la diversification a commence, le lait reste l\'apport principal.',
    category: 'feeding',
  },
  {
    id: 'benchmark-interval',
    title: 'Intervalle entre repas',
    message: `L'intervalle typique a 6 mois est de 3h30-4h30. Colette (${PROFILES.colette.stats.medianIntervalH}h) et Isaure (${PROFILES.isaure.stats.medianIntervalH}h) ont chacune leur rythme — c'est normal que ca differe.`,
    category: 'feeding',
  },
  {
    id: 'diversification-intro',
    title: 'Diversification alimentaire',
    message: '6 mois est le moment recommande pour introduire les solides. Commencez par des purees lisses (legumes, fruits) en petites quantites. Le lait reste l\'aliment principal jusqu\'a 12 mois.',
    category: 'feeding',
    relevantSlots: ['morning', 'midday'],
  },
  {
    id: 'appetite-variation',
    title: 'Variations d\'appetit',
    message: 'A cet age, l\'appetit varie selon la fatigue, les poussees dentaires, l\'activite et la curiosite. Un repas plus petit suivi d\'un plus gros est un mecanisme de regulation naturel.',
    category: 'feeding',
  },
  {
    id: 'evening-appetite',
    title: 'Appetit du soir',
    message: 'Beaucoup de bebes de 6 mois mangent davantage le soir — c\'est un "plein" avant la nuit. C\'est le cas de Colette (pic a ~147ml le soir).',
    category: 'feeding',
    relevantSlots: ['afternoon', 'evening'],
  },
  {
    id: 'night-feeding',
    title: 'Repas de nuit',
    message: '1 a 2 tetees ou biberons de nuit restent courants a 6 mois. Les repas nocturnes diminuent naturellement avec l\'age — pas besoin de forcer le sevrage.',
    category: 'feeding',
    relevantSlots: ['evening', 'night'],
  },

  // ── Créneaux spécifiques ──────────────────────────────────────────
  {
    id: 'slot-morning-routine',
    title: 'Routine du matin',
    message: `Le matin, Colette mange ~${PROFILES.colette.slots[0].meanMl}ml et Isaure ~${PROFILES.isaure.slots[0].meanMl}ml en moyenne. C'est un bon moment pour un biberon consequent apres la nuit.`,
    category: 'feeding',
    relevantSlots: ['morning'],
  },
  {
    id: 'slot-midday-peak',
    title: 'Pic de mi-journee',
    message: `C'est le creneau ou Isaure mange le plus (~${PROFILES.isaure.slots[1].meanMl}ml). Prevoyez un biberon un peu plus gros pour elle a cette heure.`,
    category: 'feeding',
    relevantSlots: ['midday'],
  },
  {
    id: 'slot-afternoon-rhythm',
    title: 'Rythme de l\'apres-midi',
    message: 'L\'apres-midi, les intervalles sont plus courts (~2h30). Les bebes peuvent reclamer plus souvent — c\'est normal avant le pic du soir.',
    category: 'feeding',
    relevantSlots: ['afternoon'],
  },
  {
    id: 'slot-evening-prep',
    title: 'Preparer la soiree',
    message: `Le soir, Colette mange en moyenne ${PROFILES.colette.slots[3].meanMl}ml (son pic). Preparez un biberon un peu plus grand pour accompagner la transition vers la nuit.`,
    category: 'feeding',
    relevantSlots: ['evening'],
  },
  {
    id: 'slot-night-stretch',
    title: 'Premiere nuit',
    message: `Colette fait des premieres nuits de ~${Math.round(DEFAULT_SLEEP.colette.nightDurationMin / 60)}h${DEFAULT_SLEEP.colette.nightDurationMin % 60} et Isaure ~${Math.round(DEFAULT_SLEEP.isaure.nightDurationMin / 60)}h${DEFAULT_SLEEP.isaure.nightDurationMin % 60} en moyenne. Un bon repas du soir peut aider a allonger ce premier stretch.`,
    category: 'sleep',
    relevantSlots: ['evening', 'night'],
  },

  // ── Sommeil ──────────────────────────────────────────────────────
  {
    id: 'benchmark-sleep',
    title: 'Sommeil a 6 mois',
    message: `Un bebe de 6 mois dort 12-15h par jour : 10-12h la nuit (avec possibles reveils) + 2-3 siestes. Colette (~${Math.round(DEFAULT_SLEEP.colette.nightDurationMin / 60)}h continu) et Isaure (~${Math.round(DEFAULT_SLEEP.isaure.nightDurationMin / 60)}h) sont dans la progression normale.`,
    category: 'sleep',
  },
  {
    id: 'wake-windows',
    title: 'Fenetres d\'eveil',
    message: 'A 6 mois, un bebe peut rester eveille 1h30-2h30 entre deux siestes. Au-dela de 3h, il risque d\'etre "surstimule" et d\'avoir du mal a manger et dormir.',
    category: 'sleep',
    relevantSlots: ['morning', 'midday', 'afternoon'],
  },
  {
    id: 'nap-transition',
    title: 'Transition des siestes',
    message: 'Entre 6 et 9 mois, beaucoup de bebes passent de 3 siestes a 2. Les siestes deviennent plus longues et plus previsibles. Des jours a 3 siestes et d\'autres a 2 sont normaux pendant la transition.',
    category: 'sleep',
    relevantSlots: ['morning', 'midday', 'afternoon'],
  },
  {
    id: 'sleep-regression',
    title: 'Regression du sommeil',
    message: 'Une regression du sommeil est courante entre 4 et 6 mois — reveils plus frequents, siestes courtes. Ca dure 2-4 semaines et c\'est lie au developpement cerebral (pas a la faim).',
    category: 'sleep',
  },
  {
    id: 'slot-nap-timing',
    title: 'Horaires de siestes typiques',
    message: `D'apres l'historique, Colette fait ses siestes vers ${DEFAULT_SLEEP.colette.bestNapTimes.map((t) => `${Math.floor(t.startH)}h`).join(', ')} et Isaure vers ${DEFAULT_SLEEP.isaure.bestNapTimes.map((t) => `${Math.floor(t.startH)}h${t.startH % 1 ? '30' : ''}`).join(', ')}.`,
    category: 'sleep',
    relevantSlots: ['morning', 'midday', 'afternoon'],
  },

  // ── Developpement ─────────────────────────────────────────────────
  {
    id: 'dev-motor',
    title: 'Motricite a 6 mois',
    message: 'A 6 mois, la plupart des bebes tiennent assis (avec appui), attrapent des objets et commencent a se retourner. Cette activite accrue augmente les besoins caloriques.',
    category: 'development',
  },
  {
    id: 'dev-teething',
    title: 'Poussees dentaires',
    message: 'Les premieres dents apparaissent souvent entre 4 et 7 mois. Signes : bave excessive, gencives gonflees, irritabilite. L\'appetit peut baisser de 10-30% pendant quelques jours.',
    category: 'development',
  },
  {
    id: 'dev-curiosity',
    title: 'Curiosite et distraction',
    message: 'A 6 mois, les bebes sont tres curieux de leur environnement. Les repas peuvent etre plus courts ou agites — ce n\'est pas un refus de manger, c\'est de l\'exploration.',
    category: 'development',
  },
  {
    id: 'dev-growth-spurts',
    title: 'Pics de croissance',
    message: 'Les pics de croissance a 6 mois durent 2-4 jours : appetit augmente de 20-40%, repas plus frequents, parfois sommeil perturbe. C\'est temporaire et signe de bon developpement.',
    category: 'development',
    patternBoost: 'GROWTH',
  },
  {
    id: 'dev-weight',
    title: 'Prise de poids',
    message: 'A 6 mois, un bebe a generalement double son poids de naissance. La prise de poids ralentit ensuite (400-500g/mois vs 800g/mois avant). C\'est normal.',
    category: 'development',
  },

  // ── Jumeaux ───────────────────────────────────────────────────────
  {
    id: 'twins-individuality',
    title: 'Chaque jumelle est unique',
    message: `Colette a son pic le soir (${PROFILES.colette.slots[3].meanMl}ml) et Isaure a mi-journee (${PROFILES.isaure.slots[1].meanMl}ml). Leurs rythmes differents sont normaux — meme des jumeaux identiques developpent des preferences distinctes.`,
    category: 'twins',
  },
  {
    id: 'twins-sync-normal',
    title: 'Synchronisation naturelle',
    message: 'Avec 73% de repas synchronises, vos jumelles ont une bonne coordination naturelle. Nourrir les deux ensemble quand c\'est possible facilite la logistique sans forcer un rythme artificiel.',
    category: 'twins',
  },
  {
    id: 'twins-dont-compare',
    title: 'Evitez la comparaison',
    message: `Isaure mange un peu plus que Colette en moyenne (${PROFILES.isaure.stats.meanVolumeMl} vs ${PROFILES.colette.stats.meanVolumeMl}ml) — cette difference est minime et normale. Comparez chaque bebe a son propre historique plutot qu'a sa soeur.`,
    category: 'twins',
  },
  {
    id: 'twins-desync-ok',
    title: 'Desynchronisation ponctuelle',
    message: 'Il est normal que les jumelles se decalent parfois. Un decalage ponctuel ne necessite pas d\'intervention — elles reviennent souvent en phase naturellement.',
    category: 'twins',
    condition: (ctx) => ctx.syncStatus !== null && ctx.syncStatus.state !== 'synchronized',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Génération des recommandations
// ═══════════════════════════════════════════════════════════════════════════

export function generateRecommendations(
  feeds: FeedRecord[],
  patterns: DetectedPattern[],
  predictions: Record<BabyName, Prediction | null>,
  syncStatus: TwinsSyncStatus | null,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const now = new Date();
  const hour = now.getHours();
  const slotId = getSlotId(hour);

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
        title: 'Cluster feeding detecte',
        message: `${profile.name} a eu plusieurs petits repas rapproches. L'intervalle apres devrait etre plus long que d'habitude.`,
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
        message: `${profile.name} mange plus que d'habitude depuis 2 jours. C'est normal et ca dure generalement 2-3 jours.`,
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
        message: `${profile.name} a mange moins que d'habitude. Elle pourrait reclamer un peu plus tot.`,
        type: 'suggestion',
        category: 'pattern',
      });
    }

    if (prediction && prediction.volume.predictedMl > 0) {
      const slotLabel = prediction.slot === 'evening' ? 'le soir' : prediction.slot === 'night' ? 'la nuit' : '';
      if (prediction.slot === 'evening' && profile.key === 'colette') {
        recs.push({
          id: `evening-peak-${baby}`,
          baby,
          title: 'Creneau pic',
          message: `C'est le moment ou ${profile.name} mange generalement le plus (~${Math.round(prediction.volume.predictedMl)}ml). Preparez un biberon un peu plus grand ${slotLabel}.`,
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
          message: `Volume moyen sur 24h : ~${Math.round(avg24h)}ml par repas. La fourchette typique a 6 mois est ${lowTypical}-${highTypical}ml. Si ca persiste, observez les signes de faim.`,
          type: 'benchmark',
          category: 'feeding',
        });
      } else if (avg24h > highTypical * 1.2) {
        recs.push({
          id: `high-volume-benchmark-${baby}`,
          baby,
          title: `${profile.name} : bel appetit !`,
          message: `Volume moyen sur 24h : ~${Math.round(avg24h)}ml par repas. C'est au-dessus de la moyenne pour 6 mois (${lowTypical}-${highTypical}ml). Possible pic de croissance ou besoins accrus.`,
          type: 'benchmark',
          category: 'feeding',
        });
      }
    }
  }

  // ── Twin sync recommendation ──
  if (syncStatus && syncStatus.state === 'desynchronized') {
    recs.push({
      id: 'sync-suggestion',
      title: 'Desynchronisation',
      message: `Les jumelles sont decalees de ${Math.round(syncStatus.gapMinutes)} min. ${syncStatus.suggestion ?? 'Essayez de rapprocher les prochains repas.'}`,
      type: 'suggestion',
      category: 'twins',
    });
  }

  // ── Age-based insights (contextual selection) ──
  const ctx: InsightContext = {
    hour,
    slotId,
    feeds,
    coletteFeeds: feeds.filter((f) => f.baby === 'colette'),
    isaureFeeds: feeds.filter((f) => f.baby === 'isaure'),
    predictions,
    patterns,
    syncStatus,
  };

  const patternIds = new Set(patterns.map((p) => p.id));

  // Score each insight by relevance to current context
  const scored = AGE_INSIGHTS
    .filter((insight) => {
      if (insight.condition && !insight.condition(ctx)) return false;
      return true;
    })
    .map((insight) => {
      let score = 0;

      // Boost if relevant to current time slot
      if (insight.relevantSlots?.includes(slotId)) {
        score += 2;
      }

      // Boost if a related pattern is detected
      if (insight.patternBoost && patternIds.has(insight.patternBoost)) {
        score += 2;
      }

      // Small tiebreaker: rotate within same score based on hour
      const tiebreaker = ((hour + insight.id.charCodeAt(0)) % 10) / 100;

      return { insight, score: score + tiebreaker };
    })
    .sort((a, b) => b.score - a.score);

  // Pick top 3-4 (at least 1 slot-specific if available)
  const picked = scored.slice(0, 4);

  for (const { insight } of picked) {
    recs.push({
      id: insight.id,
      title: insight.title,
      message: insight.message,
      type: 'benchmark',
      category: insight.category,
    });
  }

  return recs;
}
