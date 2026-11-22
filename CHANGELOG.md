# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [sémantiques](https://semver.org/lang/fr/).

## [1.85.0] — 2026-11-22
Page Graphique : **compte démo** (paper trading) façon TradingView — trader depuis le graphique sans argent réel.
### Ajouté
- Panneau de droite **Trading** (icône $) : bloc **Vendre / Acheter** avec Bid, Ask et écart ; onglets **Marché / Limite / Stop** ; prix saisi en prix ou en ticks (⇄, « Ask + 10 ») ; **Quantité** en contrats ou au **Risque $** (contrats calculés avec le stop loss) ; valeur du contrat, solde disponible, valeur du tick ; **Sorties** take profit / stop loss avec interrupteurs, en prix ou en ticks, **Risk / Reward**, **+ Ajouter un niveau** (plusieurs TP / SL avec leur quantité) ; **Réglages avancés** : durée de validité Jour (17:00 NY) / Semaine (vendredi 17:00 NY) / Jusqu'à annulation ; gros bouton « Acheter 1 NQZ26 @ prix LIMITE ».
- Compte démo : solde, P&L latent et réalisé, positions (Fermer), ordres en cours (modifier, annuler), **Tout fermer**, historique des trades ; menu ⚙ : boutons sur le graphique, confirmation, écart Bid / Ask (ticks), frais par contrat, **Réinitialiser le compte** (solde de départ au choix, 100 000 $ par défaut).
- Boutons **VENDRE / ACHETER** sur le graphique actif avec la quantité au milieu (un clic = ordre au marché), comme TradingView.
- Lignes de la position et des ordres (TP vert, SL rouge) sur le graphique ; **glisser une ligne** modifie le prix de l'ordre.
- Dessins **Position longue / courte** : menu du dessin › **Envoyer en ordre (compte démo)**.
- Moteur `grPaper` (pur, testé par `tools/check.js`) : exécution au Ask / Bid, limites et stops déclenchés par le prix en direct, sorties activées à l'exécution, TP / SL en OCO, position nette (moyenne, retournement), frais. Marche sur le site web et dans l'app ; aucun vrai ordre n'est envoyé. Données : localStorage `gr-paper` (compte) et `gr-trade` (ticket).

