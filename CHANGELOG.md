# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [sémantiques](https://semver.org/lang/fr/).

## [1.51.0] — 2026-11-13
### Ajouté
- **Backtesteur › Aller à** (bouton du replay, Ctrl+Alt+G) : saut au prochain début de séance (Asie, Londres, New York 8:30, RTH 9:30, Globex 18:00), Silver Bullet (Londres, AM, PM), macro ICT, news du calendrier (rouges ou rouges + orange), prix touché ou date. Le replay s'arrête juste avant l'heure, les ordres s'exécutent pendant le saut. Réglages en heure de New York : favoris ★ (Alt+1 / Alt+2 / Alt+3), jours à sauter.
- **Pas du replay** indépendant de l'unité du chart (bougie du chart, ou 1m → 4h : la bougie H1 se forme minute par minute), Alt+4 / Alt+5 / Alt+6 ; **vitesse au curseur** (temps réel → 300×).
- **Panneau Order › Risque %** : taille calculée pour risquer X % du solde initial, du solde actuel ou de la marge avant MLL (stop, frais et slippage compris), stop / cible en points, perte et gain estimés, R:R, **breakeven auto** à X R, **tags** du trade, presets enregistrables, ouverture du journal après l'ordre (Alt+Q = risque on / off).
- **MAE / MFE et risque initial** enregistrés sur chaque trade du backtest (gardés dans le Journal backtest à la clôture).
- **Analytique du backtest** (Alt+Y) : filtres (source, sens, résultat, séance, tag), P&L, win rate, profit factor, espérance, R moyen, R idéal (MFE), perdants passés par +1 R, gagnants / perdants, courbe d'équité, résultats par séance NY, sens, jour, heure, mois et tag ; drawdown (max, moyen, récupération, histogramme MAE en R) ; simulateurs stop plus serré, cible fixe en R et Monte Carlo ; export CSV.
- **Dock Journal / News** à droite (Alt+K, Alt+N) : trades de la session avec R, MFE, tags et note par trade, notes de session, boutons Analytique et Clôturer ; news du jour jusqu'à l'heure du replay.
- **Sessions** : stratégie et description, filtre par stratégie, P&L et win rate dans la liste. **Type de compte** : frais par contrat (NQ / ES, micros) et slippage (marché et stops), modifiables sans remettre le compte à zéro.
- **Mise en page des charts** : 1 chart, 2 côte à côte ou l'un sous l'autre, synchro Symbole / Intervalle (2e chart avec sa propre unité) / Réticule / Heure / Plage de dates ; bouton ⋯ : nouvelle fenêtre (backtesteur) et plein écran.
### Modifié
- RTH = 9:30 → 16:14 NY (dernière bougie m1 : 16:14).
### Corrigé
- 2e chart : plus de plantage quand son historique traverse le passage à l'heure d'hiver.

## [1.50.0] — 2026-11-13
### Ajouté
- **Backtesteur › Indicateurs Pine Script / TypeScript** : section « Mes indicateurs » dans le menu ƒx (cocher = afficher sur le chart), onglet **Paramètres › Indicateurs** (activer, réglages des `input`, modifier, supprimer) et icône `</>` à côté de Paramètres qui ouvre un **éditeur de code** plein écran (liste, numéros de ligne, ▶ Tester, Enregistrer, Enregistrer + afficher, import / export `.pine` / `.ts`, JS généré, Ctrl+S / Ctrl+Entrée). Moteur exécuté bougie par bougie : sous-ensemble Pine v5 traduit en JS (`indicator`, `input.*`, `plot` ligne / escalier / histogramme / cercles / aire, `hline`, `plotshape`, `plotchar`, `var`, `:=`, `if` / `for` / `while`, fonctions `=>`, tuples, `x[n]`, `na` / `nz`, `color.*`, `math.*`, ~40 fonctions `ta.*`) ; TypeScript / JavaScript avec la même API (types retirés avant exécution). Indicateurs « sous le chart » (RSI…) dans une bande en bas. Exemples : EMA 20 / 50, RSI, VWAP de séance. `label`, `line`, `box`, `fill`, `bgcolor`, `request.security`, `strategy.*` ignorés avec avertissement.
- **Ordres en attente** : étiquette « Limit +1 · P&L · × » sur chaque ligne d'ordre ; la croix annule l'ordre, glisser l'étiquette le déplace.
- **Dessins Position longue / courte** : section Position dans les paramètres du dessin — contrat, taille de compte, taille de position en contrats fixes, risque en $ ou en % du compte (contrats calculés selon le stop, arrondis vers le bas) ; cible / stop affichés en $ et en % du compte.
- **Pavé numérique** : 1 / 2 / 3 / 5 / 15 = minutes, 60 = H1, 240 = H4, validé par Entrée ou tout seul après 1 s (avec ou sans Verr. Num) ; 1D / 1W / 4H / H4 reconnus au clavier.
### Modifié
- Icônes Jarvis (HUD cyan) et Alertes de prix (cloche orange) ; bouton « Préférences » renommé **Paramètres**.

