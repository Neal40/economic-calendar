# CLAUDE.md — Inner Circle Trader (Neal_ICT)

App perso de trading (futures NQ / ES, prop firm TopstepX) : calendrier économique USD,
journal de trading, Review Notion, backtesteur et trade copier Tradovate.
Deux cibles à partir du **même `index.html`** : site statique (GitHub Pages) et app Windows (Electron).

## Règles du projet
- **Langue** : interface et messages utilisateur en **français**. Commits en français ou anglais, une ligne descriptive (ex. `Backtesteur: …`, `Jarvis: …`, `App: …`).
- **Heure** : tout est en **heure de New York (ET, `America/New_York`)**. Toujours passer par `Intl.DateTimeFormat` avec `timeZone`, jamais l'heure locale du PC.
- **Pas d'étape de build pour le web** : `index.html` est autonome (CSS + JS + données embarquées). Pas de framework, pas de bundler. d3 vient du CDN cdnjs (remplacé par une copie locale dans l'exe).
- **Aucune donnée de compte dans le dépôt** (trades, identifiants, tokens). Les données utilisateur vivent dans localStorage / IndexedDB (web) ou le dossier `userData` (Electron).
- **Web et desktop doivent marcher tous les deux** : le code de `index.html` teste `window.desktop` (exposé par `preload.js`). Sans lui → fallback web (import JSON / CSV manuel).

## ⚠️ Zones dangereuses
- **`desktop/copier.js` passe de VRAIS ordres** (Tradovate, `environment: "live"`). Toute modif : garder `demo` par défaut, ne jamais tester en `live`, ne jamais logguer de mot de passe / `sec` / token.
- **Secrets** (token Notion, config copier, clé API Claude du coach) : chiffrés avec `safeStorage` dans `userData` (`notion-token.bin`, `copier-config.bin`, `anthropic-key.bin`). La clé Claude ne repasse jamais au renderer : `ai:ask` appelle l'API depuis `main.js`. Ne pas les déplacer en clair ni les exposer au renderer au-delà de ce que fait déjà `preload.js`.
- Electron : garder `contextIsolation: true` et `sandbox: true`. Nouvelle capacité = nouveau `ipcMain.handle` dans `main.js` + entrée dans `preload.js`, jamais `nodeIntegration`.
- **`tools/jarvis-analyseur.js`** ne doit **jamais** toucher aux ordres / positions : lecture du chart + dessins seulement, et suppression uniquement de ses propres shapes (`localStorage "jarvis:*"`).
- Pas de conseil d'investissement : le code calcule et affiche, il ne décide pas de trades.

## Lire `index.html` (≈ 550 Ko) sans se noyer
Ne jamais lire le fichier en entier. Chercher les marqueurs de section puis lire la plage utile :
`grep -n "/\* ----------" index.html`

**Lignes à ne jamais lire ni réécrire** (énormes, une seule ligne) :
- `const LOGO="data:image/jpeg;base64,…` — logo en base64
- `const EXTRA={…}` (événements 2027) et `const LOW={…}` (impact faible) — données
- `!function(){"use strict";const t={upColor:…` — **Lightweight Charts minifié, inliné** (≈ 160 Ko). Ne pas modifier.

Pour ces lignes, éditer avec un script ciblé (Node / Python) plutôt qu'un Edit de la ligne entière.