## [1.84.0] — 2026-11-22
Moteur Pine : plusieurs positions à la fois.
### Ajouté
- Stratégies Pine : `pyramiding` pris en compte — plusieurs entrées ouvertes en même temps (une par identifiant), chacune avec ses propres sorties `strategy.exit(from_entry=…)` (TP / SL calculés depuis son prix d'entrée) et son propre trade dans les stats ; plusieurs ordres peuvent être remplis dans la même bougie. Une entrée en sens inverse clôture d'abord les positions ouvertes (position nette, comme sur un compte futures). `strategy.opentrades`, `strategy.opentrades.entry_id(k)`, `entry_price(k)`, `entry_bar_index(k)`, `entry_time(k)`, `size(k)`, `profit(k)` et `strategy.openprofit` gèrent chaque position ouverte. Scripts à une seule position : résultats inchangés.

## [1.83.0] — 2026-11-22
Page Graphique : les stratégies Pine gardent le calcul m1 sur toutes les unités de temps.
### Ajouté
- Une stratégie Pine (`strategy()`) affichée en 2 min … 4 h est calculée sur les bougies **m1** du même contrat (mêmes trades, win rate, P&L qu'en 1 minute ; avant, en 15 min, TP et SL dans la même bougie faussaient tout), puis reportée sur les bougies du graphique : flèches d'entrée / sortie, lignes, labels, fonds, plots (dernière valeur de chaque bougie) et tableau. Les indicateurs (`indicator()`) restent calculés sur l'unité affichée. Désactivable : localStorage `gr-pine-m1` = `"0"`.

## [1.82.0] — 2026-11-22
Backtesteur : backtest automatique d'un script Pine `strategy()`.
### Ajouté
- Pages **Stratégies** et fiche d'une stratégie : bouton **🧪 Backtest auto Pine**. Choisis un script Pine de stratégie, l'actif (NQ / MNQ / ES / MES), la période et la fiche de stratégie : le script est rejoué bougie par bougie sur les bougies m1 des CSV (data_csv / data) dans le Web Worker Pine, avec les mêmes règles que la page Graphique. Résultats affichés (trades, win rate, P&L net, profit factor, drawdown, solde final), puis **Enregistrer dans le Journal backtest** : les trades (sens, quantité, entrée / sortie, frais, risque initial R, MAE / MFE, raison TP / SL) apparaissent dans Testing (Tableau de bord, Trades, Analytique) et dans la fiche de la stratégie. Réglages gardés (localStorage `bt-pineauto`).
- Bougies lues : toujours celles de NQ / ES (historique complet, mêmes prix que MNQ / MES), P&L à la valeur du contrat choisi (avant : le fichier MNQ, qui a des trous, était lu pour MNQ).
- Bougies isolées hors séance CME (quelques ticks le samedi / dimanche dans les données TopstepX) ignorées par ce backtest.
### Modifié
- Moteur Pine : chaque trade de stratégie garde sa quantité, ses frais, sa raison de sortie et son risque initial.

## [1.81.0] — 2026-11-22
Page Graphique : 1 an d'historique pour backtester les stratégies Pine.
### Ajouté
- Menu des unités de temps : **Historique chargé : 5 000 bougies / 1 an**. Sur « 1 an », les graphiques de 1 à 59 minutes chargent environ 400 jours depuis les CSV (`data_csv` / `data`) au lieu de 5 000 bougies (≈ 3,5 jours en 1 min) : une stratégie Pine voit toute l'année. Réglage gardé (localStorage `gr-hist-1y`).
### Corrigé
- Pine : une **stratégie** (`strategy()`) calcule maintenant sur tout l'historique chargé, plus seulement sur les 5 000 dernières bougies (un indicateur garde cette limite) ; délai de calcul porté à 120 s.
- Pine, moteur de stratégie : TP / SL de `strategy.exit(profit=, loss=)` calculés depuis le **prix d'entrée réel** (avant : depuis la clôture de la bougie précédente, d'où des pertes énormes) ; ordre limite / stop déjà dépassé à l'ouverture = rempli à l'ouverture ; sur la bougie d'entrée, pas de sortie au prix d'ouverture et, après une entrée en cours de bougie, SL d'abord puis TP seulement si la clôture est repassée du bon côté.
- Pine, moteur de stratégie : `default_qty_value`, `commission_type` / `commission_value` (frais aller-retour), `slippage` (sur le SL), `strategy.grossprofit`, `strategy.grossloss` et `strategy.max_drawdown` pris en compte (avant : toujours 0).
- Pine : `bgcolor` dessine un seul rectangle par plage de bougies de même couleur (plus de rayures au dézoom ; plages calculées une fois puis seules les plages visibles sont dessinées : déplacement du graphique fluide).
- Page Graphique, historique « 1 an » : plus de chargement automatique de bougies plus anciennes au bord gauche (chaque ajout redessinait ~600 000 bougies et relançait les stratégies, d'où le lag en allant vers la gauche).
- Page Graphique : les flèches d'entrée / sortie des stratégies Pine s'affichent aussi quand le calcul se termine en arrière-plan.

## [1.80.0] — 2026-11-21
Page Graphique : dessins et logos comme TradingView.
### Ajouté
- Menu du dessin (clic droit / ⋯) identique à TradingView : Ajouter une alerte pour … (Alt + A), **Espace de Travail** (Sauvegarder Sous…, Appliquer paramètres par Défaut, tes modèles), **Ordre de visualisation** (premier plan, fond, en avant, vers l'arrière), **Visibilité des intervalles** (actuel et supérieur, actuel et inférieur, actuel uniquement, tous), Créer un groupe de dessins, Cloner, Copier, Renommer, Verrouiller, Cacher, Retirer, **Aller à …**, Configurations….
- Barre flottante du dessin sélectionné au style TradingView : poignée, modèles, couleur de ligne (crayon), de fond (pot de peinture) et du texte (T) avec la couleur soulignée, épaisseur et style de ligne en menus visuels, configurations, alerte, verrou, retirer, plus.
- Logos des contrats comme TradingView : NQ / MNQ (Nasdaq 100) et ES / MES (S&P 500) dans la légende, la liste de surveillance et la recherche de symboles.
### Modifié
- Barre d'outils de gauche : la barre des favoris a une icône en étoile ; le bouton Arborescence (déjà dans le panneau de droite) est retiré.

## [1.79.0] — 2026-11-21
Page Graphique : dispositions et barre d'outils comme TradingView.
### Ajouté
- **Toutes les dispositions de TradingView, jusqu'à 16 graphiques** (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16), classées par nombre de graphiques avec les mêmes icônes, et la section « Synchroniser dans la mise en page » (Symbole, Intervalle, Mire, Heure, Plage de dates) avec interrupteurs et bulles d'info. Les anciennes dispositions enregistrées restent valables.
### Modifié
- Icônes de la barre d'outils de gauche redessinées à l'identique de TradingView (réticule, ligne de tendance, canal, Fibonacci, figures, rectangle, texte, règle, zoom, aimant, rester en mode dessin, verrou, œil, corbeille, barre des favoris, arborescence) ; les icônes des positions longue / courte sont gardées.

## [1.78.0] — 2026-11-21
Page Graphique : **Éditeur Pine refait comme celui de TradingView**.
### Ajouté
- Barre de titre « Editeur Pine » (agrandir / restaurer, fermer) et barre d'outils : replier, nom du script avec son menu, **Ajouter au Graphique** (devient « Mettre à jour sur le graphique » si le script y est déjà), **Sauvegarder** (bleu tant qu'il reste des modifications), **Publier le script** (copie le code pour le publier sur TradingView), menu **⋯** avec pastille rouge quand la console a un nouveau message.
- Menu du script : Sauvegarder (Ctrl + S), Créer une copie, Renommer, **Historique des versions** (30 dernières sauvegardes, aperçu et restauration), Déplacer le script vers le bas / vers la droite, Créer un nouveau (indicateur, stratégie, TypeScript), **Récemment utilisé**, Ouvrir le script (Ctrl + O, avec recherche).
- Éditeur : coloration syntaxique (types, mots-clés, fonctions, chaînes, nombres, true / false, commentaires, pastilles de couleur), numéros de ligne, ligne courante surlignée, **mini-carte** cliquable, barre d'état « Droite N, Col M · Pine Script® v6 », **console Pine** (compilation, erreurs, avertissements), ligne en erreur marquée en rouge.
- Clavier : Ctrl + / (commenter), Tab / Maj + Tab, Ctrl + D (dupliquer la ligne), Alt + ↑ / ↓ (déplacer la ligne), Ctrl + Entrée (ajouter au graphique), indentation automatique après if / for / => ; annuler / rétablir conservés.
- Menu ⋯ : taille du texte, mini-carte, importer / exporter un fichier .pine, raccourcis clavier, aide, supprimer le script.

## [1.77.0] — 2026-11-21
Indicateurs Pine : plus de saccades, et un indicateur masqué garde sa place.
### Modifié
- Les scripts Pine (moteur v5 / v6) sont calculés dans un **Web Worker** (`PineAsync`) : le graphique ne fige plus pendant le calcul, le dernier résultat reste affiché en attendant, et les mises à jour en direct sont fusionnées (un seul calcul à la fois par indicateur, toujours sur les dernières bougies).
- La liste des scripts n'est plus relue et re-parsée depuis le stockage à chaque dessin du graphique ou bougie du replay (≈ 330 Ko avec les scripts TradingView) : gardée en mémoire tant qu'elle ne change pas.
### Corrigé
- Page Graphique : masquer un indicateur Pine `overlay=true` (œil) l'envoyait dans un panneau séparé sous le graphique ; il reste maintenant sur le graphique, juste caché (l'option overlay est lue dans le script sans attendre le calcul).

## [1.76.0] — 2026-11-21
Indicateurs : **nouveau moteur Pine Script v5 / v6** (Backtesteur et page Graphique).
### Ajouté
- Vrai parseur Pine (lignes logiques, indentation, continuations, plusieurs instructions par ligne) traduit en JavaScript : `type` (UDT) et `method`, `enum`, `switch`, `if` / `switch` / `for` en expression, `for … in`, tuples, fonctions à paramètres typés et valeurs par défaut, arguments nommés, génériques (`array.new<float>()`), surcharges.
- Exécution fidèle à Pine : historique `x[n]` de toute variable (y compris dans les fonctions, par site d'appel), `var` / `varip`, état des `ta.*` propre à chaque appel de fonction, `request.security` sur le même symbole en unité supérieure (bougies reconstruites, lookahead on / off), `time()` / `time_close()` avec séances et fuseaux, `timestamp()`, `timeframe.change()`, `str.*`, `array.*`, `map.*`, couleurs.
- **Objets de dessin** rendus sur le graphique : `box`, `line`, `label`, `table`, `linefill`, `polyline`, `chart.point`, ainsi que `fill()` et `bgcolor()` (limites `max_*_count` comme TradingView).
- Stratégies : simulation simplifiée (ordres à l'ouverture de la bougie suivante, sorties stop / limite dans la bougie), flèches d'entrée / sortie et bilan dans la console de l'éditeur.
- Le script tourne sur les 5 000 dernières bougies au plus ; la console de l'éditeur indique le moteur, les dessins et le bilan de stratégie.
- `tools/check.js` teste le moteur (historique, var, fonctions, UDT / méthodes, tableaux, dessins, request.security).
### Limites
- `request.security` vers un autre symbole (FX, données économiques), bibliothèques `import`, `request.financial / economic` : non disponibles (valeur na, avertissement dans la console).
- Les scripts v4 et plus anciens restent sur l'ancien moteur.

## [1.75.0] — 2026-11-21
Indicateurs : import de **Mes scripts TradingView**.
### Ajouté
- Éditeur d'indicateurs (Backtesteur) : bouton **TV** pour importer l'export `tradingview-mes-scripts.json` (Pine Editor › Mes scripts : nom, code Pine, version, type indicateur / stratégie). Les scripts arrivent dans « Mes scripts » (Backtesteur et page Graphique), masqués par défaut, avec un badge **TV**.
- App Windows : le fichier posé dans `Bureau\Inner Circle Trader\` est importé tout seul au lancement s'il est plus récent que le dernier import. Un nouvel import met à jour le code sans toucher à l'affichage ni aux réglages.
- Les scripts restent sur le PC (localStorage), jamais dans le dépôt. Le moteur Pine de l'app est un sous-ensemble de v5 : les scripts v6 ou qui utilisent label / box / request.security peuvent ne pas s'afficher sur le chart, mais leur code est consultable et modifiable.

## [1.74.0] — 2026-11-21
Backtesteur et page Graphique.
### Ajouté
- **Rectangle** : 8 poignées comme TopstepX (4 coins ronds, 4 milieux carrés) pour l'étirer par un coin ou par un côté.
- **Molette sur l'échelle de prix** : étire / rétrécit les prix autour du curseur ; **molette sur l'échelle de temps** : étire / rétrécit le temps.
### Modifié
- Échelle de prix étirée (molette) ou glissée à la souris : le bouton **auto** s'éteint (noir) puisque l'échelle n'est plus automatique ; clic sur auto ou double-clic sur l'échelle = retour en automatique (bleu).

## [1.73.0] — 2026-11-21
Page Graphique : fenêtre **Réglages** refaite façon TradingView, avec les options qui manquaient et des modèles de graphique.
### Ajouté
- Menu à gauche : Symbole, Ligne d'état, Échelles et lignes, Toile, Trading, Alertes, Événements ; même mise en forme que TradingView (sections, cases, pastilles de couleur avec code hex, boutons Annuler / D'accord).
- **Symbole** : coloriser les barres selon la clôture précédente, cases Corps / Bordures / Mèche (haussier + baissier), séance (électronique / régulière), fond des heures de trading électronique.
- **Ligne d'état** : logo, Titre = Nom / Symbole / Symbole & nom, valeurs du changement du dernier jour, arrière-plan avec opacité.
- **Échelles et lignes** : modes d'échelle (%, log, auto) toujours visibles / au survol / masqués, placement des échelles, Symbole / Clôture du jour précédent / Haut et bas en Masqué / Valeur et ligne / Valeur / Ligne avec leur couleur, jour de la semaine sur les étiquettes, format de la date, heure 24 h / 12 h.
- **Toile** : couleur de chaque grille, couleur du filigrane, couleur des lignes d'échelle, boutons de navigation sur le graphique (zoom, défilement, retour au direct) toujours / au survol / masqués, marges en saisie libre.
- **Trading** : marques et étiquettes d'exécution de tes trades TopstepX, valeur des profits et pertes en argent / ticks / points (la page Graphique ne passe pas d'ordres).
- **Alertes** : lignes d'alerte (couleur), uniquement les alertes actives, masquer automatiquement les toasts (sinon ils restent jusqu'au clic).
- **Modèles de graphique** (bouton Modèle en bas à gauche) : enregistrer sous, appliquer, supprimer (poubelle), modèle par défaut, réinitialiser.
### Corrigé
- Entrée / Échap n'agissent plus que sur la fenêtre du dessus (une petite fenêtre de saisie ne ferme plus celle d'en dessous).

## [1.72.1] — 2026-11-21
### Corrigé
- Page Graphique : les boutons d'un indicateur dans la légende (œil, paramètres, ×, ⋯) ne disparaissent plus pendant le survol quand la légende se met à jour (bougie en direct), et restent 1,2 s après la sortie du curseur.

## [1.72.0] — 2026-11-21
### Ajouté
- Page Graphique : **Alt + clic gauche** dans un graphique l'agrandit seul (comme une disposition à 1 graphique) ; Alt + clic à nouveau remet la disposition d'avant. Alt + clic sur un dessin le duplique toujours. Alt + Entrée fait la même chose sur le graphique actif.

## [1.71.1] — 2026-11-21
### Modifié
- Menu des mises en page : un clic sur une mise en page l'ouvre directement ; icône poubelle au bout de la ligne pour la supprimer (2e clic pour confirmer). Même poubelle sur les modèles de dessins du menu Modèle.

## [1.71.0] — 2026-11-21
Page Graphique : arborescence des objets façon TopstepX, modèles et mises en page réordonnables, éditeur Pine à droite, trait des news.
### Ajouté
- **Arborescence des objets** : groupes (créer, renommer, replier, masquer, verrouiller, supprimer avec leurs dessins), glisser-déposer pour changer l'ordre d'affichage ou ranger dans un groupe, renommer un dessin (double-clic), sélection multiple (Ctrl / Maj) pour masquer, verrouiller, supprimer ou grouper, recherche, tout masquer / verrouiller, paramètres par ligne.
- **Modèles de dessins** : triés par numéro (1, 2 … 10, 11), et « Gérer et réordonner les modèles… » (glisser, renommer, supprimer, appliquer).
- **Mises en page** : « Gérer et réordonner les mises en page… » (glisser, renommer, supprimer, ouvrir) ; le menu suit cet ordre.
- **Fibonacci** : niveaux masqués des modèles TopstepX remis (à cocher), case Ligne de tendance, étiquettes Coefficients / Prix / Texte des niveaux / En %, position et taille, style des lignes, texte et couleur hex de chaque niveau.
- **Actualités · calendrier USD** : case « Trait sur le graphique à l'heure des news » (aussi dans Paramètres › Événements).
### Modifié
- **Éditeur Pine** à droite du graphique ; tirer son bord gauche pour l'agrandir, double-clic sur le bord = grand / normal (largeur gardée).
- Le bouton Disposition montre l'icône de la disposition en cours.

## [1.70.0] — 2026-11-20
Page Graphique : modèles de dessins et mises en page de TopstepX, avec les mêmes noms.
### Ajouté
- **102 modèles de dessins TopstepX** (rectangle, ligne de tendance, rayon horizontal, Fibonacci, positions longue / courte, courbe, ligne horizontale, ligne verticale, canal parallèle, extension de Fibonacci), ajoutés une seule fois au lancement, sans remplacer un modèle du même nom.
- **9 mises en page TopstepX** : NQ1!, ES1!, NWOG & 1st Matrix, RTH ORG Matrix, STDV Matrix, Naked H4 to m15, Premarket, Naked, First Hour of Trading (grille, symboles, unités, sessions, synchronisations). Les dessins ne sont pas repris.
- Mises en page › « Réimporter mes mises en page et modèles TopstepX » pour remettre ceux qui ont été supprimés.
- Barre de dessins favoris dans l'ordre de TopstepX ; tes autres favoris restent après.
### Modifié
- Rendu des dessins au niveau des réglages TopstepX : texte placé au début / milieu / fin et au-dessus / sur / sous la ligne (tendance, rayons, lignes, rectangle), couleur / épaisseur / style de la ligne médiane du rectangle, libellés Fibonacci avec coefficient, prix et texte de chaque niveau (taille, position, en % au besoin), ligne de tendance du Fibonacci masquable, flèche au début d'une ligne.
- Un modèle garde aussi le texte du dessin, et les modèles de position posent le stop et l'objectif à leurs distances en ticks.

## [1.69.0] — 2026-11-20
Page Graphique : couleurs en hexadécimal, barre de dessins favoris réordonnable, modèles de dessins accessibles partout.
### Ajouté
- **Couleurs en hexadécimal** : chaque pastille de couleur (Paramètres du graphique › Symbole, Apparence…, paramètres des dessins et des indicateurs) a un champ hex à côté (`#RRGGBB`, ou `#RRGGBBAA` pour régler aussi l'opacité, `#RGB` accepté). Le champ suit la pastille et l'inverse ; une valeur invalide est encadrée en rouge et ignorée.
- **Barre de dessins favoris** : glisser un outil pour changer sa place (ordre enregistré) ; clic droit sur un outil = déplacer à gauche / à droite, au début / à la fin, retirer des favoris.
- **Modèles de dessins** : bouton **Modèle** dans la barre flottante du dessin sélectionné et **Modèle ▾** en bas de la fenêtre Paramètres du dessin (en plus du clic droit) : appliquer, enregistrer sous, remplacer, renommer, supprimer un modèle, style par défaut de l'outil.

## [1.68.0] — 2026-11-20
Backtesteur, phase 1b de la salle blanche, livraison B (`docs/salle-blanche-fxreplay/REA-fxreplay.md`, module NAV : NAV-06, NAV-07, STR-01, JRN-07, JRN-08, TDB-01, TDB-02). Tout s'ajoute : chart, sessions, trades et données `bt-*` existantes inchangés ; les nouvelles clés (`bt-tags`, `bt-tpls`, `bt-goal`) ne s'écrivent qu'après une action, les images des documents vont dans IndexedDB (`ict-backtest`).
### Ajouté
- **Fiche stratégie complète** : bouton **▶ Tester** (fenêtre Nouvelle session avec la stratégie choisie) et onglets **Règles** (règles par catégorie : contexte, entrée, sortie, gestion du risque, réordonnables ; vide : invitation à en définir, avec un exemple ICT ; paramètres de la stratégie), **Docs** (notes et images : fichiers ou capture collée, agrandissement, sans limite ; images en IndexedDB) et **Trades** (trades des sessions reliées et trades ajoutés à la main depuis n'importe quelle session, filtre par session, compteur, actualiser, checklist et note de chaque trade). Les trades ajoutés comptent dans les chiffres, la courbe, Testing › Trades et l'analytique par stratégie. Dupliquer une stratégie copie ses règles, paramètres et documents (images comprises).
- **Note du trade** (✎ dans Testing › Trades et dans l'onglet Trades d'une stratégie) : détails, tags (groupes colorés, tag nouveau rangé dans un groupe à la volée), checklist (règles de la stratégie et checklists des modèles, cases enregistrées dans le trade), note avec insertion d'un modèle ; le modèle par défaut est proposé quand la note est vide. Écrite là où le trade est enregistré (session, compte de base, instantané ou session clôturée).
- **Testing › Trades** : cases à cocher et « Appliquer un modèle » à plusieurs trades (note ajoutée à la fin de chaque note, ou checklist posée), tags colorés par groupe, colonne note et checklist.
- **Paramètres › Journal** : groupes de tags colorés, réordonnables, recherche ; créer, renommer, supprimer un groupe ; ajouter, colorer, déplacer, renommer, retirer un tag ; tags libres déjà posés listés et rangés dans un groupe ; groupes de départ (setups ICT, séances, erreurs, état d'esprit). Les tags des trades ne sont jamais modifiés.
- **Paramètres › Modèles** : modèles de note et checklists, avec recherche, filtre, favoris, modèles intégrés (review de trade ICT, plan de séance, bilan de session, Silver Bullet, checklist d'entrée ICT, contrôle prop firm) à dupliquer pour les modifier, date de dernière modification, un modèle par défaut pour le journal backtest. Champs remplis avec les valeurs du trade : {contrat}, {sens}, {date}, {session}, {strategie}, {resultat}.
- **Tableau de bord** : filtre d'activité (toute l'activité, backtest, challenge = sessions prop firm), **série de jours d'entraînement** (au moins 5 minutes sur le chart, jour de New York ; série en cours et record) avec vues jour / semaine / année et **objectif d'heures** par jour ou par semaine modifiable sans toucher à la série, **win rate dans le temps** (cumulé et par jour) et **trades par actif**.
### Modifié
- Paramètres a cinq onglets : Backtesting, Spreads & commissions, Journal, Sessions supprimées, Modèles.
- Fiche stratégie : les sessions reliées proposent aussi Dupliquer (tout copier ou seulement les réglages) et Supprimer (corbeille).
- Ticket du chart : les tags des groupes sont proposés dans la liste des tags.
- « Jours d'entraînement » du tableau de bord : un jour compte à partir de 5 minutes sur le chart (comme la série).

## [1.67.1] — 2026-11-20
Backtesteur : décisions de l'arbitre du 20/11/2026 après la 1.67.0 (`docs/salle-blanche-fxreplay/REA-fxreplay.md`, module NAV, tableau « Décisions de l'arbitre »).
### Ajouté
- **Heures à droite de la dernière bougie** : l'échelle de temps du chart du Backtesteur affiche aussi les heures dans la zone vide à droite de la dernière bougie, comme sur TopstepX (et l'heure sous le réticule quand la souris y passe). Ce sont les créneaux des bougies à venir, calculés d'après l'unité de temps et les heures de marché (séance CME 18:00 → 17:00 New York, week-end sauté, séance régulière en mode RTH), sans aucun prix ni donnée future ; recalculés quand le replay avance, quand l'unité de temps change et au retour arrière. Le chart suit le replay comme avant. Aussi sur le 2e chart (NQ + ES).
- **Paramètres › Raccourcis** : les raccourcis clavier du chart se règlent dans un onglet des Paramètres, dans la fenêtre du chart (enregistrés avec OK, oubliés avec Annuler) et dans la page Paramètres › Backtesting (enregistrés à chaque changement), avec le même éditeur qu'avant (ajouter, retirer, raccourcis par défaut). Touches gardées dans `bt-keys` comme avant.
- **Dupliquer une session** (Testing › Sessions) propose deux choix : **tout copier** (compte, trades, dessins, heure du replay, comme en 1.67.0) ou **seulement les réglages** (nouvelle session vierge : même type, solde, règles, actifs, stratégie, période et coûts, sans trade ni dessin).
### Modifié
- **Supprimer une session depuis la fenêtre Sessions du chart** l'envoie dans la corbeille (Backtesteur › Paramètres › Sessions supprimées), comme depuis Testing › Sessions ; elle se restaure avec son compte, ses trades, ses dessins et l'heure du replay.
- **MNQ et MES utilisent leurs propres bougies** quand leurs fichiers existent (`data_csv`, cherché aussi comme `data_csv` d'un sous-dossier du dossier Inner Circle Trader, ex. `economic-calendar-main\data_csv`) : les trous d'un micro ne sont plus comblés avec les bougies du NQ / ES. Sans fichier du micro dans une résolution, ce sont celles de son sous-jacent (data_csv puis synchro), avec la mention « bougies du NQ / ES » dans la fenêtre Nouvelle session.
- Le bouton engrenage « Raccourcis clavier » de la barre du chart est retiré (les raccourcis sont dans les Paramètres), à la demande de Rudy.
- « Tout » (plages sous le chart) montre toutes les bougies et la marge de droite, sans les créneaux à venir au-delà.
- Commissions par défaut inchangées : celles du compte de base (2,80 $ par contrat, 0,74 $ en micro) et 1 tick de spread.

## [1.67.0] — 2026-11-20
Backtesteur, phase 1b de la salle blanche, livraison A (`docs/salle-blanche-fxreplay/REA-fxreplay.md`, module NAV : NAV-01 → 05, SES-04 / 05 / 09 / 10 / 11, TDB-03, JRN-04, STR-02 ; TDB-01, JRN-01, STR-01, NAV-06 et NAV-07 en partie). Tout s'ajoute : le chart (Backtesteur de base, sessions isolées, fenêtres du chart, raccourcis) marche comme en 1.66.0 et les données `bt-*` existantes ne sont ni renommées ni migrées.
### Ajouté
- **Pages du Backtesteur** avec leur propre menu à gauche dans la page : **Testing**, **Stratégies**, **Paramètres**, et un raccourci **Chart** (session ouverte ou Backtesteur de base). Le chart s'ouvre en plein écran ; le bouton **Pages** (en haut à gauche du chart) met le replay en pause, enregistre la session et ramène à la dernière page vue. Adresses : `#backtest` (tableau de bord), `#backtest/sessions`, `/trades`, `/analytique`, `#backtest/strategies[/<id>]`, `#backtest/parametres/<onglet>`, `#backtest/chart`.
- **Testing › Tableau de bord** : trois départs (session de backtesting, session prop firm, Backtesteur de base), reprise de la dernière session, progression (temps réel passé sur le chart, temps de marché rejoué, trades achats / ventes, win rate, P&L ; semaine, mois ou tout) et sessions récentes avec reprise en un clic.
- **Testing › Sessions** : recherche, filtres (type, stratégie), tri, reprendre, renommer, dupliquer (compte, trades, dessins et heure du replay copiés), analytique de la session, supprimer vers la corbeille ; les anciens instantanés restent à part avec leurs actions (Ouvrir, Écraser, Renommer, Supprimer).
- **Testing › Trades** : tous les trades backtest en lecture (sessions isolées, Backtesteur de base, instantanés, sessions clôturées, sans doublon), sessions choisies, tri par colonne, filtres de base (sens, résultat, contrat, stratégie, dates, texte), résultat en $, en % du solde de départ et en R.
- **Testing › Analytique** : l'analytique du chart dans la page, filtrable par session et par stratégie (export CSV ; la fenêtre du chart reste disponible).
- **Fenêtre « Nouvelle session »** : onglets Backtesting et Prop firm, étapes Essentiel (nom, solde, règles et mode strict en prop firm, stratégie choisie ou créée sur place, actifs, modèle de chart, dates) puis Options (commissions et spreads par actif activables, slippage aucun / léger / moyen / fixe, description), **presets de session** en tête. Les actifs proposés sont ceux qui ont des bougies m1 dans `data_csv` et `data`, avec leurs bornes (les micros sans fichier reprennent les bougies du NQ / ES) ; version web : aucun actif, message clair.
- **Stratégies** : une carte par stratégie (win rate, trades, drawdown max, R:R moyen, mini-courbe, alerte sans règle), recherche, filtre, nouvelle stratégie ; fiche avec auteur, description, Renommer / Dupliquer / Supprimer et onglet Vue d'ensemble (P&L net, win rate, R:R moyen, gagnants / perdants, breakeven, courbe d'équité, sessions reliées). Les stratégies sont reliées aux sessions par leur nom, sans modifier les sessions ; les noms déjà tapés sont proposés comme stratégies.
- **Paramètres** : Backtesting (les réglages du chart dans la page, même clé `bt-prefs`), Spreads & commissions (une ligne par actif des CSV, spread en ticks, commission par contrat, slippage par défaut, repris à chaque nouvelle session), Sessions supprimées (restaurer ou supprimer définitivement, pagination).
- App Windows : canal `data:assets` (actifs et bornes lus dans les CSV : liste des fichiers puis début et fin de chacun, jamais le fichier entier).
### Modifié
- **Cliquer sur Backtesteur** dans le menu de l'app ouvre Testing › Tableau de bord au lieu du chart (le compte démo des pages Comptes, le Replay de la page Graphique et « Ouvrir une nouvelle fenêtre » ouvrent toujours le chart).
- Sessions créées depuis la nouvelle fenêtre : commission et spread propres à chaque actif (`A.cfg.fees` / `A.cfg.spreads`) ; sans eux (Backtesteur de base, sessions d'avant), frais et exécution au marché (dernier prix ± 1 tick) inchangés. Une session clôturée garde sa stratégie dans le Journal backtest.
- Raccourcis du chart sans effet quand les pages sont affichées.

## [1.66.2] — 2026-11-20
### Modifié
- **Favori de connexion TopstepX** renommé « Synchro App & TopstepX » (au lieu de « → ICT ») dans l'app et sur la page `tsx-chrome.html`, qui prend le logo ICT (icône d'onglet, titre et bouton à glisser).

## [1.66.1] — 2026-11-19
### Corrigé
- **Graphique + TopstepX en même temps** : TopstepX n'accepte qu'une session à la fois, donc se connecter dans l'app déconnectait l'onglet TopstepX du navigateur (et inversement). L'écran « Connexion TopstepX requise » propose maintenant d'abord le favori **→ ICT** : cliqué sur l'onglet topstepx.com (Chrome, Brave…), il donne la session du navigateur à l'app, qui recharge le graphique tout seul sans rien déconnecter. La connexion dans l'app reste possible (avec l'avertissement). Recevoir une session par le favori passe aussi la connexion du Profil en mode « Chrome ».

## [1.66.0] — 2026-11-19
Backtesteur, phase 1 de la salle blanche (`docs/salle-blanche-fxreplay/REA-fxreplay.md` : REP-04 → 07, SES-01 / 02 / 03 / 12, PRO-02). Tout s'ajoute : sans ces nouveautés, le Backtesteur se comporte comme en 1.65.1 (compte `bt-acc`, dessins, raccourcis et sessions enregistrées inchangés).
### Ajouté
- **Rejouer depuis une bougie** : clic droit sur une bougie déjà rejouée › « Rejouer depuis ici », ou bouton ⤺ dans la barre de replay puis clic sur la bougie (Échap annule). Un avertissement liste les trades et ordres qui seront annulés, puis compte, ordres, solde et règles redeviennent exactement ceux de ce moment (bougie affichée, avant tes actions sur elle). Impossible avant le début du replay ou de la session.
- **Journal du replay** : chaque changement du compte (ordre posé, déplacé, annulé, exécuté, SL / TP déplacés, breakeven, début de séance) est noté avec un instantané ; revenir à un moment restaure le dernier instantané puis rejoue les bougies, d'où le même état qu'un replay direct (testé dans `tools/check.js` avec le vrai code du compte).
- **Sessions isolées** (Sessions de backtest › « ＋ Nouvelle session… ») : assistant avec nom, type (backtest libre ou challenge prop firm, case « mode strict »), solde de départ (10K / 50K / 100K / 250K / libre ; en challenge 50K / 100K / 150K avec les règles du type Prop, modifiables), stratégie, actifs (NQ, ES, MNQ, MES), départ choisi ou tiré au hasard parmi les jours disponibles (bornes des données affichées), fin automatique ou date (+1 jour / +1 semaine / +1 mois), frais et slippage repris du type de compte. Chaque session a son compte, ses ordres, ses trades, ses notes, ses dessins et son heure de replay ; elle est enregistrée en continu (toutes les 5 s, à chaque ordre, à la fermeture de l'app ou en changeant de session) et rouverte telle quelle au lancement. Badge de la session dans la barre du compte (× = enregistrer et revenir au Backtesteur de base). À la date de fin, le replay s'arrête avec un message.
- **Challenge strict** : dans une session créée en mode strict, aucun bouton ni raccourci ne recule (bougie précédente, curseur, Recommencer, Rejouer depuis ici, date antérieure) ; lecture, vitesse et sauts vers l'avant restent permis.
- **Paramètres › Replay › Autoriser le retour arrière** (activé par défaut).
- **Panneau Règles** dans le dock (onglet « Règles », Alt+U, raccourci libre) : objectif, DLL, MLL trailing et consistance du type de compte Prop, avec limite, valeur actuelle, marge restante et barre de progression, à jour à chaque bougie ; « Compte sans règles » en Classique.
### Modifié
- **Bougie précédente** (← / J) : s'il n'y a ni trade ni ordre après le point, elle recule comme avant ; sinon elle demande « Annuler ce qui suit » ou « Reculer l'affichage seul (comme avant) ».
- **Sessions de backtest** : les sessions isolées s'affichent au-dessus des instantanés, qui marchent comme avant (ouvrir un instantané enregistre d'abord la session isolée ouverte).

## [1.65.1] — 2026-11-19
### Corrigé
- **Excalidraw : l'app gelait** en cliquant sur Visualisation ou Partager sur X (plus d'une minute sur un grand tableau en mode sombre : le filtre sombre d'Excalidraw sur un très grand canvas). Mode sombre recalculé par blocs (même rendu, moins de 2 s, l'interface reste fluide), aperçu réduit (2 000 px), image pour X limitée à 4 096 px, export limité à 16 384 px / 40 Mpx (échelle réduite automatiquement et signalée), boutons bloqués pendant le rendu.

## [1.65.0] — 2026-11-18
### Amélioré
- **Excalidraw : Partager sur X** : l'image est maintenant **collée directement dans le post** (vrai collage, comme Ctrl+V) dès que la rédaction de X est prête, dans la fenêtre X de l'app et aussi avec « Ouvrir dans Chrome » (Windows : l'onglet X est mis au premier plan et l'image y est collée). Ajout par le champ fichier en secours.

## [1.64.1] — 2026-11-18
### Modifié
- **Review › Connecter Notion (Mac)** : instructions avec les pages Notion de Woods (« Mon journal de Trading - WoodsFx », « What to focus on ? », liens directs), capacités à cocher (Lire / Mettre à jour / Insérer), message d'accès adapté.

## [1.64.0] — 2026-11-18
### Amélioré
- **Excalidraw : Partager sur X** : le brouillon s'ouvre maintenant dans une fenêtre X de l'app avec le texte **et l'image déjà ajoutée** au post (connexion à X gardée après la 1re fois ; rien n'est publié sans toi). L'image est aussi copiée par le presse-papiers système (Ctrl+V de secours). Bouton « Dans Chrome (Ctrl+V) » pour passer par ton Chrome.

