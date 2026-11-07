# Backtesteur : cible FXReplay (fonctions) + TopstepX (design)

Inventaire relevé le 2026-11-07 sur app.fxreplay.com (session de test). Design : celui de TopstepX (déjà en place).
Légende : ✅ déjà dans le backtesteur · ⬜ à faire

## Barre d'outils gauche (bouton + flèche « Expand » = menu déroulant)
| Groupe | Outils |
|---|---|
| Curseurs | ✅ Cross · ⬜ Dot · ⬜ Arrow · ⬜ Eraser |
| Lignes | ✅ Trendline `Alt+T` · ✅ Ray · ⬜ Info line · ✅ Extended line · ⬜ Trend angle · ✅ Horizontal line `Alt+H` · ✅ Horizontal ray `Alt+J` · ✅ Vertical line `Alt+V` · ✅ Crossline `Alt+C` |
| Canaux | ⬜ Parallel channel · ⬜ Regression trend |
| Pitchforks | ⬜ Pitchfork · ⬜ Inside pitchfork |
| Fibonacci | ✅ Fib retracement `Alt+F` · ⬜ Trend-based fib extension · ⬜ Fib channel · ⬜ Fib time zone · ⬜ Fib speed resistance fan · ⬜ Trend-based fib time · ⬜ Fib circles · ⬜ Fib spiral · ⬜ Fib speed resistance arcs · ⬜ Fib wedge · ⬜ Pitchfan |
| Gann | ⬜ Gann box · ⬜ Gann square fixed · ⬜ Gann square · ⬜ Gann fan |
| Chart patterns | ⬜ XABCD · ⬜ Cypher · ⬜ Head and shoulders · ⬜ ABCD · ⬜ Triangle pattern · ⬜ Three drives |
| Elliott | ⬜ Impulse (1·2·3·4·5) · ⬜ Correction (A·B·C) · ⬜ Triangle (A·B·C·D·E) · ⬜ Double combo (W·X·Y) · ⬜ Triple combo (W·X·Y·Z) |
| Cycles | ⬜ Cyclic lines · ⬜ Time cycles |
| Forecasting | ⬜ Long position · ⬜ Short position · ⬜ Position forecast · ⬜ Bars pattern · ⬜ Ghost feed |
| Volume | ⬜ Anchored VWAP · ⬜ Fixed range volume profile · ⬜ Anchored volume profile |
| Mesures | ✅ Measure (Shift+clic) · ⬜ Price range · ⬜ Date range · ⬜ Date and price range |
| Pinceaux | ⬜ Brush · ⬜ Highlighter |
| Flèches | ⬜ Arrow marker · ⬜ Arrow · ⬜ Arrow mark up / down / left / right |
| Formes | ✅ Rectangle `Alt+Shift+R` · ⬜ Rotated rectangle · ⬜ Path · ⬜ Circle · ⬜ Ellipse · ⬜ Polyline · ⬜ Triangle · ⬜ Arc · ⬜ Curve · ⬜ Double curve |
| Texte & notes | ✅ Text · ⬜ Note · ⬜ Price note · ⬜ Pin · ⬜ Table · ⬜ Callout · ⬜ Comment · ⬜ Price label · ⬜ Signpost · ⬜ Flag mark |
| Emojis | ⬜ Emojis |
| Divers | ⬜ Zoom in (outil) · ✅ Magnet (⬜ modes : off / custom % / strong / snap indicateurs) · ⬜ Keep drawing mode · ✅ Lock drawings · ✅ Show/hide (⬜ options : dessins / indicateurs / positions & ordres / tout) · ✅ Remove all (⬜ options : dessins / indicateurs / les deux) |
| Favoris | ✅ étoile sur chaque outil · ✅ barre de favoris flottante déplaçable (« Toggle favorites bar ») |

## Raccourcis clavier FXReplay
- **Dessin** : Alt+T trend · Alt+H horiz. line · Alt+J horiz. ray · Alt+V vertical · Alt+C crossline · Alt+F fib · Alt+Shift+R rectangle
- **Édition** : Ctrl+Z / Ctrl+Y · Suppr/Retour arrière · Ctrl+C / X / V / D (dupliquer) · Ctrl+A · flèches = déplacer la sélection (Maj = grand pas) · Échap
- **Navigation** : + / − zoom · flèches = pan · Alt+R reset vue · Alt+I inverser l'échelle · Alt+G aller à une date · Alt+Maj+→ dernière bougie · 0–9 = taper un intervalle · Alt+Maj+4/5 intervalle préc./suiv. · Maj+F focus (masquer les barres)
- **Replay** : Alt+1 play/pause · Ctrl+Espace bougie suivante · Ctrl+Alt+R bougie précédente · Alt+2 / Alt+3 ralentir / accélérer · Alt+4 / Alt+5 TF replay − / + · Alt+6 synchro TF
- **Trading** : Alt+B limite · Alt+N stop · Alt+M marché · Alt+, nouvel ordre · Alt+Q achat rapide · Alt+Maj+Q vente rapide
- **Aller à** : Maj+Y ouverture du jour suivant · Maj+W news suivante · Maj+Z session suivante · Maj+I Asie · Maj+L Londres · Maj+N New York · Maj+V Silver Bullet suivant
- **Capture** : Ctrl+Alt+S télécharger · Ctrl+Maj+S copier l'image
- **Général** : Ctrl+S sauver la mise en page · Ctrl+J journal · Alt+Maj+E afficher les news · Alt+K panneau des raccourcis

## Autres fonctions
- Barre du haut : symbole, comparer, intervalles 1m→1M, type de graphique, Indicators, Order flow, Analytics, undo/redo, layouts, thème, capture, plein écran
- Bas : Buy / Sell + quantité + presets ; replay (vitesse, bougie préc./suiv., TF du replay, « Go to ») ; plages 1D/5D/1M/3M/6M/1Y/All ; aller à une date ; % / log / auto
- Panneau droit : Order · Object tree · Watchlist · Journal · News
- **News** : drapeaux sous les bougies (nombre d'événements par jour) ; panneau avec barre de la semaine, heure, drapeau, impact, nom, actual / forecast / previous
- **Positions** : ✅ TP/SL (et ordres en attente) glissables sur le chart, P&L affiché à côté ; un ordre glissé au-delà du prix part au marché

## Tranches de développement proposées
1. ✅ Barre d'outils façon FXReplay (groupes + menus + étoiles + barre de favoris + raccourcis) branchée sur les outils existants
2. ✅ TP/SL glissables avec P&L à côté
3. News Forex Factory : drapeaux sous les bougies + panneau News (réutilise les données du calendrier)
4. Outils lot A : ray, info line, extended line, trend angle, crossline, parallel channel, regression, long/short position, price/date range, brush, flèches, cercle/ellipse/path/polyline/triangle, variantes de texte
5. Replay & navigation : raccourcis replay, sauts de session (Asie/Londres/NY/Silver Bullet), aller à une date, news suivante
6. Outils lot B : Fibonacci & Gann restants, patterns, Elliott, cycles, volume (VWAP, profils)