### Carte des sections (dans l'ordre du fichier)
| Marqueur `/* ---------- … */` | Rôle |
|---|---|
| `app shell`, `Journal de trading (Stats TopstepX)`, `responsive` | CSS (dans `<style>`) |
| `<!-- day editor -->`, `<!-- week editor -->` | Modales HTML du calendrier |
| `seed data` | `SEED` (nov.–déc. 2026), `EXTRA`, `LOW`, clé de stockage `KEY="econcal-v1"`, objet d'état `S`, `save()` |
| `date helpers`, `state`, `interactions` | Grille mensuelle, jours fériés NYSE calculés, labels de semaine auto (`autoWeek`), filtres |
| `shell / routing` | Menu latéral, navigation par hash (`#calendrier`, …) |
| `abonnements`, `factures` | Paramètres → Abonnement / Factures |
| `Ctrl+F` | Recherche dans la page |
| `Journal : Tags, Images, RR théorique, Hexagone` | Tags (localStorage), images (IndexedDB), modales |
| `Journal de trading : Stats TopstepX` | KPIs, comptes, graphiques d3, calendrier P&L, table des trades |
| `Review : What to focus on ? + Journal de Neal (Notion)` | Lecture Notion, cache IndexedDB, auto-sync On/Off, vues Notion reproduites, biais psychologiques, import CSV web |
| `Review : add / edit / delete in Notion` | Écriture vers Notion (desktop uniquement), drag & drop calendrier, remplissage MAE/MFE depuis TopstepX |
| `Backtesteur style TopstepX` | Cœur du replay `btCore` (marqueurs `btCore:start/end` : horloge, buffer continu multi-séances, bus d'événements, exécution des ordres avec gaps et anti-lookahead), compte démo 50K (MLL 2 000 $ trailing, DLL 1 000 $), chart Lightweight Charts, outils de dessin, modèles, guide « Comment dessiner ». Mise en page façon FX Replay (barre de replay `.tx-rbar` en bas, barre de dessin avec règle / zoom / rester en dessin / repli ; `.tx-side` = panneaux Watchlist / Alertes) ; barre de compte et panneau Order = TopstepX ; SL / TP réglés en glissant leurs lignes (`ordDrag`, `posAt`). Unités de temps : `S.tf` en minutes (secondes = fractions via `SECTF` / `tfSec()`, 3M / 6M / 12M = 129 600 / 259 200 / 518 400) ; préchargées à l'ouverture = `PRELOAD` (5m → 12M), secondes / 2m / 3m au clic ; `fineBars()` = bougies fines du replay (1 s, sinon fichier 5s / 15s / 30s) ; chart MNQ / MES = `und()` pour les ordres et les dessins. Interface = TopstepX à l'identique (v1.39) : icônes `ICON` (28 px), aimant `magMode` faible / fort + `magInd` (localStorage `bt-magmode`, `bt-magind`), arborescence flottante `#btTree` (`bt-treepos`) avec synchro `s.sync` = `none` (visible seulement dans `s.tfOnly`) / défaut / `global` (copie dans `bt-draw-global-<sous-jacent>`), annuler / rétablir `HIST` / `undoRedo()`, Paramètres `openPrefs()` (onglets `PNAV`, clés `PDEF`), overlays `.tx-al` (boutons A / L), `.tx-cd` (compte à rebours), `.tx-nav`, menus du haut `hmenu()` |
| `Profil : Skill IA « Profil prop firm »` | `profilCalc` et `payoutCalc` (fonctions pures testées, marqueurs `:start` / `:end`), rendu `profilRender` : sources Mon profil / Trades détaillés / Backtests (`bt-journal`), Prêt pour un payout, trades concernés, positions sans tags (`jmeta.openTags`), historique par critère, coach IA (`desktop.aiAsk`, dernière analyse `econcal-pf-coach`), alertes en direct (`econcal-pf-alerts`, `econcal-pf-alerted`, branchées sur `jdash.load`) |
| `Trade copier Tradovate` | UI du copier (la logique est dans `desktop/copier.js`) |

Clés localStorage : `econcal-v1` (données principales), `econcal-jtab`, `econcal-mini`, `econcal-calview` (vue du calendrier : mois / semaine), `econcal-review-type`, `econcal-review-view`, `notionAuto`.

### Format d'un événement
`{"t": "8:30 AM", "n": "CPI & Core CPI", "i": "high|med|low", "k": "ev|after|pre|tbd"}`
Indexé par date `YYYY-MM-DD`. `k`: `ev` = news, `after` = earnings après clôture (☾), `pre` = avant ouverture (✳), `tbd` = heure inconnue (◌).

## `desktop/` — app Electron
| Fichier | Rôle |
|---|---|
| `main.js` | Fenêtre, handlers IPC (`journal:*`, `tsx:bars`, `notion:*`, `store:*`, `data:*`, `copier:*`), sync données de marché chaque soir à 23h01, mise à jour auto (`Inner Circle Trader.update.exe` posé à côté de l'exe ; l'ancien nom est encore accepté). Nom produit / exe / titre : **Inner Circle Trader** ; `userData` = `%APPDATA%\Inner Circle Trader` (ancien dossier déplacé une fois par `backup.migrate`) |
| `backup.js` | Au démarrage : sauvegarde du jour de userData (json, bin, Local Storage, IndexedDB) dans `Bureau\Inner Circle Trader\backups\AAAA-MM-JJ` (14 jours gardés) + miroir des bougies 1s dans `backups\bougies-1s` |
| `preload.js` | Pont `window.desktop` (contextBridge) — **seule** API visible depuis `index.html` |
| `topstepx.js` | Connexion + sync des trades/comptes TopstepX → `userData/journal-db.json` (au lancement + toutes les 5 min) |
| `notion.js` | API Notion officielle (query, blocks, create, update, archive, append) |
| `marketdata.js` | Bougies m1 depuis juil. 2023 + 1s → CSV dans `Bureau\Inner Circle Trader\data` (chargé d'office par le backtesteur) (colonnes `time_ny,ts,open,high,low,close,volume`). Lit aussi le dossier `data_csv` (un CSV par symbole et par unité : `NQ_1s.csv`, `NQ_5s.csv`, … `NQ_m1.csv`, … `NQ_12M.csv`, pour NQ / ES / MNQ / MES) qui passe avant `data` ; trous du m1 / 1s comblés par la synchro. `bank()` = cache mémoire en tableaux typés, lecture en flux (jamais de `readFileSync` sur ces fichiers : le 1 s fait 100 Mo). `read` / `readTf` sont **async** |
| `copier.js` | Trade copier Tradovate leader → followers (voir ⚠️) |
| `propsync.js` | Bouton « Synchroniser » des pages Comptes : fenêtre `persist:propfirms` (connexion gardée, 2FA fait par l'utilisateur), récupération Topstep / Apex / My Funded Futures avec les appels de leurs dashboards (lecture seule), transformation et fusion dans `Bureau\Inner Circle Trader\comptes\comptes.json` (rien n'est supprimé, preuves gardées) |
| `prepare.js` | Copie `../index.html` dans `desktop/app/`, remplace Google Fonts et d3 CDN par des fichiers locaux (offline) |

## Dossier ICT (= Inner Circle Trader) sur le Bureau
`C:\Users\rudyd\Desktop\Inner Circle Trader\` contient tout :
- `Inner Circle Trader.exe` — l'app portable (toujours ce nom, jamais dans Téléchargements)
- `data\` — bougies CSV de la synchro · `backups\` — sauvegardes quotidiennes
- `data_csv\` — bougies téléchargées à la main, toutes unités de temps (1,3 Go, **jamais dans git** : `.gitignore`). Cherché dans `Inner Circle Trader\data_csv`, puis dans le `data_csv` de n'importe quel dossier posé dans `Inner Circle Trader\` (dont ce dépôt)
- `inner_circle_trader_main\` — ce dépôt (clone git de `Neal40/economic-calendar`)

**Tester un changement dans l'exe sans attendre GitHub** (≈ 30 s) : fermer l'app, puis `cd desktop && npm run ict` (build portable sans compression, ~360 Mo, copié directement en `Bureau\Inner Circle Trader\Inner Circle Trader.exe`), relancer. `desktop/node_modules` est déjà installé (`npm ci` sinon). La release GitHub reste en compression normale (~106 Mo, build CI ≈ 4 min).

**Mettre à jour l'app locale** (à faire après chaque push dont le build est vert) : fermer l'app, télécharger l'asset `Inner.Circle.Trader.exe` de la release `latest` vers `Bureau\Inner Circle Trader\Inner Circle Trader.exe` (vérifier la taille annoncée par l'API), relancer. Version affichée dans la release = `version` de `desktop/package.json` (monter la version à chaque évolution notable ; v1.0 = anciens fichiers `EconomicCalendar-1.0.0-*`).

## Commandes
- **Web** : ouvrir `index.html` dans un navigateur (aucune install).
- **Exe local** (Windows) : `cd desktop && npm ci && npm run dist` → `desktop/dist/` (portable seul, plus d'installeur) ; `npm run ict` = build rapide + copie dans le dossier ICT.
- **CI** : `.github/workflows/build-exe.yml` construit l'exe à chaque push sur `main` touchant `index.html` ou `desktop/**`, et publie la release `latest`. Un push = une release : ne pas pousser du code cassé.
- **Export API** : `node tools/export-api.js` → `api/calendar.json` (besoin de playwright + d3 depuis `desktop/node_modules`).
- **Données 2027** : `python scripts/generate_2027.py` (dates officielles Fed / BLS / BEA / Census, jours fériés NYSE).
- **Jarvis** : coller `tools/jarvis-analyseur.js` dans la page topstepx.com/trade, puis `await JARVIS.status()` (voir l'en-tête du fichier pour toutes les commandes).

## Vérifier un changement
`node tools/check.js` vérifie la syntaxe, le contrat IPC et les fonctions pures `btStats` / `btCore` / `riskCalc` (risque par position de l'Hexagone). Avant de dire « c'est fait » :
1. Ouvrir `index.html` dans le navigateur, aller sur la vue modifiée, vérifier la console (aucune erreur).
2. Si le changement touche `desktop/` ou `window.desktop` : vérifier aussi le chemin web (fallback sans `window.desktop`).
3. Si le changement touche le copier : vérifier en `demo` uniquement, et le dire explicitement.
4. Pour la logique pure (détection FVG / NWOG, calculs de stats, règles MLL/DLL) : préférer extraire une fonction testable plutôt que vérifier à l'œil.