## [1.49.0] — 2026-11-13
### Ajouté
- **Comptes › Tradeify** (sous My Funded Futures) : bouton « Synchroniser » qui récupère depuis le dashboard Tradeify (fenêtre de connexion gardée, lecture seule) les comptes (solde, limites, drawdown, éligibilité payout et règles : profit minimum, jours, consistance, microscalping), les trades du Journal Tradeify, les commandes payées (coupon compris) et les payouts. Page au format MFFU (courbe, jours, trades, achats liés). Avertissement si le Journal Tradeify ne contient pas tous les trades du compte.
- **Comptes › Phidias** (sous Tradeify) : synchro du tableau de bord Phidias (comptes en cours par catégorie) et de l'historique de paiement, en euros (montant réel payé, équivalent USD au taux BCE du jour).
- Tradeify et Phidias ajoutés dans Mes comptes, Payouts, Achats & reçus et « Synchroniser toutes les prop firms ».

## [1.48.0] — 2026-11-12
### Ajouté
- **Journal de Neal › Analyse › Sortie : 2R ou 3R ?** : à partir du MFE (R) de chaque setup Notion, compare un TP fixe à 2R, un TP fixe à 3R et « 50 % à 2R + BE, runner 3R », face au RR fait réel. Filtres Tous / Trades pris / Reviews, hypothèse si l'objectif n'est pas atteint (BE ou SL), valeur de 1R en $ (défaut 500 $). Liste des setups qui ont touché 2R sans atteindre 3R (coût du 3R) et des trades pris qui ont touché 2R puis fini sous 2R (gains rendus). Suit le filtre de période (jour / mois / année) et de type. Fonction pure `exitCalc` testée par `tools/check.js`.

## [1.47.0] — 2026-11-12
### Ajouté
- **Synchro TopstepX avec la connexion Chrome** : favori « → ICT » (page `tsx-chrome.html`) qui envoie la session TopstepX ouverte dans Chrome à l'app via le lien `innercircletrader://tsx` ; l'app la garde chiffrée (`tsx-token.bin`, safeStorage) et se synchronise aussitôt. Boutons « Utiliser ma connexion Chrome » et « Se reconnecter » → ouvre TopstepX dans Chrome (Maj+clic = ancienne fenêtre de connexion de l'app). L'app n'accepte plus qu'une instance à la fois.

## [1.46.1] — 2026-11-12
### Ajouté
- **Mes comptes › Profitabilité totale** : case « Gain en comptes Challenge » (P&L cumulé de tous les comptes challenge, en euros) avec le nombre de challenges passés sur le total (ex. 29/130). Ce P&L reste hors du résultat net (argent non retirable).

## [1.46.0] — 2026-11-12
### Ajouté
- **Comptes › Mes comptes** (au-dessus de Topstep) : vue d'ensemble de tous les comptes. **Compte All-data** (comptes actifs / inactifs, capital total, positions gagnantes / perdantes, winrate / taux BE, profit et perte moyens, rendement, bouton vers le Journal), liste des comptes Topstep / Apex / MFFU / TopstepX + compte démo du Backtesteur avec onglets **Tous / Actifs / Bientôt inactifs / Inactifs** (bientôt inactif = violation ou à moins de 25 % du seuil de perte), et par compte : renommer, voir le détail, synchroniser, masquer (rien n'est supprimé). Cartes « Ajouter un nouveau compte » (synchro de toutes les prop firms, import comptes.json en web) et « Créer un compte d'entraînement » (Backtesteur). **Profitabilité totale** en euros : dépenses prop firms, gain des comptes funded, réussite des challenges, gains retirés, résultat net, avec le rappel en USD.
### Corrigé
- Taux USD→EUR : une seule tentative par date et par session (évite une boucle de rendu hors ligne).

## [1.45.0] — 2026-11-12
### Ajouté
- **Paramètres › Affiliation** (sous Profil) : une carte par prop firm avec la réduction, le code promo (bouton Copier) et le lien d'affiliation (ouvert dans le navigateur) ; liens, codes et réductions modifiables dans le tableau (Topstep, Apex, My Funded Futures pré-remplis).

