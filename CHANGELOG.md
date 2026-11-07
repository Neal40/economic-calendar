# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [sémantiques](https://semver.org/lang/fr/).

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
