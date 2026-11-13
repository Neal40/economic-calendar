/* Construit api/marche-<slug>.json pour la version web de la section « Marché » (l'app Windows lit Forex Factory en direct).
   Lancé par .github/workflows/marche.yml (toutes les 30 min les jours de marché).
   Usage : node tools/export-marche.js eurusd gbpusd …   (playwright requis pour la page ; sans lui, seules les bougies sont écrites) */
const fs = require("fs"), path = require("path");
const m = require("../desktop/marche");
const root = path.join(__dirname, "..");
const SLUGS = process.argv.slice(2).length ? process.argv.slice(2) : ["eurusd"];
const NAMES = { goldusd: "Gold/USD", spxusd: "SPX/USD", dxyusd: "DXY/USD", wtiusd: "WTI/USD", btcusd: "BTC/USD" };
const NAME = (slug) => NAMES[slug] || (slug.length === 6 ? slug.slice(0, 3).toUpperCase() + "/" + slug.slice(3).toUpperCase() : slug.toUpperCase());
const pack = (b) => b.map((x) => [x.time, x.open, x.high, x.low, x.close]);
const SCAN = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "USD/CAD", "AUD/USD", "NZD/USD", "GBP/JPY", "SPX/USD", "Nikkei225/USD", "FTSE100/USD", "DXY/USD", "WTI/USD", "Gold/USD", "BTC/USD", "VIX/USD"]; // scanners Forex / Macro de Forex Factory

(async () => {
  let browser = null;
  try { const { chromium } = require(process.env.PW || "playwright"); browser = await chromium.launch(); } catch (e) { console.warn("playwright absent : bougies seulement"); }
  const scan = {};
  for (const inst of SCAN) { try { scan[inst] = pack(await m.bars(fetch, inst, "H1", 30)); } catch (e) { console.warn("scanner", inst, e.message); } }
  for (const slug of SLUGS) {
    let page = null;
    if (browser) {
      try { const p = await browser.newPage({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0 Safari/537.36", timezoneId: "America/New_York" });
        await p.goto(m.PAGE(slug), { waitUntil: "domcontentloaded", timeout: 60000 });
        await p.waitForSelector(".market-instrument", { timeout: 30000 });
        await p.waitForFunction(() => !document.querySelector(".mds_scanner--loading"), null, { timeout: 15000 }).catch(() => {});
        page = JSON.parse(await p.evaluate(m.EXTRACT)); await p.close();
      } catch (e) { console.warn(slug, "page :", e.message); }
    }
    const pn = page && page.instrument && page.instrument.name, inst = pn && pn.includes("/") ? pn : NAME(slug); // la page affiche « SPX », l'API attend « SPX/USD »
    const bars = {};
    for (const [iv, n] of [["M5", 600], ["M15", 300], ["H1", 300], ["H4", 300], ["D1", 300]]) { try { bars[iv] = pack(await m.bars(fetch, inst, iv, n)); } catch (e) { console.warn(slug, iv, e.message); } }
    const file = path.join(root, "api", `marche-${slug}.json`);
    let old = null; try { old = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { /* premier export */ }
    if (!page && old && old.page) page = old.page; // page bloquée : on garde la dernière lue
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ source: m.PAGE(slug), generated_at: new Date().toISOString(), instrument: inst, page, bars, scan }));
    console.log(file, page ? "page OK" : "sans page", Object.keys(bars).join(","));
  }
  if (browser) await browser.close();
})();
