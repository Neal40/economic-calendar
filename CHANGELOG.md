# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [sémantiques](https://semver.org/lang/fr/).

## [1.14.1] — 2026-11-07
### Modifié
- Synchro Notion → app : vérification des changements toutes les 5 s (au lieu de 45 s), une seule à la fois.
### Corrigé
- Synchro Notion : un trade créé ou modifié dans Notion dans la même minute que la dernière synchro n'était jamais détecté (dates Notion arrondies à la minute).

## [1.14.0] — 2026-11-07
### Modifié
- L'app s'ouvre toujours en fenêtre agrandie ; son nom au survol de l'icône est « Inner Circle Trader ».
- App Windows : boutons retirés car tout est automatique : « Synchroniser Notion » et « Synchro Notion : On/Off » (synchro Notion toujours active), « Synchroniser TopstepX » (n'apparaît que pour se reconnecter si la session a expiré), « Importer comptes.json / trades.json », « Exporter / Importer tags & images », « Journal Notion ». La version web garde ses imports.
### Corrigé
- Factures / abonnements (app Windows) : `app-data.json` n'est plus réécrit avant d'avoir été relu au démarrage (ni s'il est illisible), et toute sauvegarde qui contient moins de factures ou d'abonnements garde d'abord une copie horodatée de l'ancien fichier (`app-data-<date>.json`).

## [1.13.4] — 2026-11-07
### Modifié
- Journal de trading › Stats TopstepX › tableau Trades : colonnes « RR parfait », « Tags » et « Images » retirées.

## [1.13.3] — 2026-11-07
### Modifié
- `comptes.json` et `trades.json` sont toujours dans `Bureau\Inner Circle Trader\data` (hors du dépôt, à côté des bougies) : copie lisible et sauvegarde de la base du journal, réécrite à chaque synchro.

## [1.13.2] — 2026-11-07
### Modifié
- `comptes.json` et `trades.json` sont lus et fusionnés dans la base au démarrage, puis réécrits à jour après chaque synchro TopstepX et chaque import : les comptes passés ou fermés sont toujours là, même sans synchro.
- `.gitignore` : ces deux fichiers de compte ne partent jamais dans le dépôt.

## [1.13.1] — 2026-11-07
### Corrigé
- Journal TopstepX : une synchro ne supprime plus jamais un compte ni un trade déjà enregistré dans `journal-db.json` ; elle ajoute et met à jour (fusion par ID). Un compte que TopstepX ne renvoie plus (challenge passé, compte fermé) est archivé avec ses trades.
- App Windows : « Importer comptes.json / trades.json » est de nouveau disponible et **fusionne** le fichier dans la base locale (les données existantes restent prioritaires) au lieu de remplacer l'affichage.
### Ajouté
- Tests de la fusion (`desktop/topstepx.test.js`).

## [1.13.0] — 2026-11-07
### Ajouté
- Langue de l'interface : français (par défaut) ou anglais, dans **Profil › Langue / Language** (mémorisée, clé `econcal-lang`).
- Couvre l'interface visible : menu, profil, journal, Journal backtest, backtesteur (barre du haut, outils de dessin, fenêtres, messages), boîtes de confirmation. Dictionnaire FR→EN en fin d'`index.html`.

## [1.12.0] — 2026-11-07
### Ajouté
- Type de compte du backtest (bouton du compte en haut à gauche) : **Prop firm** (50K / 100K / 150K, MLL trailing, DLL, objectif, consistance, règle de payout réglables) ou **Classique** (sans règles, MLL / DLL masqués).
- Drapeau « Clôturer la session » : récapitulatif enregistré dans le nouvel onglet **Journal de trading › Journal backtest** (P&L, win rate, RR, profit factor, durée moyenne, jours, objectif atteint, consistance, payouts possibles avec leurs dates).
- Test automatique des stats du Journal backtest dans `tools/check.js`.

## [1.11.0] — 2026-11-07
### Ajouté
- 2 charts : réticule synchronisé (même heure sur les deux charts, prix de la bougie de l'autre symbole).
- Dessins sur le 2e chart, enregistrés à part (clé `bt-draw2-<mise en page>-<symbole>`) ; le chart cliqué devient le chart actif (outils, raccourcis, arborescence).

## [1.10.0] — 2026-11-07
### Ajouté
- Chaque mise en page a ses propres dessins ; sauvegarde automatique toutes les 5 s.
- Bouton « Arborescence des objets » dans la barre d'outils de gauche.
- README complet et ce CHANGELOG.
### Corrigé
- La barre du haut du backtesteur défile au lieu de couper ses boutons.

## [1.9.2] — 2026-11-07
### Corrigé
- Plus de boucle de relance quand `Inner Circle Trader.update.exe` est lancé directement.
- Plus de génération de CSV à chaque synchro ; lecture souple des CSV par unité de temps.

## [1.9.0] — 2026-11-07
### Ajouté
- Bougies natives par unité de temps (m2 … M) depuis des CSV, boutons W et M.

## [1.8.0] — 2026-11-07
### Ajouté
- 2 charts côte à côte (NQ + ES) synchronisés sur le replay.

## [1.7.0] — 2026-11-07
### Ajouté
- News Forex Factory : drapeaux sous les bougies, panneau News, Maj+W.

## [1.6.0] — 2026-11-07
### Ajouté
- Préférences du chart, sessions de backtest enregistrées, mises en page.

## [1.5.0] — 2026-11-07
### Ajouté
- Arborescence des objets : groupes, renommer, glisser-déposer, multi-sélection, clic droit.

## [1.4.0] — 2026-11-07
### Ajouté
- Moteur de dessin générique et ~70 nouveaux outils.

## [1.3.0] — 2026-11-07
### Ajouté
- Barre d'outils façon FXReplay, favoris, TP/SL glissables avec P&L.

## [1.2.0] — 2026-11-07
### Modifié
- L'app devient « Inner Circle Trader » ; données sur le Bureau ; sauvegardes quotidiennes.

## [1.0.0]
- Première version « Economic Calendar ».