## [1.63.0] — 2026-11-18
### Ajouté
- **Excalidraw : dessins enregistrés dans un dossier** : dans l'app, chaque tableau est un fichier `.excalidraw` dans `Bureau\Inner Circle Trader\Excalidraw\` (s'ouvre aussi sur excalidraw.com). Bouton « 📁 Dossier » pour l'ouvrir ; un tableau supprimé part dans `Excalidraw\_supprimés` (jamais effacé). Les tableaux déjà dessinés sont recopiés dans le dossier à la première ouverture. Sur le site web, ils restent dans le navigateur.
- **Excalidraw : Exporter l'image avec Visualisation** : format PNG / SVG, échelle 1× à 4×, marge, arrière-plan, mode sombre, sélection uniquement, scène intégrée ; le bouton « 👁 Visualisation » montre le rendu exact (dimensions, poids) avant d'enregistrer (`Excalidraw\Exports\` dans l'app) ou de copier. Réglages gardés.
- **Excalidraw : Partager sur X (brouillon)** : texte du post + aperçu ; l'image est copiée dans le presse-papiers et la fenêtre de rédaction de X s'ouvre dans Chrome avec le texte : Ctrl+V pour ajouter l'image, puis enregistrer en brouillon ou publier.
### Corrigé
- **Excalidraw : Renommer** ne faisait rien dans l'app (Electron n'a pas de fenêtre `prompt`) : nouvelle fenêtre de saisie, aussi pour Nouveau et Dupliquer. Le bandeau des news NEW YORK ne cache plus le bas du tableau.

## [1.62.0] — 2026-11-18
### Ajouté
- **Bandeau des news « NEW YORK » sur tous les thèmes** (Classique, Noir, Matrix, Wall Street, ICT épuré) : prochaines news du calendrier sur 12 jours, couleurs adaptées à chaque thème, actualisé toutes les heures. Masqué dans le Backtesteur, la page Graphique et sur téléphone.

## [1.61.1] — 2026-11-18
### Corrigé
- **Menu latéral** : les pages enlevées restaient affichées avec le thème Noir (le style du menu passait par-dessus le masquage).

## [1.61.0] — 2026-11-18
### Ajouté
- **Menu latéral : enlever / remettre des pages** (Paramètres › Profil › Menu latéral) : bouton « Enlever » / « Remettre » sur chaque page, gardé avec l'ordre (`econcal-navorder.hidden`). Une section sans page visible disparaît du menu. Profil reste toujours visible.

## [1.60.0] — 2026-11-18
### Ajouté
- **Laboratoire › Excalidraw** : tableau blanc [Excalidraw](https://github.com/excalidraw/excalidraw) (SDK open source, MIT) intégré dans l'app, en français et en thème sombre. Plusieurs tableaux (Nouveau / Renommer / Dupliquer / Supprimer), sauvegarde automatique en local (IndexedDB, images comprises), export PNG / SVG / `.excalidraw` et import depuis le menu ☰. Bundle local dans `vendor/excalidraw` (chargé à la première ouverture, marche hors ligne dans l'exe) ; reconstruction : `cd tools/excalidraw && npm ci && npm run build`.

## [1.59.1] — 2026-11-18
### Corrigé
- **Mac : mise à jour** : le remplacement de l'app écrit son résultat dans `~/Library/Logs/Inner Circle Trader/mise-a-jour.log` ; un échec (macOS qui refuse de remplacer l'app, copie ratée) n'est plus silencieux : notification au lancement + message dans Paramètres › Profil › Application.

## [1.59.0] — 2026-11-18
### Ajouté
- **Mac : mise à jour automatique** (comme sur Windows) : l'app vérifie GitHub 2 min après le lancement puis toutes les 30 min, télécharge et prépare la nouvelle version en arrière-plan (taille + SHA-256 vérifiés), puis l'installe à la fermeture de l'app (sans relance) ou après 10 min d'inactivité du Mac (avec relance). Jamais pendant le Trade copier en réel. Le bouton « Mettre à jour » du Profil installe tout de suite la version déjà prête.

## [1.58.0] — 2026-11-18
### Ajouté
- Laboratoire : nouvelle page **Skill IA & Coach IA** (`#skillia`) — le Skill IA « Profil prop firm » et le coach IA quittent Paramètres › Profil.
- Paramètres › Profil : panneau **Menu latéral · ordre des pages** — glisser-déposer (ou ↑ / ↓) les pages dans leur section ou vers une autre section, puis « Enregistrer » : l'ordre est gardé au relancement (localStorage `econcal-navorder`). Bouton « Ordre par défaut ».
### Modifié
- Journal de trading : l'onglet **80/20 devient 20/80** et reçoit en haut les sections « Loi 80/20 · ce qui fait l'essentiel de tes gains et de tes pertes » et « Sortie : 2R ou 3R ? · simulé sur le MFE de chaque setup » (Journal de Neal, période Tout / jour / mois / année).
- Journal de Neal › Analyse : ces deux sections et le tableau « Macro · N setups » (déjà dans Statistiques) sont retirés ; la page garde la période et les KPIs.

## [1.57.3] — 2026-11-17
### Corrigé
- Journal de Neal : le **Status passe avant l'Entrée** pour choisir le trade lié. Notion arrondit les heures à la minute : une Entrée écrite à 9:49 (trade à BE) restait liée au mauvais trade alors que le setup est TP (trade de 10:04). Score : Status cohérent (TP = gagnant, SL = perdant, BE ≈ 0) > proximité de l'Entrée > fenêtre exacte. L'Entrée, la Sortie, le PnL, la MAE et la MFE sont réécrits quand l'Entrée pointe un autre trade.
- MAE / MFE : 1 R tiré du « RR fait » seulement si le résultat réel du trade est cohérent (≥ 1 pt, même sens) — plus de MFE à 512 R sur un trade à BE ; aucune valeur écrite si 1 R < 1 pt.

## [1.57.2] — 2026-11-17
### Corrigé
- Calendrier › Par semaine : revenir de « Focus jour » à « Liste » ne casse plus la mise en page (les colonnes du style Focus restaient appliquées).
- Menu latéral : plus de barre de défilement visible (le menu défile toujours à la molette).

## [1.57.1] — 2026-11-17
### Modifié
- Synchro TopstepX : chaque trade récupère les **vraies bougies 1 seconde** de TopstepX entre sa seconde d'entrée et sa seconde de sortie, et garde le plus haut / plus bas atteints pendant le trade (« Plus haut (trade) », « Plus bas (trade) », gardés d'une synchro à l'autre ; les comptes copiés du même instant partagent une requête ; 80 trades / 25 s max par synchro, les plus récents d'abord).
- Journal de Neal : la **MAE / MFE** utilise ces bougies 1 s (plus de bougies 1 min approximatives) ; si la synchro ne les a pas encore, l'app les demande à TopstepX (1 s, sinon 1 min en dernier recours). MAE toujours plafonnée à 1 R, 1 R = taille du SL.

