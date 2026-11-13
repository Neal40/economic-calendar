# Spécification salle blanche : Backtesteur, d'après l'observation de FX Replay

Observé le 12/11/2026 sur app.fxreplay.com (version 2.0.6430, compte gratuit Neal_NQ1).

## Règles de la salle blanche

1. **Observateur → spec → implémenteur.** Ce document décrit uniquement **ce que fait** le logiciel, pour l'utilisateur, dans nos propres mots. Il ne contient ni code, ni CSS, ni textes copiés mot pour mot, ni ressources graphiques de FX Replay.
2. L'implémentation se fait **uniquement à partir de cette spec** et du code existant du Backtesteur. Pendant qu'on code, on n'ouvre pas FX Replay et on n'inspecte ni son code source ni ses requêtes réseau.
3. On ne reprend ni le nom, ni le logo, ni les couleurs de marque, ni les icônes, ni les textes marketing. Le style reste celui de l'app (thème TopstepX / variables `--tx-*`).
4. Les captures du dossier `captures/` servent de **mémoire de l'observation**. On ne les décalque pas et on ne les met pas dans l'app.

Légende des priorités : **P1** = gros gain pour du backtest ICT sur NQ / ES · **P2** = utile · **P3** = confort.
Statut dans le Backtesteur : ✅ existe · 🟡 partiel · ❌ absent.

---

## 1. Navigation du replay : « Aller à » un événement (P1) 🟡

Captures 12, 13, 14.

