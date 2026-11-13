/* Section « Marché » (même contenu que forexfactory.com/market/<instrument>) — lecture seule.
   - bougies : API publique mds-api.forexfactory.com/bars (JSON, la même que le chart du site)
   - le reste de la page (stories, posts, events, positions, quotes, sessions, scanners, mises en page, taux des banques centrales)
     est rendu côté serveur par Forex Factory : une fenêtre cachée (session « persist:forexfactory ») charge la page et EXTRACT la lit.
   EXTRACT est aussi utilisé par tools/export-marche.js (GitHub Actions) pour api/marche-<slug>.json (version web). */

const API = "https://mds-api.forexfactory.com";
const PAGE = (slug) => "https://www.forexfactory.com/market/" + slug;
const INTERVALS = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"];

const slugOf = (inst) => String(inst || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function cleanInstrument(inst) { const s = String(inst || "").trim(); if (!/^[A-Za-z0-9.]{2,16}\/[A-Za-z0-9.]{2,16}$/.test(s)) throw new Error("instrument invalide"); return s; } // casse respectée (ex. « Gold/USD », « Nikkei225/USD »)

/* réponse de /bars -> [{ time, open, high, low, close }] par ordre chronologique (secondes UTC) */
function parseBars(j) {
  const rows = (j && Array.isArray(j.data)) ? j.data : [];
  return rows.filter((b) => Number.isFinite(b.timestamp) && Number.isFinite(b.close))
    .map((b) => ({ time: b.timestamp, open: +b.open, high: +b.high, low: +b.low, close: +b.close }))
    .sort((a, b) => a.time - b.time)
    .filter((b, i, a) => i === 0 || a[i - 1].time !== b.time);
}

/* n bougies (pages de 200 max, comme le site) ; to = horodatage de fin (secondes) facultatif */
async function bars(fetchFn, inst, interval, n, to) {
  inst = cleanInstrument(inst); if (!INTERVALS.includes(interval)) throw new Error("unité invalide");
  n = Math.max(1, Math.min(2000, n | 0 || 200));
  let out = [], end = to ? to | 0 : 0;
  while (out.length < n) {
    const per = Math.min(200, n - out.length);
    const q = `${API}/bars?interval=${interval}&instrument=${encodeURIComponent(inst)}&per_page=${per}&extra_fields=` + (end ? `&to=${end}` : "");
    const r = await fetchFn(q, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const b = parseBars(await r.json()); if (!b.length) break;
    out = b.concat(out.filter((x) => x.time > b[b.length - 1].time));
    if (b.length < per) break; end = b[0].time - 1;
  }
  return out.slice(-n);
}

/* ---------- lecture de la page Forex Factory (exécuté dans la page) ---------- */
const EXTRACT = String.raw`(() => {
  const T = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const Q = (s, r) => (r || document).querySelector(s), QA = (s, r) => [...(r || document).querySelectorAll(s)];
  const abs = (u) => { try { return u ? new URL(u, document.baseURI).href : ""; } catch (e) { return ""; } };
  const imp = (el) => { const c = el ? (el.className && el.className.baseVal != null ? el.className.baseVal : el.className) + " " + (el.getAttribute("src") || "") : "";
    return /high|red/.test(c) ? "high" : /medium|ora/.test(c) ? "med" : /low|yel/.test(c) ? "low" : /gra|holiday|non/.test(c) ? "none" : ""; };
  const out = { url: location.href, at: new Date().toISOString() };
  const lss = window.layoutSelectorState || null;
  if (lss) out.layouts = { active: lss.active, blocks: (lss.blocks || []).map((b) => ({ id: b.id, label: b.label, width: b.width, max: b.max, available: b.available, sticky: b.sticky, options: b.options, default_config: b.default_config })),
    layouts: (lss.layouts || []).map((l) => ({ id: l.id, name: l.name, custom: !!l.custom, rows: ((l.structure && l.structure.rows) || []).map((r) => (r.columns || []).map((c) => (c.cells || []).map((x) => x.label))) })) };
  const mi = Q(".market-instrument");
  if (mi) out.instrument = { name: T(Q(".market-instrument__name span", mi)), title: T(Q(".market-instrument__title", mi)), bid: T(Q(".market-instrument__bid", mi)),
    flags: QA(".instrument-icon img", mi).map((i) => abs(i.getAttribute("src"))) };
  const perf = Q(".market-instrument-performance");
  if (perf) { const PM = { "5 min": "M5", "10 min": "M10", "15 min": "M15", "20 min": "M20", "25 min": "M25", "30 min": "M30", "1 hr": "H1", "2 hr": "H2", "3 hr": "H3", "4 hr": "H4", "5 hr": "H5", "6 hr": "H6", "12 hr": "H12", "24 hr": "D1", "48 hr": "D2" };
    const heads = QA("thead .market-instrument-performance__metric-select", perf).map((li) => { const t = T(Q("span", li)).replace(/^Last /, ""); return PM[t] || t; });
    const rows = QA("tbody tr", perf); const cells = (i) => rows[i] ? QA(".market-instrument-performance__td--chg", rows[i]).map(T) : [];
    out.performance = heads.map((h, i) => ({ period: h, pip: cells(0)[i] || "", pct: (cells(2)[i] || cells(1)[i] || "") })); }
  out.stories = QA(".news-block__item").map((it) => { const a = Q(".news-block__title a", it), t = Q(".news-block__details span[title]", it), src = QA(".news-block__details a", it).find((x) => /^From /.test(T(x))), cm = Q("[data-comments-link]", it);
    return { title: a ? (a.getAttribute("title") || T(a)) : "", url: abs(a && a.getAttribute("href")), source: src ? T(src).replace(/^From /, "") : "", when: t ? t.getAttribute("title") : "", ago: T(t), impact: imp(Q(".news-block__details img", it)), comments: cm ? parseInt(T(cm), 10) || 0 : 0 }; }).filter((s) => s.title);
  out.posts = QA(".flexposts__post").map((p) => { const a = Q(".flexposts__title a", p), th = Q(".flexposts__caption a", p), av = Q(".usernamedisplay__avatar img", p);
    const head = T(a); const m = head.match(/^(.*?) (replied|posted|started) (.*)$/);
    return { user: m ? m[1] : head, verb: m ? m[2] : "", ago: m ? m[3] : "", url: abs(a && a.getAttribute("href")), preview: T(Q(".fader__original", p)) || T(Q(".flexposts__preview", p)), thread: T(th), avatar: abs(av && av.getAttribute("src")) }; }).filter((p) => p.user);
  out.events = QA(".upcoming tbody tr").map((tr) => { const a = Q(".upcoming__td--title a", tr);
    return { due: T(Q(".upcoming__td--in-time", tr)), impact: imp(Q(".upcoming__td--impact span span", tr) || Q(".upcoming__td--impact span", tr)), title: T(a), url: abs(a && a.getAttribute("href")), forecast: T(Q(".upcoming__td--forecast", tr)) }; }).filter((e) => e.title);
  const pos = Q(".trades_positions");
  if (pos) { const lab = (sel) => T(Q(sel, pos)); const w = (sel) => { const e = Q(sel, pos); return e ? parseFloat(e.style.width) || 0 : 0; };
    out.positions = { longTraders: lab(".trades_position__chart--traders .trades_position__label--long"), shortTraders: lab(".trades_position__chart--traders .trades_position__label--short"),
      longLots: lab(".trades_position__chart--lots .trades_position__label--long"), shortLots: lab(".trades_position__chart--lots .trades_position__label--short"),
      longTradersPct: w(".trades_position__chart--traders .trades_position__bar--long"), longLotsPct: w(".trades_position__chart--lots .trades_position__bar--long") }; }
  out.quotes = QA(".market-quotes tbody tr").map((tr) => { const a = Q(".market-quotes__td--broker a", tr), img = Q(".market-quotes__td--broker img", tr);
    return { broker: T(Q(".market-quotes__td--broker span", tr)), url: abs(a && a.getAttribute("href")), icon: abs(img && img.getAttribute("src")), bid: T(Q(".market-quotes__td--bid", tr)), ask: T(Q(".market-quotes__td--ask", tr)), spread: T(Q(".market-quotes__td--spread", tr)), commission: T(Q(".market-quotes__td--commission", tr)) }; }).filter((q) => q.broker);
  out.sessions = QA(".market__session").map((tr) => ({ name: T(Q(".market__session-title", tr)), local: T(Q(".market__session-time", tr)).replace(/ local$/, ""), active: tr.classList.contains("market__session--active"), detail: T(Q(".market__session-block--details", tr)) })).filter((s) => s.name);
  out.scanners = QA(".mds_scanner").map((sc) => { const seen = new Set(), inst = [];
    QA("[data-instrument]", sc).map((e) => e.getAttribute("data-instrument")).concat(QA("th, td", sc).map(T)).forEach((x) => { x = String(x || "").trim(); if (/^[A-Za-z0-9.]{2,16}\/[A-Za-z0-9.]{2,16}$/.test(x) && !seen.has(x)) { seen.add(x); inst.push(x); } });
    return { title: T(Q("h2", sc)), instruments: inst }; });
  out.bankRates = QA(".bankrate__rate").map((li) => ({ currency: li.getAttribute("data-currency"), rate: T(Q(".rate", li)) }));
  return JSON.stringify(out);
})()`;

/* page Forex Factory dans une fenêtre cachée ; attend que les scanners aient chargé (max ~15 s) */
async function page(BrowserWindow, slug, opts = {}) {
  slug = slugOf(slug) || "eurusd";
  const w = new BrowserWindow({ width: 1400, height: 1000, show: false, paintWhenInitiallyHidden: true,
    webPreferences: { partition: opts.partition || "persist:forexfactory", contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  try {
    await w.loadURL(PAGE(slug), { userAgent: opts.userAgent });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let k = 0; k < 30; k++) { // Cloudflare / scanners en cours de chargement
      const ready = await w.webContents.executeJavaScript(`!!document.querySelector(".market-instrument") && !document.querySelector(".mds_scanner--loading")`).catch(() => false);
      if (ready) break; await sleep(500);
    }
    const j = JSON.parse(await w.webContents.executeJavaScript(EXTRACT));
    if (!j.instrument) return { ok: false, reason: "page Forex Factory introuvable (" + slug + ")" };
    return { ok: true, data: j };
  } catch (e) { return { ok: false, reason: String(e.message || e) }; }
  finally { try { w.destroy(); } catch (e) { /* déjà fermée */ } }
}

module.exports = { API, PAGE, INTERVALS, EXTRACT, slugOf, cleanInstrument, parseBars, bars, page };