## [1.57.0] — 2026-11-17
### Ajouté
- Calendrier › **Par semaine** : bouton de style **☰ Liste / ◧ Focus jour** (mémorisé, `econcal-wstyle`). « Focus jour » = 5 cartes, la journée en grand (news + My plan), les autres journées grisées ; clic sur une carte grisée = la mettre en focus, clic sur la carte en focus = l'éditer. Focus par défaut sur aujourd'hui (heure de New York).
- Éditeur du jour : champ **Comptes** (All accounts / Fewer accounts / No trading), affiché en pastille dans les deux styles.
### Modifié
- Semaine du 16 au 20 nov. : Fed Chairman Warsh Speaks (lun. 12:00 PM), FOMC Member Waller Speaks (ven. 8:25 AM), « My plan » de la Roadmap @corleone_trades et notes InnerDiscipline de la semaine (`data/innerdiscipline.txt`).

## [1.56.1] — 2026-11-17
### Modifié
- Hexagone de performance : l'axe **RR** = moyenne du **RR fait** des setups du Journal de Neal liés aux trades du compte (un setup compté une fois), au lieu de Avg Win / Avg Loss. « — » si aucun setup Notion lié ; l'infobulle donne le nombre de setups.
- Daily Account Balance : la courbe part du solde de départ **le jour de l'achat du compte** (« Date de début » TopstepX, sinon la date du compte dans Comptes › Topstep, sinon la veille du 1er jour tradé) : l'equity curve s'affiche dès le premier jour de trading.
- Journal de Neal : **un setup = un seul trade TopstepX**. Les entrées prises au même moment sur les comptes copiés (≤ 2 min d'écart) forment un trade ; deux entrées séparées (ex. 9:49 sortie à BE puis 10:04 au TP) sont deux trades différents et ne sont plus jamais liées au même setup (annule le regroupement des ré-entrées de la 1.55.1). Quand plusieurs trades tombent dans la fenêtre Time, le choix se fait par le Status (TP = gagnant, SL = perdant, BE ≈ 0), la fenêtre exacte, puis l'exclusivité entre setups du même jour. Une Entrée saisie à la main (à la minute) fixe le trade.
- Entrée / Sortie / PnL / MAE / MFE écrits par l'app (Entrée à la seconde) sont réécrits si le setup est relié à un autre trade.
- MAE / MFE : calculés sur les bougies 1 min strictement entre l'entrée et la sortie + prix d'entrée et de sortie réels (les minutes de bord contenaient des prix d'avant l'entrée / d'après la sortie) ; **MAE plafonnée à 1 R** (au-delà, le stop aurait sorti la position).
### Corrigé
- Journal de trading (responsive) : les cartes du haut passent sur 3 colonnes sous 1 800 px et ne débordent plus (Avg Win / Avg Loss, Profit Factor) ; les étiquettes de l'hexagone ne recouvrent plus les noms des axes.

## [1.56.0] — 2026-11-17
### Ajouté
- **Graphique** (menu Laboratoire, juste au-dessus de Backtesteur) : une page façon TradingView.
  - **Données en direct** : tous les contrats TopstepX (NQ, ES, MNQ, MES, YM, RTY, GC, CL, 6E, ZN, ZB…, contrat front calculé : NQZ26…) relus chaque seconde, historique des CSV `data_csv` / `data` pour NQ, ES, MNQ, MES, et Forex Factory pour le forex, les indices CFD, l'or, le DXY, le VIX et la crypto. Historique infini en reculant, import d'un CSV.
  - **Unités de temps** de 1 s à 12 mois (favoris étoilés, unités personnalisées, frappe directe « 5 », « 4h », « D » + Entrée), heure de New York (ou autre fuseau), séance RTH seule en option.
  - **15 types de graphique** : bougies, creuses, barres, colonnes, ligne (avec repères), en escalier, zone, HLC, ligne de base, haut-bas, Heikin Ashi, Renko, saut de ligne, barres de range.
  - **Plus de 80 outils de dessin** : lignes (tendance, rayon, info, étendue, angle, horizontale, verticale, croix), canaux, fourchette d'Andrews, Fibonacci (retracement avec OTE 0,705 et déviations STDV, extension, canal, zones de temps, éventail, cercles, arcs), Gann, figures harmoniques (XABCD, ABCD, tête-épaules, triangle, trois poussées, vagues d'Elliott), positions longue / courte (quantité, risque %, R:R, résultat), plages de prix / dates, VWAP ancré, profil de volume fixe, formes, pinceau, textes, notes, bulles, drapeaux, emojis, règle (Maj + clic). Aimant faible / fort, mode « rester en dessin », verrouiller / masquer / supprimer tout, barre flottante (couleur, épaisseur, style), réglages complets (style, texte, niveaux, coordonnées, visibilité par unité de temps), modèles, cloner (Alt + glisser), copier / coller, ordre (avant / arrière), arbre des objets, annuler / rétablir. Les dessins sont gardés par sous-jacent (MNQ = NQ) et suivent toutes les unités de temps.
  - **Indicateurs** (≈ 60) : moyennes (SMA, EMA, WMA, HMA, VWMA, ruban), Bollinger, Keltner, Donchian, enveloppes, VWAP (séance / semaine / mois + bandes), Ichimoku, SAR, Supertrend, pivots, ZigZag, volume, profil de volume de la plage visible, RSI, MACD, stochastique, Stoch RSI, CCI, ATR, DMI / ADX, momentum, ROC, Williams %R, OBV, MFI, CMF, Awesome, Aroon, volatilité historique, Choppiness… et le **pack ICT** : sessions & killzones (Asie, Londres, NY AM, London close, NY PM), niveaux (PDH / PDL, PWH / PWL, PMH / PML, Midnight Open, 8:30, 9:30, clôture RTH), gaps NWOG / NDOG / RTH avec CE, FVG. Paramètres et style de chaque indicateur, favoris, modèles d'indicateurs, panneaux redimensionnables, légende repliable façon TradingView. **Éditeur Pine / TS** intégré (mêmes scripts que le Backtesteur).
  - **Multi-graphiques** : 1 à 8 graphiques (10 dispositions), synchro du symbole, de l'unité, du réticule, de l'heure et de la plage, agrandir un graphique (Alt + Entrée), comparer des symboles (échelle %), mises en page enregistrées (export / import JSON).
  - **Panneaux de droite** : liste de surveillance (glisser pour trier), **alertes** (prix, dessins, croisements ; notification + son + journal), calendrier économique (news de la semaine), détails du symbole (performance, plage 52 semaines, échéance du contrat), arbre des objets, fenêtre de données.
  - Événements économiques et **trades du Journal** affichés sur le graphique, compte à rebours de la bougie, prix haut / bas, ligne de clôture précédente, filigrane, thème sombre / clair, échelles log / % / inversée / à gauche, capture d'écran (fichier ou presse-papiers), plein écran, **Replay** (ouvre le Backtesteur sur le symbole et la date), plus de 60 **raccourcis clavier TradingView** (personnalisables).
  - **Mode « TradingView »** : le vrai site tradingview.com dans la page (app Windows ; connexion à ton compte gardée dans la session `persist:tradingview`), ou le widget officiel sur le web.

## [1.55.1] — 2026-11-17
### Corrigé
- Journal de Neal : les trades TopstepX liés à un setup incluent maintenant les **ré-entrées** (ex. Macro 10h : entrée 9:49 sortie à BE, puis ré-entrée 10:05 au TP) — de l'Entrée (−2 min) jusqu'à la fin de la fenêtre Time du setup (ou jusqu'à la Sortie). Avant, une fois l'Entrée renseignée, seuls les trades des 3 minutes suivantes étaient liés.
- PnL = vérité TopstepX : s'il ne correspond plus aux trades liés (ré-entrée synchronisée plus tard), il est réécrit dans Notion, et la Sortie, la MAE et la MFE sont recalculées.
### Modifié
- MAE / MFE : **1 R = taille du SL** (2R = 2 × le SL…) — tag « Stop théorique » du trade dans le Journal (distance à « Entrée théorique », sinon au prix d'entrée réel). Sinon |sortie − entrée| / |RR fait|, sinon tag « Risque » ($).

## [1.55.0] — 2026-11-17
### Ajouté
- Journal de Neal (Review) : un setup pris est complété automatiquement depuis les trades TopstepX liés — **PnL** (P&L net total TopstepX du setup, tous les comptes liés : Master + Slaves, comme « P&L total TopstepX » de la fiche), Entrée, Sortie, **MAE (R)** et **MFE (R)** (compte Master). Se lance après chaque synchro TopstepX / Notion et dès l'ouverture de la fiche (la fiche se rafraîchit avec les valeurs écrites dans Notion). Seules les propriétés vides sont remplies.
- MAE / MFE des trades à BE : quand « RR fait » vaut ~0, 1 R = tag « Risque » ($) du trade / (valeur du point × taille). Sans RR fait ni tag Risque, MAE / MFE restent vides (pas de stop connu).
### Corrigé
- Mes comptes : un compte vu à la fois par le dashboard Topstep (EXPRESS-V2-…-29896215) et par TopstepX (« Topstep 0K …6215 ») n'apparaît plus en double. Une seule carte Topstep (prix payé, étape) avec le solde / P&L / statut en direct de TopstepX.

## [1.54.2] — 2026-11-17
### Corrigé
- Synchro TopstepX : fermer la fenêtre de connexion ne bloque plus le bouton sur « Synchronisation… » pendant 10 min. L'attente s'arrête, un message l'indique et « ⟳ Synchro TopstepX » rouvre la fenêtre.
- Fenêtre de connexion : TopstepX passe maintenant par login.topstep.com (même email / mot de passe que le dashboard Topstep). La fenêtre garde le titre « Connexion TopstepX » et revient toujours sur topstepx.com après la connexion (jamais sur le dashboard Topstep, où l'app ne trouve pas la session TopstepX). Les pages mot de passe oublié / inscription restent accessibles.

## [1.54.1] — 2026-11-17
### Ajouté
- **Paramètres › Profil › Connexion TopstepX** : choix du mode de connexion — fenêtre de connexion dans l'app (par défaut, comme avant) ou connexion Chrome (favori « → ICT »). Réglage gardé dans `localStorage "econcal-tsx-mode"`.
### Modifié
- Journal de trading : le bouton s'appelle **« ⟳ Synchro TopstepX »**, il est toujours visible et synchronise les comptes et les trades dans les deux modes. Mode app : la fenêtre de connexion s'ouvre si la session a expiré. Mode Chrome : synchro avec la session reçue de Chrome ; si elle a expiré, TopstepX s'ouvre dans Chrome et le favori « → ICT » relance la synchro. Message de confirmation avec le nombre de comptes / trades.
### Corrigé
- Un clic sur le bouton de synchro ne faisait plus qu'ouvrir Chrome (depuis la connexion Chrome) : plus aucune synchro sans le favori « → ICT ».

## [1.54.0] — 2026-11-17
### Ajouté
- Backtesteur : le bouton 🤖 Jarvis propose 3 protocoles — Jarvis ICT (inchangé), **Jarvis Fuck Model v1.2** et **Jarvis Fuck Model v4.0** (page Notion « Fuck Model »). Calcul sur les bougies déjà rejouées uniquement, aucun ordre passé.
  - v1.2 : PDH (Buy Stop) / PDL (Sell Stop) de la séance précédente, ordres posés à l'ouverture 18:00 NY, 1 NQ, TP 8,5 pts / SL 20 pts, frais 5,76 $ ; un PDH / PDL pris n'est jamais repris ; « TP loupé » quand le gap NWOG / NDOG dépasse le TP.
  - v4.0 : ordres posés le vendredi avant la clôture, déclenchés à la reprise du dimanche 18:00 ; NWOG + Daily High / Low des 2 derniers mois encore intacts et traversés par le gap = 1 trade chacun, SL 20 pts, sortie à la clôture de la 1re bougie m1.
  - **Backtest auto** sur l'historique m1 : win rate, P&L net, profit factor, max drawdown, pire série de pertes, P&L par mois, liste des trades (clic = rejouer la journée), export CSV. Réglages gardés (`localStorage "bt-fm-opts"`).
  - `fmCore` (fonctions pures entre `fmCore:start` / `fmCore:end`) testé par `tools/check.js`.

## [1.53.0] — 2026-11-13
### Ajouté
- **Paramètres › Profil › Application** : version de l'app (et n° de build), dernière version publiée sur GitHub et bouton **Mettre à jour maintenant** — téléchargement avec progression, vérification du fichier (taille + SHA-256), puis l'app se ferme, installe la nouvelle version et se relance toute seule (données gardées). Windows : même mécanisme que la mise à jour automatique ; Mac : l'app est remplacée dans Applications puis relancée. Bouton « Vérifier les mises à jour », nouveautés de la version (CHANGELOG) et message au redémarrage (« Mise à jour installée » ou échec).
- Pastille orange sur **Profil** dans le menu quand une mise à jour est disponible (vérification au lancement, puis toutes les 3 h).
- Une nouvelle build de la même version est aussi proposée : n° de build GitHub Actions dans l'app (`app/build.json`) et dans la release.
- Version web : version affichée + liens de téléchargement Windows / Mac / Android.
- Releases `latest` / `latest-mac` : version, n° de build, commit, taille et SHA-256 du fichier dans le corps (commentaire `ict-build`, lu par l'app).
### Modifié
- La mise à jour automatique reste active (fichier `Inner Circle Trader.update.exe` posé à côté de l'exe) ; si l'exe reste bloqué plus de 2 min, l'ancienne version est relancée au lieu de laisser l'app fermée, et le fichier de mise à jour est retiré.
### Corrigé
- Mise à jour en attente pendant que le Trade copier tourne en mode réel : une seule notification au lieu d'une toutes les 6 s.

## [1.52.2] — 2026-11-13
### Ajouté
- Backtesteur › Aller à : **les macros** dans le menu, à leur heure — Macro 2h (01:50 → 02:10) … Macro 15h (14:50 → 15:10), comme la propriété « Time » du Journal de Neal, plus Macro 15h15 (Last Ditch, 15:15 → 15:45). Les Silver Bullet affichent aussi la fin de leur fenêtre.
- **Prochaine macro** (Alt+9 par défaut, et Alt+Maj+M en raccourci fixe) : saute à la prochaine macro étoilée, quelle que soit l'heure ; le menu affiche l'heure de la prochaine macro et de la prochaine news.
- Réglages « Aller à » : boutons ★ toutes / ☆ aucune pour les macros (les macros étoilées sont celles du menu et de « Prochaine macro »), liste défilante.
### Modifié
- Raccourcis Alt+1 → Alt+0 réservés aux favoris hors macros, toujours dans l'ordre des heures (les macros passent par « Prochaine macro »). Le menu « Aller à » défile s'il ne tient pas à l'écran.

## [1.52.1] — 2026-11-13
### Ajouté
- Backtesteur › Aller à : **Opening Premarket** (7:00) et **Close Premarket** (9:00) ; Silver Bullet Londres (3:00) et Silver Bullet PM (14:00) en favoris.
### Modifié
- Menu et réglages « Aller à » triés par heure de New York ; raccourcis **Alt+1 → Alt+9** attribués aux favoris dans l'ordre des heures (02:00 Londres = Alt+1, 03:00 SB Londres = Alt+2, 07:00 = Alt+3…).
- Pas du replay : raccourcis déplacés sur **Alt+Maj+← / →** (et Alt+Maj+↓ = bougie du chart) pour libérer Alt+4 → Alt+6.

## [1.52.0] — 2026-11-13
### Ajouté
- **Marché** (menu, au-dessus du Calendrier Économique) : la page forexfactory.com/market/<instrument> dans l'app, en heure de New York — Instrument (prix), Performance (pips, mini-graphique et % sur 3 périodes au choix, 5 min → 48 h), Grand graphique / Graphique (1M → mensuel), Actualités (dernières et plus lues), Posts du forum, Événements à venir, Positions des traders, Cotations des brokers, Sessions (Sydney, Tokyo, Londres, New York), Scanners Forex / macro (clic = changer d'instrument), Taux directeurs.
- **Mises en page** comme sur Forex Factory : Forex / Macro / Event / System Focused, et mises en page personnalisées (lignes 1 ou 2 colonnes, blocs ajoutés, déplacés, retirés ; plusieurs enregistrables ; « ✎ » sur une mise en page de base = la personnaliser).
- App Windows : lecture en direct (bougies via l'API mds-api.forexfactory.com, reste de la page via une fenêtre cachée), actualisation toutes les 30 s. Web : `api/marche-<slug>.json` exporté toutes les 30 min par GitHub Actions (EUR/USD, GBP/USD, USD/JPY, XAU/USD).

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
