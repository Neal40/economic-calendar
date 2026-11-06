# Economic Calendar · New York Time (ET)

USD economic calendar — the month at a glance: news, NYSE holidays and key earnings.
One self-contained page (`index.html`), no build step, no dependencies.

## Features
- Sidebar menu: **Laboratoire** (Calendrier Économique, FinancialJuice live news, Journal de trading = Stats TopstepX, with 2 tabs: Stats TopstepX + Journal de Neal (Notion Macro, linked to the TopstepX trades taken at the same time); Review = Notion « What to focus on ? ») and **Paramètres** (Profil, Abonnement, Factures)
- FinancialJuice: official headlines widget (live). Works on GitHub Pages and in the .exe
- Journal de trading: TopstepX stats per account (KPIs, balance vs MLL, daily P&L, duration / win-rate analysis, P&L calendar, trades table). In the Windows app the data is synced automatically from TopstepX (sign in once; local database `journal-db.json` in the app data folder, auto-sync at launch and every 5 min). On the website: import `comptes.json` / `trades.json`. No account data in this repo
- Journal: Hexagone de performance (Winrate, RR, DD, Positions, Risque — account vs average of your accounts), Tags popup (attributes of the Notion « Respect du plan » base), Images popup (NQ/ES H4 … Vraie Exécution, paste / drop), RR théorique column (from Entrée / Stop / TP théoriques). Tags & images stay local (export / import JSON)
- Review: synced from Notion in the Windows app (official API, your own integration secret, read-only, stored encrypted). Notion views reproduced (Trades, In, Review & Paper calendars, Statistiques table, Status / PD Array / Time donuts, Prise de liquidité, RR /Month, MAE, MFE columns) + Analyse: winrate / RR by Time, PD Array M1, liquidity, Status, filters, page view with images. Web: import the Notion CSV export
- Abonnement: recurring costs (monthly / yearly, € and $), next due date
- Factures: expenses by year, category, currency
- Monthly Mon–Fri grid with week labels (auto-generated or editable)
- High / medium / low impact news (low = yellow, Forex Factory), earnings (☾ after close, ✳ pre-market, ◌ time TBD)
- NYSE holidays computed for any year: **CLOSED**, **EARLY CLOSE**, **BANK HOLIDAY** with footnotes
- Click a day to add / edit / delete events; click a week label to rename it
- Filters (High / Medium / Earnings), custom handle and logo
- Changes saved in the browser (localStorage) + JSON export / import

## Data coverage
| Period | Sources |
|---|---|
| Nov – Dec 2026 | Forex Factory (USD high & medium impact), Nasdaq earnings, NYSE |
| Jan – Dec 2027 | Federal Reserve (FOMC), BLS (NFP, CPI, PPI, ECI), BEA (GDP, Core PCE), Census (Retail Sales), NYSE |

Notes for 2027:
- Unemployment Claims: every Thursday (Wednesday when Thursday is a market holiday).
- ISM PMIs are marked **(est.)**: computed with the usual rule (Manufacturing = 1st business day, Services = 3rd).
- FOMC Minutes: 3 weeks after each decision, 2:00 PM ET.
- JOLTS, UoM and 2027 earnings are not included yet (not published at the time of writing).

All times are New York time (ET).

## Files
- `index.html` — the app (data embedded)
- `data/events.json` — the same events as plain JSON (`YYYY-MM-DD` → list of events)
- `desktop/` — Electron project for the Windows .exe (`topstepx.js` = TopstepX sync + stats)
- `scripts/generate_2027.py` — script that builds the 2027 events from the official release dates

Event format: `{"t": "8:30 AM", "n": "CPI & Core CPI", "i": "high|med|low", "k": "ev|after|pre|tbd"}`

## Windows app (.exe)
Download from **Releases → latest**: `EconomicCalendar-x.y.z-setup.exe` (installer) or `EconomicCalendar-x.y.z-portable.exe` (no install).
The `.exe` is built automatically by GitHub Actions (`.github/workflows/build-exe.yml`) on every change to `index.html` or `desktop/`.
It is an Electron wrapper around the same `index.html`, with fonts bundled so it works offline.

Build locally on Windows: `cd desktop && npm ci && npm run dist` → `desktop/dist/`.

## Run
Open `index.html` in a browser. To host it, enable **GitHub Pages** (Settings → Pages → Deploy from branch `main`, folder `/`).