## [1.44.0] — 2026-11-12
### Ajouté
- **Profil** : carte de profil (logo, nom, handle, bio, stratégies, boutons des réseaux cliquables qui s'ouvrent dans le navigateur) ; champs **Bio**, **Stratégies de trading** (SMC/ICT, Orderflow, Indicateurs, EA/Bots, Chartisme, Price action, Scalping, Swing — clic pour activer) et **Réseaux sociaux** (X, Discord, YouTube, Twitch, Instagram, TikTok) avec lien « Ouvrir ↗ » ; liens vérifiés (http/https seulement, https ajouté si absent).

## [1.43.0] — 2026-11-12
### Ajouté
- **Profil › Skill IA › Coach IA** (app Windows / Mac) : Claude lit le rapport complet (score, critères, stratégie, payouts, comptes) et rend un plan — statut, 3 points faibles chiffrés, plan de la semaine, ce qu'il faut garder. Discipline, risque et process seulement, jamais de sens du marché. Clé API Claude chiffrée sur le PC (`safeStorage`, canaux `ai:*`) ; dernière analyse gardée. Version web : « Copier le rapport pour Claude ».
- **Prêt pour un payout ?** pour chaque compte financé actif, avec les règles de sa prop firm depuis le dernier payout : Apex PA (5 jours au profit minimum, consistance 50 %, solde minimum, 6 payouts max — règles renvoyées par Apex en priorité), Topstep XFA Standard (5 jours gagnants de 150 $+) ou Consistency (3 jours, 40 %), MFFU (5 jours de 150 $+, 500 $ sur le cycle, consistance Core 40 % / Builder 50 %). Affiche ce qu'il manque (jours, profit pour la consistance, solde).
- **Voir les trades concernés** sur les critères faibles (taille, risque, revenge, hors système) : liste, créneau NY et jour de la semaine qui reviennent le plus, tag le plus fréquent, bouton Tags.
- **Positions sans tags** : les 10 plus récentes avec un bouton « Taguer » (ouvre la fenêtre Tags du Journal).
- **Historique par critère** : score de chaque critère à la fin des 8 dernières semaines.
- **Backtests** : nouvel onglet qui note les sessions clôturées du Backtesteur avec les mêmes critères.
- **Alertes en direct** (On / Off) à chaque synchro TopstepX : revenge trade (position plus grosse < 15 min après une perte), taille > 1,5× l'habituelle, journée qui casse la consistance d'un compte financé.
### Corrigé / amélioré
- Consistance : règle propre à chaque compte (Apex 50 %, MFFU Core 40 %…) au lieu de 30 % pour tous.
- Tailles et risque par position ramenés à un compte 50K (un 150K n'est plus vu comme « 3× trop gros »).
- Revenge : les re-entrées à la même taille moins de 5 min après une perte comptent pour moitié.
- Journées « remplissage » : seuil relatif (10 % de la journée médiane, 25 $ minimum).

## [1.42.0] — 2026-11-12
### Ajouté
- **Apparence › 3 thèmes signature** (en plus de Classique et Noir), choisis avec des cartes d'aperçu :
  - **Matrix** : pluie de code animée (katakana, chiffres, ICT / NQ / ES / φ), vert phosphore, scanlines CRT, police Space Mono, titres en invite `> … █` qui clignote.
  - **Wall Street** : marine et or, rosaces guillochées façon billet de banque, titres en serif avec double filet, boutons or, **ticker « NEW YORK »** en bas qui fait défiler les news des 12 prochains jours du calendrier (pastille par impact).
  - **ICT épuré** : noir et blanc comme le logo, **spirale d'or** (rectangles φ) qui se dessine puis tourne lentement, **éclipse** à l'œil de la spirale avec couronne qui respire, niveaux de Fibonacci (0 → 1) en filigrane, angles nets, titres espacés, φ devant les titres.
- Animations en pause dans le Backtesteur et quand la fenêtre est cachée ; réduites si le système demande moins d'animations. Le bouton thème du menu bascule entre Classique et le dernier thème sombre choisi.

## [1.41.0] — 2026-11-12
### Corrigé
- **Profil › Skill IA** : tailles en équivalent mini (10 micros MNQ / MES = 1 NQ / ES) au lieu d'additionner micros et minis ; DLL propre à chaque compte (Topstep 1 000 / 3 000 $, MFFU…) au lieu de 1 000 $ pour tous ; comparaison « 20 derniers jours vs avant » sans le critère Payouts (non daté) et sans le parcours quand trop peu de comptes ; flèches masquées (≈) quand l'écart vient d'échantillons trop petits ; rapport pour Claude étendu à Apex, Topstep et MFFU.
### Amélioré
- Gestion du risque mesurée sur toutes les positions de toutes les prop firms (règle 500 $ par position) en plus de la règle des tranches du Journal et des journées sous la DLL.
- Survie des comptes financés : nombre de comptes cramés sur une seule grosse journée, conseil adapté (journée unique vs « à petit feu »).
- Tableau « Par prop firm » (score, statut, évals réussies, financés cramés, payouts, dépenses récupérées, P&L net) ; une ligne ouvre le détail de la prop firm.

## [1.40.0] — 2026-11-12
### Modifié
- **Backtesteur — interface TopstepX à l'identique** (couleurs relevées sur les captures de topstepx.com/trade) : accent orange `#df981c` (comme les tuiles aimant / favoris de TopstepX, remplace l'or de la 1.36.0), menus `#0c0e12`, survol `#22262f`, sélection de l'arborescence bleue `#142e61`.
- **Barre du haut** comme TopstepX : recherche du symbole, ⊕ Watchlist, unités 1s → 12M (D / W / M) + menu ⌄ de toutes les unités, type de graphique ⌄ (chandeliers / ligne), ƒx Indicateurs (news Forex Factory, fenêtre News, Jarvis, alertes, watchlist), disposition 1 / 2 charts, Préférences, alertes, Sessions, annuler / rétablir, panneau Order, Mise en page ⌄, Jarvis ⚡, raccourcis, plein écran, instantané 📷. Les libellés se replient en icônes quand la fenêtre est étroite.
- **Barre d'outils de dessin** : icônes refaites au style TopstepX (28 px, trait fin, poignées rondes) pour tous les outils ; sections Lignes, Canaux, Pitchforks, Fibonacci, Gann, Figures, Projection, Volume, Mesures, Pinceaux, Flèches, Formes, Texte et notes ; étoiles des favoris dorées comme TopstepX ; ordre du bas : favoris puis arborescence.
- **Barre du bas** : plages 1yr 3m 1m 5d 3d 1d + aller à une date, heure du chart `HH:MM:SS UTC-5` (UTC-4 en heure d'été), bouton ETH / RTH, %, log, auto, plein écran.
- **Logos des prop firms** dans le menu Comptes (Topstep, Apex, My Funded Futures), en vectoriel net à la taille des autres icônes (tirés de leurs sites).
### Ajouté
- Outils : Haut / bas plat, Canal disjoint, Pitchfork de Schiff, Pitchfork de Schiff modifié, Projection, Texte ancré (reste fixe à l'écran).
- **Aimant faible / fort** (menu › à côté de l'aimant) + « Accrocher aux indicateurs » (niveaux affichés : lignes horizontales, Jarvis, position, ordres, clôture de la veille).
- **Arborescence des objets** en fenêtre flottante déplaçable (style TopstepX) : ligne du symbole, ligne News Forex Factory, icône de chaque outil, verrou / œil / corbeille au survol ; clic droit : Renommer, Pas de synchro (visible seulement dans l'unité de temps du tracé), Synchro dans la mise en page, **Synchro globale** (le dessin apparaît dans toutes les mises en page du symbole), Verrouiller, Masquer, Supprimer, Paramètres….
- **Paramètres du chart** refaits comme la fenêtre Settings de TopstepX (Symbole, Ligne d'état, Échelles et lignes, Canevas + Replay) : couleur selon la clôture précédente, séance ETH / RTH, précision, titre (ticker / description), statut d'ouverture du marché, volume, modes d'échelle A et L, compte à rebours de clôture de la bougie, étiquette / ligne du symbole, clôture de la veille, plus haut / plus bas visibles, jour de la semaine et format 12 / 24 h, fond uni / dégradé, séparateurs de séance, style du réticule, filigrane, couleur des lignes d'échelle, boutons de navigation ; pied Modèle ⌄ / Appliquer à tous / Annuler / OK.
- **Instantané du graphique** (📷) : Télécharger l'image `Ctrl+Alt+S`, Copier l'image `Ctrl+Maj+S` (les 2 charts + dessins + légende).
- Boutons **A** (auto, = Alt+R) et **L** (logarithmique) en bas de l'échelle des prix ; compte à rebours sous l'étiquette du dernier prix ; boutons de navigation (zoom, défilement, recentrer).
- **Annuler / rétablir** les dessins (`Ctrl+Z` / `Ctrl+Y`).
- Bouton 🔗 de la barre d'outils : lier les 2 charts (curseur et défilement synchronisés).
### Corrigé
- La barre des favoris se déplace en la saisissant n'importe où (plus seulement par la petite poignée) ; la barre flottante d'un dessin ne s'affiche plus quand rien n'est sélectionné.

## [1.39.0] — 2026-11-12
### Modifié
- **Profil › Skill IA** : « Mon profil · toutes les prop firms » prend toutes les données de tous les comptes Apex, Topstep et MFFU (journées, trades détaillés de comptes.json, Journal TopstepX en priorité pour garder les tags, évaluations, comptes financés, payouts, achats). Filtres colorés Toutes / Apex / Topstep / MFFU.
- « Trades TopstepX détaillés » devient **« Trades détaillés »** : liste de tous les comptes possibles, avec recherche, par couleur de prop firm (Apex bleu, MFFU jaune, Topstep noir) ; un compte Apex est analysé sur ses journées (Apex ne donne pas le détail des trades).
- Trades Topstep de comptes.json reconstitués en positions (de plat à plat), trades MFFU repris tels quels.

## [1.36.0] — 2026-11-12
### Modifié
- **Backtesteur — thème TopstepX** : couleurs alignées sur le design system de TopstepX (tokens extraits de topstepx.com). Accent or `#ebbc4d` (au lieu de l'orange), gris neutres TopstepX à la place de la palette TradingView (menus, survols, bordures, champs), boutons principaux en or, Buy `#2d8337` / Sell `#bd3f3b`. Couleurs regroupées en variables `--tx-*` (`--tx-acc`, `--tx-buy`, `--tx-sell`, `--tx-profit`, `--tx-loss`…). Couleurs du graphique inchangées (préférences du chart).
### Corrigé
- Menus d'outils, clic droit et fenêtres du backtesteur (ajoutés à `<body>`) : la couleur d'accent ne s'y appliquait pas — variables `--tx-*` aussi déclarées sur `:root`.

## [1.34.0] — 2026-11-12
### Modifié
- **Profil › Skill IA** : l'analyse prend par défaut **tous les comptes Apex + Topstep** (pages Comptes / `comptes.json` : journées de chaque compte, évaluations, comptes financés, payouts, achats), complétés par le détail des trades TopstepX quand il existe (sans doublon). Filtre Apex + Topstep / Apex / Topstep ; l'ancienne vue reste dans « Trades TopstepX détaillés ».
- Windfall : règle des 30 % mesurée compte par compte sur les comptes financés (une évaluation se passe souvent en 1-2 jours).
### Ajouté
- Bloc « Ton parcours prop firm » : évaluations réussies, survie des comptes financés (cramés, jours tradés avant de cramer), payouts (par compte financé, part des dépenses récupérée).

## [1.33.0] — 2026-11-12
### Ajouté
- **Profil › Skill IA — Profil prop firm** : statut exact (Profil partenaire / En bonne voie / À consolider / Profil à risque) et score sur 100 face aux critères Apex, calculés sur les trades TopstepX, leurs tags et les fiches Notion liées. 10 critères en 4 blocs : système défini (règles exactes écrites, trades dans le système), constance (taille, jours tradés, gestion du risque avec la règle des tranches et la DLL), ce qu'Apex ne veut pas (windfall / chance avec le seuil de consistance 30 %, gambling / revenge / erratique, jours « remplissage »), partenariat (respect du plan, croissance régulière).
- Progression : score à la fin de chaque semaine (12 dernières), 20 derniers jours tradés vs avant (par critère), « Prochaines étapes » pour monter le score ; filtres compte et période (Tout / 90 j / 30 j).
- « Ta stratégie — règles exactes » (entrées, stops initiaux, take profits, trailing, sorties), enregistrée avec les données de l'app, et bouton « Copier le rapport pour Claude ».
- `tools/check.js` : tests de `profilCalc`.

## [1.30.0] — 2026-11-11
### Ajouté
- **App Android** (`android-app/`, Capacitor) : même `index.html`, APK construit par la CI (`.github/workflows/build-android.yml`) et publié dans la release `latest-android`.
- **Interface téléphone** (≤ 760 px) : barre d'onglets en bas (Calendrier, Journal, Review, Comptes, Plus), menu en tiroir, pages sur une colonne, calendrier en liste qui s'ouvre sur aujourd'hui, thème Noir par défaut.
- Manifeste web (`manifest.webmanifest`, icônes `pwa/`) : le site s'installe aussi sur l'écran d'accueil depuis Chrome.

## [1.29.0] — 2026-11-11
### Ajouté
- Backtesteur : dossier `data_csv` (un CSV par symbole et par unité de temps, NQ / ES / MNQ / MES) lu directement par l'app. Il est cherché dans `Bureau\Inner Circle Trader\data_csv`, puis dans le `data_csv` d'un dossier posé dans `Bureau\Inner Circle Trader` (ex. `economic-calendar-main\data_csv`). Il passe avant le dossier `data` ; les trous du m1 / 1s sont comblés par les bougies de la synchro TopstepX (celles du NQ / ES pour les micros).
- Backtesteur : unités de temps 1s, 5s, 15s, 30s, 3M, 6M et 12M dans la barre (clavier : `5S`, `30S`, `3M`, `6M`, `12M` puis Entrée). En secondes, le replay avance avec les bougies 1 s ; sans 1 s à cette date, avec le fichier de l'unité affichée (5s / 15s / 30s).
- Backtesteur : charts MNQZ26 et MESZ26 (leurs propres bougies), 2 charts MNQ + MES ; les dessins et les contrats sont partagés avec NQ / ES.
### Corrigé
- Journal : un compte verrouillé pour la journée (PDLL / DLL touchée) n'est plus affiché « cramé » : il reste « Actif ». Seul un compte que TopstepX déclare perdu (MLL) est cramé.
### Ajouté
- Journal : pastille « PDLL » (Personal Daily Loss Limit) entre « Marge avant MLL » et « DLL » ; elle passe en rouge avec « atteinte » quand la limite du jour a verrouillé le compte.
- Journal : liste des comptes — « Funded · en cours » en orange pour un funded actif (+ « PDLL atteinte » s'il est verrouillé), « challenge cramé » pour un challenge perdu.
### Modifié
- Backtesteur : chargement des bougies — à l'ouverture du Backtesteur, le m1 de la date puis, en arrière-plan, 5m → 12M ; les secondes, le 2m et le 3m ne sont lus qu'au clic sur l'unité de temps. Chaque CSV est lu une seule fois (en flux, sans bloquer l'app) puis gardé en mémoire : un fichier 1 s de 100 Mo se charge en 1 à 2 s au premier clic, puis instantanément.
- Backtesteur : 3M / 6M / 12M — la bougie en cours est construite avec les jours terminés (fichier D) puis le m1 du replay ; W / M / 3M / 6M / 12M absents du dossier sont recalculés depuis le D.
- Backtesteur : en lecture, seules les bougies nouvelles sont redessinées (chart 1 s fluide avec plus de 100 000 bougies).
- `marketdata.test.js` : tests du dossier `data_csv` (trous comblés, micros, unités recalculées).

## [1.28.0] — 2026-11-11
### Ajouté
- **Comptes** (nouveau menu) : pages Topstep et Apex (KPIs, courbe de capital par compte, jours de trading, tous les comptes), **Payouts** (ID/compte, n°, demandé le, montant, jours de trading, finalisé le, statut Active/Blown, preuve) et **Reçus** (achats, totaux par mois, abonnements). Données lues dans `Bureau/Inner Circle Trader/comptes/comptes.json` (IPC `comptes:read`) ou importées à la main.
- **Review → Analyses** : loi 80/20 (les valeurs qui font 80 % des gains / pertes par heure, PD Array, prise de liquidité, actif, sens), filtres Par jour / Par mois / Par année, KPIs pire drawdown, pire série de SL, % BE / TP / SL.

## [1.27.3] — 2026-11-11
### Modifié
- Thème Noir : menu plus petit et caché ; il apparaît quand la souris touche le bord gauche de l'écran et se cache dès qu'on en sort (ou après un clic). Les pages occupent toute la largeur.

## [1.27.2] — 2026-11-11
### Modifié
- App Mac : icône noire en verre (courbe blanche dans une plaque de verre), assortie au thème Noir.

## [1.27.1] — 2026-11-11
### Modifié
- Thème Noir : le menu devient une capsule de verre flottante, avec seulement les icônes (nom de la page au survol) et la page active dans un rond blanc.

## [1.27.0] — 2026-11-11
### Ajouté
- Thème « Noir » : fond noir fumé, panneaux en verre, menu et boutons en pilules (l'élément actif en blanc), grands titres, calendrier sombre. Par défaut sur la version Mac ; bouton ◐ en bas du menu ou Profil › Apparence pour passer de Noir à Classique.
- Profil › Apparence : image de fond personnelle pour le thème Noir (assombrie pour garder le texte lisible, enregistrée sur cet ordinateur).

## [1.26.0] — 2026-11-11
### Ajouté
- Hexagone de performance : l'axe « Risque » est calculé sur tous les trades, en % du vrai capital (MLL 2 000 $). Risque d'une position = tag « Risque », sinon |P&L net / RR fait| de la fiche Notion liée, sinon perte réalisée (trades perdants). L'infobulle donne le risque moyen en $ et le respect de la règle des tranches (500 $, 250 $ sous 1 500 $ de DD restant).
### Corrigé
- Review : la fenêtre « Open Range 2 » commence à 9h30 (au lieu de 10h00) pour lier les trades TopstepX pris dès l'ouverture.

## [1.25.0] — 2026-11-11
### Modifié
- Backtesteur : doublons retirés — plus de Buy / Sell / quantité ni de solde dans la barre de replay (panneau Order et BAL suffisent), plus de barre d'icônes à droite (Order, Watchlist, Alertes, Jarvis, News, Sessions, Préférences reviennent en boutons dans la barre du haut).
- Backtesteur : panneau Order sans champs SL / TP en ticks — le bracket pose le SL / TP à 40 / 80 ticks, ils se règlent en glissant leurs lignes sur le chart.
- Backtesteur : barre de dessin façon FX Replay — une vraie icône par groupe (plus de crayons), règle, zoom (cadre à glisser), mode « rester en dessin », bouton pour replier la barre.
### Ajouté
- Backtesteur : SL / TP déplaçables à la souris (zone de prise plus large) ; sans bracket, glisser la ligne de la position crée le SL (côté perte) ou le TP (côté gain).
- Guide « Comment dessiner » : zoom, rester en dessin, SL / TP à glisser.

## [1.24.0] — 2026-11-10
### Modifié
- Backtesteur : mise en page façon FX Replay. On garde la barre de compte (BAL / MLL / RP&L / UP&L / DLL) et le panneau Order de TopstepX ; le reste est réorganisé :
  - barre du haut : symbole + timeframes en pastilles (1m … 1D 1W 1M), mises en page, NQ+ES ;
  - sous le chart : plages 1D / 5D / 1M / 3M / 6M / 1Y / Tout, message, heure du replay, % / log / auto ;
  - nouvelle barre de replay en bas : Buy / Sell au marché + nombre de contrats (synchronisé avec le panneau Order), retour au départ, curseur de progression dans les séances chargées, bougie précédente / lecture / vitesse / bougie suivante, « Aller à une date » (date + heure + Charger), bouton Positions et solde ;
  - barre d'icônes à droite : Order, Objets, Watchlist, Alertes, News, Jarvis, Sessions, Guide, Préférences ;
  - tableau Positions / Orders / Trades replié par défaut (bouton Positions).

## [1.23.0] — 2026-11-10
### Modifié
- Backtesteur : nouveau cœur du replay façon FX Replay (`btCore`) — horloge du marché mesurée sur le temps réel, bus d'événements (bougie jouée → ordres, règles du compte, alertes → affichage).
- Backtesteur : buffer continu — la séance suivante est chargée 2 h avant la fin de la séance en cours, le replay enchaîne les jours (week-ends et jours fériés sautés) au lieu de s'arrêter à 17:00 ; message « Fin des données » quand il n'y a plus rien.
- Backtesteur : exécution des ordres plus réaliste — gap à l'ouverture (limite au meilleur prix, stop au pire), anti-lookahead (un ordre / SL / TP ne s'exécute jamais sur la bougie où il a été posé), SL avant TP dans la même bougie.
### Ajouté
- Backtesteur : guide « Comment dessiner » (bouton ? de la barre d'outils) avec les raccourcis réellement configurés.
- `tools/check.js` : tests du cœur du replay (déclenchement des ordres, gaps, anti-lookahead, horloge, buffer).

## [1.22.3] — 2026-11-10
### Modifié
- App Mac : icône style Liquid Glass (bulle de verre avec une courbe, dégradé vert / bleu / violet).

## [1.22.2] — 2026-11-10
### Modifié
- App Mac : icône plein cadre plus épurée (courbe verte sur fond bleu).

## [1.22.1] — 2026-11-10
### Modifié
- App Mac : nouvelle icône (fenêtre façon macOS avec une courbe de prix sur fond bleu).

## [1.22.0] — 2026-11-10
### Ajouté
- Calendrier : bouton « 📈 Earnings tracker » : résultats d'entreprises des 30 prochains jours, avec pour chaque société sa capitalisation et l'évolution de son cours sur 3 mois (widgets TradingView en direct, à l'ouverture de la ligne) et son impact : NQ + ES, NQ seul, ES seul ou faible (hors des deux indices).

## [1.21.0] — 2026-11-10
### Ajouté
- Backtesteur : bouton « 🤖 Jarvis » (Alt+Maj+J) : protocole de Rudy sur les bougies déjà rejouées (high / low Asia, London, Premarket, Midnight / 8h30 / 9h30 open, NDOG, NWOG le lundi, 1st P.FVG 7h et 9h30) dessiné sur le chart + rapport (niveaux pris / intacts, écart au prix, prochaines cibles, macro en cours). « Effacer les dessins Jarvis » ne retire que ses propres dessins.
- Backtesteur : Watchlist NQ / ES (Alt+W), alertes de prix (Alt+Maj+A : le replay se met en pause et sonne quand le prix touche), saisie directe du symbole (NQ, ES, MNQ, MES puis Entrée), curseur synchronisé entre NQ et ES.

## [1.20.0] — 2026-11-10
### Ajouté
- Calendrier : notes @InnerDiscipline de chaque jour (Pre-Market, AM Silver Bullet, Low probability…) affichées dans la case du jour quand il n'y a pas de note perso ; « Low probability » posé automatiquement si la note le dit.
- Calendrier : section « 📊 Stats — ce à quoi s'attendre chaque jour » sous le calendrier, avec le nouveau tableau « Quel jour tombe chaque news » (CPI, PPI, NFP, FOMC, Minutes, news rouges, fériés), par type de journée et par jour de la semaine.
- Données : `data/innerdiscipline.txt` (copie de la page Notion « Données stats InnerDiscipline (auto) »), relue au démarrage depuis GitHub ; mise à jour chaque dimanche par une tâche planifiée.

## [1.19.0] — 2026-11-10
### Ajouté
- Backtesteur (app desktop) : la bougie M1 se forme seconde par seconde avec les données 1 s du jour du replay (Préférences › Replay pour le désactiver) ; horloge à la seconde ; vitesses « Temps réel » et ¼× en plus.
- Backtesteur : toutes les unités de temps sont pré-chargées en arrière-plan après « Charger » ; changer d'UT ne relit plus les fichiers.
### Modifié
- → / L et ← / J avancent / reculent d'une bougie de l'unité de temps affichée.
- Lecture pilotée par l'horloge du marché (1× = 1 minute par seconde, les nuits et week-ends sont sautés).
- Replay environ 200 fois plus rapide à calculer (heures de New York mises en cache, agrégation incrémentale).

## [1.18.0] — 2026-11-10
### Ajouté
- Backtesteur : mode ETH / RTH (Alt+Maj+E : séance 9:30 - 16:00 NY, H1 / H4 alignées sur 9:30), graphique en ligne (Alt+Maj+L), échelle inversée (Alt+I), verrou de l'échelle des prix (clic droit sur l'axe), recherche d'outil (/), 2e chart NQ + ES par Alt+clic ou +, Tab / Maj+Tab entre les charts, Alt+Entrée pour agrandir le chart actif, premier plan / arrière-plan (Ctrl+Maj+↑ / ↓), curseurs Ctrl+Alt+C / A / D / E, fenêtre News (Alt+D).
- Échap : désélectionne, sinon annule le dernier ordre en attente.
- Préférences : « Enregistrer comme modèle par défaut » (le bouton « Par défaut » remet ensuite ces réglages).
### Modifié
- Afficher / masquer les news : Alt+Maj+N (Alt+Maj+E sert désormais à ETH / RTH).

## [1.17.0] — 2026-11-10
### Ajouté
- Backtesteur : bouton « ⌨ » (Raccourcis) pour personnaliser chaque raccourci clavier, avec les raccourcis FXReplay / TradingView par défaut (recentrer Alt+R, ordres Maj+B / Maj+S / Alt+B / Alt+S, Flatten Ctrl+Maj+C, rectangle Alt+E, vitesse ↑ / ↓, L / J, Go To Ctrl+G, plein écran, captures Ctrl+Alt+S / Alt+Maj+S…). Timeframe au clavier : 1, 5, 15, 60, 240, D, W ou M puis Entrée.
- Backtesteur : clic sur le rond bleu du menu Order = menu masqué ; « ● Order » passe à droite du bandeau du chart pour le réafficher (mémorisé).
- App Mac : build automatique (release `latest-mac`), journal « Journal de Woods » branché sur le Notion de Woods, icône propre.
- Journal de trading : bouton « ⟳ Synchroniser Notion » dans l'onglet du journal.
### Modifié
- Calendrier : les filtres High / Medium / Low / Earnings sont mémorisés à la fermeture ; les notes, le plan et le statut d'un jour (et le texte d'une semaine) sont enregistrés pendant la saisie (Annuler restaure l'état d'ouverture).
- Backtesteur : vitesse du replay ×1 par défaut ; clic sur une news = recentrage automatique (Alt+R) ; arborescence des objets uniquement dans le bandeau vertical.

## [1.16.0] — 2026-11-09
### Ajouté
- Calendrier : bascule « Par mois / Par semaine ». La vue semaine affiche une ligne par jour (Day · News (ET) · My plan), le bandeau « This week » et les flèches passent de semaine en semaine.
- Statut du jour : « Key day » (badge vert) et « Low probability » (badge rouge), plus un champ « Mon plan » (détail affiché dans la vue semaine).
### Modifié
- Bank holiday : même style que Closed (fond hachuré) avec le badge en gris au lieu du rouge.

## [1.14.3] — 2026-11-07
### Corrigé
- Synchro Notion : une ligne supprimée dans Notion (ex. un trade) disparaît de l'app en 30 s au plus (comparaison de la liste des lignes toutes les 30 s ; avant, une suppression n'était jamais détectée).
### Ajouté
- Tests de la détection des changements Notion (`desktop/notion.test.js`).

## [1.14.2] — 2026-11-07
### Modifié
- Review › Renommer une image : suggestions NQ / ES (H4, H1, m15, m1, NWOG & 1st m15 / m1, RTH ORG m15 / m1, STDV m1), Exécution théorique et Vraie Exécution ; H4 / H1 / m15 / m5 / m1 seuls retirés.

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