**Ce qu'on observe :** à côté des boutons du replay, un bouton « Aller à » ouvre une liste de sauts vers le prochain événement de marché :
- début de la prochaine séance (Asie, Londres, New York) ;
- prochaine ouverture du jour suivant ;
- prochaine fenêtre Silver Bullet : Londres, NY AM, NY PM ;
- prochaine news du calendrier ;
- un prix (le replay avance jusqu'à ce que le prix soit touché) ;
- une date future.

Chaque élément a une **étoile** : les éléments étoilés apparaissent dans le menu court, et les deux premiers ont un raccourci clavier affiché à droite. Un panneau « Réglages » permet de régler les heures de chaque événement, **en heure de New York** (menu déroulant par demi-heure), de choisir des **jours à sauter** (Lun → Dim) et de remettre les valeurs par défaut.

**Comportement attendu dans notre version :**
- Le saut fait avancer le replay sans rien révéler (anti-lookahead conservé) jusqu'à la **première bougie ≥ l'heure cible** du prochain jour de trading qui n'est pas exclu.
- Le saut ne recule jamais. Si l'heure cible est déjà passée aujourd'hui, on va au jour suivant.
- « Prochaine news » : utilise notre calendrier économique USD. On peut filtrer sur rouge seulement, ou sur rouge + orange.
- « Prix » : on saisit un niveau. Le replay avance vite, sans dessiner, jusqu'au premier croisement, puis s'arrête. On peut annuler avec Échap.
- Nos défauts ICT : Londres 02:00, NY AM 09:30, Silver Bullet London 03:00, Silver Bullet AM 10:00, Silver Bullet PM 14:00, macros (xx:50 → xx:10), 8:30 news.

**Aujourd'hui dans le Backtesteur :** « Aller à une date » (date + heure) existe, mais pas les sauts vers un événement.

## 2. Pas du replay séparé de l'unité du chart (P1) ❌

Captures 10, 11.

**Ce qu'on observe :** dans la barre du replay, un sélecteur règle la **taille du pas** (1m, 3m, 5m, 10m, 15m, 30m…), indépendamment de l'unité de temps affichée. Il a deux interrupteurs :
- « Synchroniser avec le chart » : le pas suit l'unité du chart ;
- « Afficher les heures de marché fermé ».

La vitesse est réglée avec un **curseur** ; une bulle au survol indique « N× par seconde ». Bougie précédente / suivante, lecture / pause.

**Comportement attendu :** sur un chart H1, on peut avancer minute par minute, ce qui fait se former la bougie H1 en cours. À l'inverse, sur un chart 1m, on peut avancer de 15 minutes d'un coup. Le bouton « Bougie suivante » avance d'**un pas**. Le pas est mémorisé avec les préférences du chart.

**Aujourd'hui :** une liste de vitesses (temps réel → 100×). Le pas est toujours la bougie fine du replay.

## 3. Barre de replay détachable (P3) ❌

Capture 10.

On observe une poignée pour **déplacer la barre** de replay, un bouton pour la **détacher** (elle flotte au-dessus du chart) et une épingle pour la remettre en bas.

## 4. Ticket d'ordre orienté risque (P1) 🟡

Capture 09.

**Ce qu'on observe :**
- un onglet Vendre / Acheter ;
- le risque calculé sur le **solde initial** ou le **solde actuel** ;
- un **risque en %** avec des boutons rapides (0,5 / 1 / 2 / 3 / 5 %), modifiable ;
- un encart « perte estimée / gain estimé / ratio R:R » mis à jour en direct ;
- un type d'ordre (Marché / Limite / Stop) ;
- des unités (avec un menu d'unité) et un prix d'entrée ;
- des sorties sous forme d'interrupteurs : Stop loss, Take profit, Breakeven auto ;
- des **tags** (recherche + création) ;
- une case « Ouvrir le journal après avoir passé l'ordre » ;
- des **préréglages** (presets) enregistrables ;
- un bouton pour ouvrir le ticket dans une fenêtre flottante.

Sur le chart, une ligne d'ordre « fantôme » apparaît avant validation, avec les pastilles Acheter / TP / SL / quantité / croix.

**Comportement attendu pour NQ / ES** (valeurs du point : NQ 20 $, MNQ 2 $, ES 50 $, MES 5 $) :
- risque % × solde → $ à risquer ;
- contrats = arrondi inférieur de ($ à risquer ÷ (distance SL en points × valeur du point)), au minimum 1 ;
- s'il faut moins de 1 contrat, on le signale en rouge ;
- le ratio R:R est calculé depuis le TP ;
- « Breakeven auto » : remonte le SL au prix d'entrée quand le gain atteint X R (réglable, 1R par défaut) ;
- les presets enregistrent : risque %, R:R visé, type d'ordre, tags.

**Aujourd'hui :** quantité en contrats, SL / TP par glisser, Market / Limit / Stop. Il n'y a pas de dimensionnement par risque %, pas d'estimation perte / gain, pas de presets, pas de tags au moment de l'ordre, pas de breakeven auto.

## 5. Sessions de backtest (P1) ❌

Captures 03 à 07.

**Ce qu'on observe :** chaque backtest est une **session nommée**, avec :
- **Infos** : nom, stratégie (liste + « créer une stratégie »), mise en page du chart associée (optionnelle), description ;
- **Solde et actifs** : solde de départ, un ou plusieurs actifs ;
- **Coûts** : interrupteur spreads + commissions, et un **slippage** en 4 crans (Off / Léger / Moyen / Fixe), appliqué seulement aux exécutions suivantes ;
- **Plage de dates** : date de début et de fin, « fin mise à jour automatiquement », « bougies lissées ».

La page Sessions affiche la session choisie (solde, plage, jours restants, bouton « Aller au chart ») et des tuiles P&L total, Win rate, R:R, gain du mois / de la semaine / du jour.

**Comportement attendu :** plusieurs sessions en parallèle (ex. « NQ Silver Bullet 2024 », « ES Macros Q1 »). Chaque session garde sa propre position de replay, ses trades, son solde, ses dessins (ou les dessins partagés, au choix) et ses règles de compte (50K TopstepX : MLL 2 000 $ trailing, DLL 1 000 $, ou personnalisées). Commissions par défaut réalistes, par aller-retour (NQ / ES ≈ 4 $, micros ≈ 1,5 $), modifiables.

**Aujourd'hui :** un seul compte démo 50K ; les mises en page sont sauvegardées, mais il n'y a pas de notion de session isolée, ni de coûts ou de slippage.

## 6. Analytique du backtest (P1) 🟡

Captures 01, 02, 15 à 18.

**Ce qu'on observe :**
- **Filtres** combinables : type, actifs, sens, résultat, tags, session, stratégie, jour, heure, fuseau horaire, date du backtest. Bouton Appliquer, export, partage.
- **Performance** :
  - courbe P&L (Tout / Jour / 1 h / 15 min) ;
  - P&L total, solde, win rate, nombre de trades, trades au breakeven avec un **seuil de BE réglable** ;
  - **R:R moyen / max** ;
  - **R:R idéal moyen / max** (ce qu'on aurait obtenu en sortant au meilleur prix avant le SL) ;
  - « aurait pu être gagnant / BE » ;
  - espérance, avec une barre gain moyen / perte moyenne, et profit factor ;
  - un bloc Gagnants et un bloc Perdants (nombre, meilleur / pire, moyenne, durée moyenne, séries max et moyennes) ;
  - performance par sens, **par séance** (Asie / Londres / NY / hors séance), **par heure**, par jour de la semaine, par mois (tableau année × mois) ;
  - **calendrier** P&L ;
  - fréquence des trades (par jour, semaine, mois).
- **Drawdown** : drawdown de l'équité en $ ou en %, drawdown max et moyen, temps de récupération, fréquence, **histogramme MAE en R**, drawdown sur les trades gagnants.
- **Simulation** :
  - simulateur de SL (« et si mon stop était X % plus serré ») ;
  - simulateur de R:R (« et si je visais 3R ») ;
  - **Monte Carlo** des courbes d'équité.
- **Tableau de bord** : temps investi, temps historique rejoué, trades pris (répartition achat / vente), win rate global, histogrammes mensuels du temps investi et du win rate, trades par symbole.

**Comportement attendu :** les MAE / MFE de chaque trade se calculent pendant le replay, à partir des bougies fines (on a déjà les données). Les séances et les fenêtres ICT sont calculées en heure de New York. La règle « une position = un trade » s'applique comme dans le journal.

**Aujourd'hui :** les stats sont dans le journal TICKTAPE (comptes réels) ; il y a un peu de MAE. Il manque une analytique dédiée aux trades du backtest (R:R idéal, séances, simulateurs).

## 7. Panneaux à droite en onglets (P2) 🟡

Captures 19 à 21.

**Ce qu'on observe :** une barre d'icônes verticale à droite (Ordre, Arborescence, Watchlist, Journal, News). Chaque panneau s'ouvre comme un **onglet** dans un dock commun, on peut en avoir plusieurs, avec un « + » et une croix.
- **Journal** : Trades / Notes / Calendrier.
- **News** : bandeau des jours de la semaine et liste horodatée (drapeau, impact, titre) **jusqu'à la date du replay uniquement**.
- **Arborescence** : objets groupés (« derrière les bougies »…), date de chaque objet, œil / cadenas / poubelle par objet, bouton « Grouper ».

Sous le chart, des pastilles News avec un compteur sont posées sur l'axe du temps.

**Aujourd'hui :** Watchlist, Alertes, Arborescence et News existent, mais en panneaux séparés. Il n'y a pas de dock à onglets ni de journal dans le replay.

## 8. Positions / ordres / historique (P2) ✅🟡

Capture 22.

On observe un tiroir sous le chart avec trois onglets : Positions ouvertes / Ordres en attente / Positions fermées. Colonnes : actif, sens, taille, entrée, TP, SL, P&L latent, P&L réalisé, commission. Il y a une pagination et un nombre de lignes par page.

**Aujourd'hui :** le bouton « Positions » existe. Il faut vérifier les colonnes TP / SL / commission.

## 9. Raccourcis clavier (P2) 🟡

Capture 23.

**Ce qu'on observe :** une fenêtre avec une recherche et des groupes : Outils de dessin, Édition, Replay, Watchlist, Trading. Côté replay, il y a des raccourcis pour :
- lecture / pause ;
- bougie suivante ou précédente ;
- ralentir ou accélérer ;
- diminuer ou augmenter le pas du replay ;
- synchroniser le pas avec le chart.

Côté trading : nouvel ordre limite, stop ou marché, et achat / vente rapide.

**Aujourd'hui :** la liste de raccourcis existe. Il manque le pas du replay, la vitesse au clavier et les sauts « Aller à » (§1).

## 10. Divers chart (P3)

- Barre du bas : 1D / 5D / 1M / 3M / 6M / 1Y / Tout, « aller à une date », horloge, et les échelles % / log / auto (✅ en partie).
- Capture du chart, mise en page nommée, thème clair / sombre, plein écran (✅ fait le 12/11).
- Barre de favoris de dessin flottante (✅).

---

## Ordre d'implémentation proposé

| # | Lot | Pourquoi | Taille |
|---|-----|----------|--------|
| 1 | « Aller à » des événements ICT (§1) + raccourcis | Gain de temps énorme pour enchaîner les Silver Bullet / macros | M |
| 2 | Ticket au risque % + estimation perte / gain / R:R + breakeven auto (§4) | Colle à la règle de risque des prop firms | M |
| 3 | Pas du replay séparé + curseur de vitesse (§2) | Voir la bougie H1 / M15 se former minute par minute | M |
| 4 | MAE / MFE par trade + analytique backtest (R:R idéal, par séance / heure / jour) (§6) | Savoir ce qui marche vraiment | L |
| 5 | Sessions de backtest isolées + coûts / slippage (§5) | Comparer des stratégies proprement | L |
| 6 | Dock à onglets + journal dans le replay (§7) | Confort | M |
| 7 | Simulateurs SL / R:R / Monte Carlo (§6) | Bonus | M |
