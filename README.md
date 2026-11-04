# Economic Calendar · New York Time (ET)

USD economic calendar — the month at a glance: news, NYSE holidays and key earnings.
One self-contained page (`index.html`), no build step, no dependencies.

## Features
- Monthly Mon–Fri grid with week labels (auto-generated or editable)
- High / medium impact news, earnings (☾ after close, ✳ pre-market, ◌ time TBD)
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
- `scripts/generate_2027.py` — script that builds the 2027 events from the official release dates

Event format: `{"t": "8:30 AM", "n": "CPI & Core CPI", "i": "high|med|low", "k": "ev|after|pre|tbd"}`

## Run
Open `index.html` in a browser. To host it, enable **GitHub Pages** (Settings → Pages → Deploy from branch `main`, folder `/`).
