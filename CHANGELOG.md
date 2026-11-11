# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [sémantiques](https://semver.org/lang/fr/).

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
