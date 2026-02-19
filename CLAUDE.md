# TwinFeed Forecast — Guide projet

Application de suivi des repas et du sommeil pour jumeaux (Colette & Isaure, 6 mois).
Déployée sur Netlify, synchronisation multi-appareils via Netlify Blobs.

## Stack technique

- **Frontend** : React 19 + TypeScript + Tailwind CSS + Vite
- **State** : Zustand (`src/store/index.ts`)
- **Backend** : Netlify Functions (serverless) + Netlify Blobs (stockage KV partagé)
- **Déploiement** : GitHub Actions → Netlify auto-deploy sur push `main`

## Commandes essentielles

```bash
npm run dev          # Serveur de développement local
npm run build        # tsc -b && vite build
node_modules/.bin/tsc --noEmit  # Vérification TypeScript SANS build
git add <fichiers> && git commit -m "..." && git push origin main
```

> ⚠️ Toujours lancer `tsc --noEmit` avant de push — le build Netlify est strict.

## Architecture des fichiers

```
src/
├── App.tsx                         # Routeur principal (import → dashboard → entries)
├── main.tsx                        # Point d'entrée React
│
├── store/
│   ├── index.ts                    # Store Zustand central (622 lignes)
│   └── sync.ts                     # Sync serveur Netlify Blobs (fetch + timeout 8s)
│
├── types/
│   └── index.ts                    # Types TypeScript (PatternId, FeedRecord, SleepRecord…)
│
├── data/
│   ├── knowledge.ts                # Profils bébés, créneaux, faits horaires, getHourlyFacts()
│   ├── parser.ts                   # Import CSV (PapaParse)
│   └── recommendations.ts         # Règles de recommandations contextuelles
│
├── engine/
│   ├── predictor.ts                # Prédiction prochain repas (heure + volume)
│   ├── patterns.ts                 # 15 patterns comportementaux (CLUSTER, GROWTH…)
│   ├── alerts.ts                   # Alertes (volume anormal, changement d'appétit)
│   ├── feedSleepLinks.ts           # Corrélations repas↔sommeil
│   ├── sleep.ts                    # Analyse siestes + nuit (fenêtres d'éveil, bedtime)
│   └── recency.ts                  # Pondération temporelle (données récentes prioritaires)
│
├── hooks/
│   └── usePredictions.ts           # Hook d'initialisation et chargement des données
│
└── components/
    ├── Dashboard/DashboardScreen.tsx    # Écran principal
    ├── BabyCard/BabyCard.tsx           # Carte bébé (prédiction + dernière saisie)
    ├── QuickLog/QuickLog.tsx           # Saisie rapide repas (+ confirmation 3s)
    ├── QuickLog/SleepLog.tsx           # Saisie rapide sieste (+ confirmation 3s)
    ├── Sleep/SleepPanel.tsx            # Panneau analyse sommeil
    ├── Night/NightModule.tsx           # Module nuit (start/end + repas nocturnes)
    ├── Night/NightRecap.tsx            # Récap de nuit
    ├── Entries/EntriesScreen.tsx       # Saisies du jour (repas, siestes, nuits)
    ├── Insights/InsightsScreen.tsx     # Statistiques & patterns détectés
    ├── Alerts/AlertsList.tsx           # Alertes dismissibles
    ├── Recommendations/Recommendations.tsx  # Recommandations contextuelles
    └── Import/ImportScreen.tsx         # Import CSV

netlify/functions/
├── sync.mts          # API CRUD feeds + sleeps (GET/POST/PATCH/DELETE)
└── sync-night.mts    # API sessions de nuit (GET/POST)
```

## Modèles de données clés

```typescript
FeedRecord    { id, baby, timestamp, type: 'bottle'|'breast', volumeMl }
SleepRecord   { id, baby, startTime, endTime?, durationMin }
NightSession  { id, baby, startTime, endTime?, feeds: NightFeedEntry[] }
NightRecap    { baby, session, totalDurationMin, feedCount, totalVolumeMl, … }
DetectedPattern { id: PatternId, label, description, baby, timingModifier?, volumeModifier? }
```

## Patterns détectés (15 au total)

| ID | Déclencheur |
|----|-------------|
| CLUSTER | ≥3 repas en 3h (≥4 si tout tétées) |
| COMPENSATION | Dernier biberon < 70% moyenne créneau |
| EVENING | 18h–22h |
| NIGHT_LIGHT | 22h–6h |
| POST_NAP | Sieste >45 min terminée il y a <30 min |
| GROWTH | Volume moyen 48h > 125% de la moyenne 14j |
| BREAST_RATIO_SHIFT | Proportion tétées 48h +20pts vs 14j |
| LONG_INTERVAL | Gap depuis dernier repas > 1.5× médiane |
| MORNING_FIRST | Premier repas de la journée (5h–11h) |
| AFTERNOON_DIP | 13h–17h |
| SHORT_NAP_SERIES | ≥2 siestes <35 min aujourd'hui |
| OVERTIRED | >5h sans sommeil en journée (8h–20h) |
| VOLUME_DECLINE | 3+ biberons successifs en baisse |
| SUSTAINED_APPETITE | 3 derniers biberons >110% moyenne (12h) |
| SHORT_NIGHT | Dernière nuit <8h |

> Pour ajouter un pattern : (1) ajouter l'ID dans `PatternId` (`types/index.ts`), (2) implémenter la détection dans `patterns.ts`.

## Repères bébé (getHourlyFacts)

~73 faits dans `BABY_FACTS_6M` (4 catégories : feeding, sleep, development, twins).
Rotation : **Fisher-Yates seedé par `dayOfYear`** → mélange différent chaque jour, 2 faits/heure, toutes les catégories représentées équitablement.

## Store Zustand — points d'attention

- **`refreshPredictions()`** : recalcule tout (prédictions, patterns, alertes, analyses sommeil). Debounce via `_lastRefreshKey` (inclut IDs premier/dernier feed).
- **`_refreshInsights()`** est appelé **en interne** par `refreshPredictions()` — ne pas l'appeler séparément.
- **`logFeed()`** inclut un garde anti-doublon : même baby/type/volume dans les 60s → rejeté.
- **`nightSessions`** (actif) vs **`nightRecaps`** (terminé) : deux états séparés.

## Sync serveur

- Timeout 8s (`AbortSignal.timeout`) sur tous les appels fetch.
- Vérification `res.ok` systématique → lève une erreur si HTTP ≥ 400.
- `seedFeedIds` / `seedSleepIds` : IDs des données CSV initiales, jamais pushés au serveur.

## Bébés

| Prénom | Clé | Couleur |
|--------|-----|---------|
| Colette | `colette` | rose/mauve |
| Isaure | `isaure` | violet/indigo |

Profils définis dans `PROFILES` (`knowledge.ts`) avec créneaux horaires et volumes moyens par créneau (morning/midday/afternoon/evening/night).

## Déploiement

- **Repo** : `https://github.com/alberic-ship-it/twinfeed-forecast.git`
- **Branche** : `main` — chaque push déclenche un déploiement Netlify automatique (~1 min)
- **Vérifier** : `gh run list --limit 1`
