/* jarvis-analyseur.js — Jarvis Analyseur (TopstepX, NQ/ES, New York time) — suit le « Protocole » de Rudy
 * Paste in the topstepx.com/trade page (javascript_tool), then call:
 *   await JARVIS.status()            -> layout, charts, symbols, TSX Sessions present?
 *   await JARVIS.layout('STDV Matrix') -> load a saved layout by name (e.g. 'Test STDV', 'Test NWOG & 1st') and wait for it
 *   await JARVIS.stdv()              -> STDV fibs (both directions) for Asian, Pre-London, London, Premarket on every chart (finished sessions only)
 *   await JARVIS.lines()             -> NQ + ES charts: vertical lines, Midnight/8H30 opens, Asia/London/Premarket High-Low (red trendline 2px, stops where price crosses it)
 *   await JARVIS.tops()              -> High/Low of the day (+ qualifying swings): STDV hit by session, macro, H1/m15 sweep, depth Fib (NQ), catchable? -> JARVIS.data
 *   await JARVIS.macros()            -> only macros (XX:50–XX:10, grey) / mini macros (XX:25–XX:35, purple) holding a top/bottom: 2 vertical lines
 *   await JARVIS.nwog()              -> NWOG & 1st: last 5 NWOG + 5 NDOG (10. NWOG / 10. NDOG ; 5. RTH Octant on NWOG > 100 pts only), 1st p.FVG 9h30 / Reflection / Silver Bullet (labels dd/mm)
 *   await JARVIS.nwogStats('/NQ')    -> data for the Notion « NWOG & 1st » page: FVG lifetimes (+ average), NWOG/NDOG levels touched in RTH, reaction, first level
 *   await JARVIS.htf('H4'|'H1'|'m15') -> dealing range (4. OTE), unfilled FVGs of the TF, day reaction
 *   await JARVIS.premarket()          -> 1st p.FVG 7h, 7h/8h/9h lines, Liq Pool (5h–7h)
 *   await JARVIS.fhtData(sym)         -> First Hour of Trading range and which side is taken first
 *   await JARVIS.report()            -> text recap (STDV touched / next targets, opens, liquidity)
 *   await JARVIS.save()              -> save the layout on the server
 * Optional: JARVIS.day = 'YYYY-MM-DD' to work on another New York trading day.
 * SAFETY: this script only reads chart data and draws shapes. It never touches orders/positions.
 * It only removes shapes it created itself (ids kept in localStorage "jarvis:*").
 */
(() => {
  const W = [...document.querySelectorAll('iframe')].map(f => { try { return f.contentWindow; } catch (e) { return null; } })
    .find(w => w && w.tradingViewApi);
  if (!W) throw new Error('Graphique TradingView introuvable (ouvre topstepx.com/trade)');
  const api = W.tradingViewApi;
  const TZ = 'America/New_York';
  const LV = [0, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4, 4.25, 4.5, 4.75];
  const BLACK = '#000000', BLUE = '#2962ff', ORANGE = '#ff9800';
  const lvColor = c => (Number.isInteger(c) ? BLACK : (Math.abs(c % 1 - 0.5) < 1e-9 ? ORANGE : BLUE));

  const parts = ms => {
    const o = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms)).forEach(x => (o[x.type] = x.value));
    return o;
  };
  const nyDate = ms => { const o = parts(ms); return `${o.year}-${o.month}-${o.day}`; };
  const nyHM = s => { const o = parts(s * 1000); return `${o.hour}h${o.minute}`; };
  const macroOf = t => { // XX:50–XX:10 = Macro (hour of the :00), XX:25–XX:35 = mini macro
    const o = parts(t * 1000), H = +o.hour, M = +o.minute;
    if (M >= 50) return `Macro ${H + 1}h`;
    if (M < 10) return `Macro ${H}h`;
    if (M >= 25 && M < 35) return `Mini macro ${H}h30`;
    return 'hors macro';
  };
  const ny = (d, h, m) => { // New York wall time -> unix seconds
    const [Y, M, D] = d.split('-').map(Number), want = Date.UTC(Y, M - 1, D, h, m);
    let g = want;
    for (let i = 0; i < 3; i++) { const o = parts(g); g += want - Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute); }
    return Math.floor(g / 1000);
  };
  const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const day = () => {
    if (J.day) return J.day;
    let d = nyDate(Date.now());
    const wd = new Date(d + 'T12:00:00Z').getUTCDay();
    if (wd === 6) d = addDays(d, -1); // Saturday -> Friday
    if (wd === 0 && parts(Date.now()).hour < 18) d = addDays(d, -2); // Sunday before the open -> Friday
    else if (wd === 0) d = addDays(d, 1); // Sunday evening -> Monday's session
    return d;
  };
  const now = () => Math.min(Math.floor(Date.now() / 1000), J.day ? ny(J.day, 17, 0) : Infinity); // past day: stop at 17h NY
  const root = s => { s = String(s || '').toUpperCase(); return s.includes('NQ') ? '/NQ' : (s.includes('ES') ? '/ES' : null); };

  const cache = {};
  async function bars(sym, from, to) {
    const k = sym + from + to;
    if (cache[k]) return cache[k];
    const h = { Authorization: 'Bearer ' + localStorage.getItem('token') };
    const cb = Math.min(5000, Math.ceil((to - from) / 60) + 10);
    const r = await fetch(`https://chartapi.topstepx.com/History?Symbol=${encodeURIComponent(sym)}&Resolution=1&Countback=${cb}&From=${from}&To=${to}`, { headers: h });
    if (r.status === 401) throw new Error('TopstepX déconnecté (401) — reconnexion nécessaire');
    const j = await r.json();
    const t = (j.t || []).map(x => (x > 1e12 ? Math.floor(x / 1000) : x));
    const out = t.map((x, i) => ({ t: x, o: j.o[i], h: j.h[i], l: j.l[i], c: j.c[i] })).filter(b => b.t >= from && b.t <= to).sort((a, b) => a.t - b.t);
    return (cache[k] = out);
  }
  async function barsRes(sym, res, from, to) {
    const h = { Authorization: 'Bearer ' + localStorage.getItem('token') };
    const step = { '240': 14400, '60': 3600, '15': 900, '5': 300, '1': 60 }[res] || 60;
    const cb = Math.min(5000, Math.ceil((to - from) / step) + 10);
    const j = await (await fetch(`https://chartapi.topstepx.com/History?Symbol=${encodeURIComponent(sym)}&Resolution=${res}&Countback=${cb}&From=${from}&To=${to}`, { headers: h })).json();
    return (j.t || []).map((x, i) => ({ t: x > 1e12 ? Math.floor(x / 1000) : x, o: j.o[i], h: j.h[i], l: j.l[i], c: j.c[i] })).filter(b => b.t >= from && b.t <= to).sort((a, b) => a.t - b.t);
  }
  // FVG list incl. Volume Imbalances (body edge when consecutive bodies don't overlap)
  function fvgList(all) {
    const bH = b => Math.max(b.o, b.c), bL = b => Math.min(b.o, b.c), fv = [];
    for (let j = 2; j < all.length; j++) {
      const c1 = all[j - 2], c2 = all[j - 1], c3 = all[j];
      const bBot = bL(c2) > bH(c1) ? bH(c1) : c1.h, bTop = bL(c3) > bH(c2) ? bL(c3) : c3.l;
      const sTop = bH(c2) < bL(c1) ? bL(c1) : c1.l, sBot = bL(c2) > bH(c3) ? bH(c3) : c3.h;
      if (c2.c > c2.o && bTop > bBot) fv.push({ type: 'BISI', bot: bBot, top: bTop, t1: c1.t, t3: c3.t, vi: bBot !== c1.h || bTop !== c3.l });
      else if (c2.c < c2.o && sTop > sBot) fv.push({ type: 'SIBI', bot: sBot, top: sTop, t1: c1.t, t3: c3.t, vi: sTop !== c1.l || sBot !== c3.h });
    }
    return fv;
  }
  const stats = bs => {
    if (!bs.length) return null;
    let hi = -Infinity, lo = Infinity, tHi = 0, tLo = 0;
    bs.forEach(b => { if (b.h > hi) { hi = b.h; tHi = b.t; } if (b.l < lo) { lo = b.l; tLo = b.t; } });
    return { hi, lo, tHi, tLo, open: bs[0].o, last: bs[bs.length - 1].c };
  };

  function sessions(d) {
    const p = addDays(d, -1);
    return [
      { key: 'asia', name: 'Asian', from: ny(p, 20, 0), to: ny(d, 0, 0) },
      { key: 'prelon', name: 'Pré-London', from: ny(d, 1, 30), to: ny(d, 2, 0) },
      { key: 'london', name: 'London', from: ny(d, 2, 0), to: ny(d, 5, 0) },
      { key: 'pm', name: 'Premarket', from: ny(d, 7, 0), to: ny(d, 9, 0) },
    ];
  }
  async function sessionData(sym, d) {
    const out = [];
    for (const s of sessions(d)) {
      if (s.from > now()) { out.push({ ...s, missing: 'pas encore commencée' }); continue; }
      const end = Math.min(s.to, now());
      const st = stats((await bars(sym, ny(addDays(d, -1), 18, 0), now())).filter(b => b.t >= s.from && b.t < end));
      out.push(st ? { ...s, ...st, partial: s.to > now() } : { ...s, missing: 'aucune donnée' });
    }
    return out;
  }

  // shape bookkeeping: only shapes created by Jarvis are removed
  // in a multi-chart layout, draw a timeframe only on the chart(s) showing that resolution (else on every chart)
  const targets = res => { const all = [...Array(api.chartsCount()).keys()]; const m = all.filter(i => api.chart(i).resolution() === res); return m.length ? m : all; };
  const keyOf = (i, g) => `jarvis:${api.layoutId ? api.layoutId() : api.layoutName()}:${i}:${g}`;
  function clearGroup(i, g) {
    const c = api.chart(i), k = keyOf(i, g);
    const ids = JSON.parse(W.localStorage.getItem(k) || '[]');
    const exist = new Set(c.getAllShapes().map(s => s.id));
    ids.forEach(id => { if (exist.has(id)) { try { c.removeEntity(id); } catch (e) { /* ignore */ } } });
    W.localStorage.removeItem(k);
  }
  function keep(i, g, ids) { W.localStorage.setItem(keyOf(i, g), JSON.stringify(ids.filter(Boolean))); }
  // TradingView only anchors a drawing on a bar it has loaded: a point older than the loaded history
  // lands on a wrong bar. Scroll the chart back to `from` so it loads that history, then restore the view.
  async function loadHistory(c, from) {
    let prev = null;
    try { prev = c.getVisibleRange(); } catch (e) { /* ignore */ }
    for (let k = 0; k < 3; k++) {
      try { await c.setVisibleRange({ from: from - 3600, to: from + 6 * 3600 }); } catch (e) { /* ignore */ }
      await new Promise(r => setTimeout(r, 2500));
      try { if (c.getVisibleRange().from <= from) break; } catch (e) { break; }
    }
    if (prev) { try { await c.setVisibleRange(prev); } catch (e) { /* ignore */ } }
  }
  const anchoredAt = (c, id) => { try { return Math.min(...c.getShapeById(id).getPoints().map(p => p.time)); } catch (e) { return null; } };

  // Rudy's saved Fibonacci templates (TopstepX "Save drawing template"): GHAITH 2, Profondeur de marché…
  const tpls = {};
  async function tpl(name, tool = 'LineToolFibRetracement') {
    const key = tool + '/' + name;
    if (key in tpls) return tpls[key];
    try {
      const h = { Authorization: 'Bearer ' + localStorage.getItem('token') };
      const r = await fetch('https://userapi.topstepx.com/drawing-templates/content/' + tool + '/' + encodeURIComponent(name), { headers: h });
      let j = await r.json();
      if (typeof j.content === 'string') j = JSON.parse(j.content); else if (j.content) j = j.content;
      tpls[key] = j && typeof j === 'object' && Object.keys(j).length > 3 ? j : null;
    } catch (e) { tpls[key] = null; }
    return tpls[key];
  }
  // Fibonacci with level 0 at `base` and level 1 at `far` (extensions continue beyond `far`)
  async function fib(c, tA, tB, base, far, tplName = 'GHAITH 2') {
    let props = await tpl(tplName);
    if (!props) {
      props = { showCoeffs: true, showPrices: false, extendLines: false, extendLinesLeft: false, fillBackground: false, reverse: true,
        horzLabelsAlign: 'left', coeffsAsPercents: false, trendline: { visible: false }, levelsStyle: { linewidth: 2, linestyle: 0 } };
      for (let n = 1; n <= 24; n++) {
        const c0 = LV[n - 1];
        props['level' + n] = c0 === undefined ? { visible: false } : { coeff: c0, color: lvColor(c0), visible: true };
      }
    }
    // reverse=true: price(c) = p1 + (p2 - p1)·c ; reverse=false: price(c) = p2 + (p1 - p2)·c
    const pts = props.reverse ? [{ time: tA, price: base }, { time: tB, price: far }] : [{ time: tA, price: far }, { time: tB, price: base }];
    const id = await c.createMultipointShape(pts, { shape: 'fib_retracement', lock: false });
    try { c.getShapeById(id).setProperties(props); } catch (e) { /* keep default style */ }
    return id;
  }

  const J = {
    day: null,
    async status() {
      const n = api.chartsCount(), charts = [];
      for (let i = 0; i < n; i++) {
        const c = api.chart(i);
        charts.push({ i, symbol: c.symbol(), res: c.resolution(), shapes: c.getAllShapes().length,
          tsxSessions: c.getAllStudies().some(s => /session/i.test(s.name)) });
      }
      return { url: location.href, layout: api.layoutName(), split: api.layout(), day: day(), nowNY: nyHM(now()), charts };
    },
    async layout(name, wait = 7000) {
      const list = await new Promise(r => api.getSavedCharts(r));
      const it = list.find(x => x.name === name);
      if (!it) return { ok: false, error: `Mise en page « ${name} » introuvable`, available: list.map(x => x.name) };
      if (api.layoutName() !== name) { api.loadChartFromServer(it); await new Promise(r => setTimeout(r, wait)); }
      return { ok: api.layoutName() === name, layout: api.layoutName(), charts: api.chartsCount() };
    },
    async stdv() {
      const d = day(), done = [];
      for (let i = 0; i < api.chartsCount(); i++) {
        const c = api.chart(i), sym = root(c.symbol());
        if (!sym) continue;
        clearGroup(i, 'stdv');
        const ids = [];
        for (const s of await sessionData(sym, d)) {
          if (s.missing || s.hi === s.lo) continue;
          if (s.partial) { done.push(`${c.symbol()} ${s.name} en cours : pas tracée (le range bouge encore)`); continue; }
          const tA = s.from, tB = s.to - 60; // 1re → dernière bougie de la session
          // low -> high : extensions below the low ; high -> low : extensions above the high
          ids.push(await fib(c, tA, tB, s.hi, s.lo)); // extensions below the low
          ids.push(await fib(c, tA, tB, s.lo, s.hi)); // extensions above the high
          done.push(`${c.symbol()} ${s.name} H ${s.hi} / L ${s.lo}`);
        }
        keep(i, 'stdv', ids);
      }
      return done;
    },
    async lines() {
      const d = day(), done = [];
      for (let i = 0; i < api.chartsCount(); i++) {
      const c = api.chart(i), sym = root(c.symbol());
      if (!sym) continue;
      clearGroup(i, 'lines');
      const ids = [];
      done.push(`${c.symbol()} :`);
      const vline = async (h, m, text) => {
        ids.push(await c.createShape({ time: ny(d, h, m) }, { shape: 'vertical_line', text, lock: false,
          overrides: { linecolor: BLACK, linestyle: 1, linewidth: 1, showLabel: true, textcolor: BLACK, horzLabelsAlign: 'right', vertLabelsAlign: 'top', textOrientation: 'vertical' } }));
        done.push(`| ${text} ${h}h${String(m).padStart(2, '0')}`);
      };
      const ray = async (t, price, text, opts = {}) => {
        ids.push(await c.createShape({ time: t, price }, { shape: 'horizontal_ray', text, lock: false,
          overrides: { linecolor: BLACK, linestyle: opts.style ?? 1, linewidth: opts.width ?? 1, showLabel: true, textcolor: BLACK,
            horzLabelsAlign: 'right', vertLabelsAlign: opts.below ? 'bottom' : 'top' } }));
        done.push(`— ${text} ${price}`);
      };
      await vline(7, 0, 'Pre-Market Open');
      await vline(9, 0, 'Pre-Market Close');
      await vline(9, 30, 'NYO');
      await vline(11, 30, 'Lunch');
      const all = await bars(sym, ny(addDays(d, -1), 18, 0), now());
      const at = t => all.find(b => b.t >= t && b.t < t + 60);
      const mo = at(ny(d, 0, 0)); if (mo) await ray(mo.t, mo.o, 'Midnight Open');
      const o830 = at(ny(d, 8, 30)); if (o830) await ray(o830.t, o830.o, '8H30 Open'); else done.push('8H30 Open : pas encore formé');
      // Asia / London / Premarket High & Low : trendline rouge 2px, texte 12 gras à droite, du point extrême jusqu'à la bougie qui le traverse (sinon jusqu'à maintenant, au plus tard 16h)
      const RED = '#ff0000', end = Math.min(now(), ny(d, 16, 0)), NAMES = { asia: 'Asia', london: 'London', pm: 'Premarket' };
      for (const s of (await sessionData(sym, d)).filter(s => NAMES[s.key] && !s.missing && !s.partial)) {
        const name = NAMES[s.key];
        for (const [side, p, t0, broke] of [['High', s.hi, s.tHi, b => b.h > s.hi], ['Low', s.lo, s.tLo, b => b.l < s.lo]]) {
          const hit = all.find(b => b.t >= s.to && b.t <= end && broke(b)), t1 = hit ? hit.t : end;
          ids.push(await c.createMultipointShape([{ time: t0, price: p }, { time: t1, price: p }], {
            shape: 'trend_line', text: `${name} ${side}`, lock: false,
            overrides: { linecolor: RED, linewidth: 2, linestyle: 0, extendLeft: false, extendRight: false, showLabel: true, textcolor: RED,
              fontsize: 12, bold: true, horzLabelsAlign: 'right', vertLabelsAlign: side === 'High' ? 'top' : 'bottom' } }));
          done.push(`— ${name} ${side} ${p} ${hit ? '(traversé à ' + nyHM(hit.t) + ')' : '(non traversé)'}`);
        }
      }
      keep(i, 'lines', ids);
      }
      return done;
    },
    // Top and bottom of the day (+ intermediate swings that qualify): was the move catchable?
    // Data per extreme: STDV levels touched (which sessions), macro window, liquidity swept (H1 swing first, then m15).
    // Draws STDV hit, swept liquidity, "Profondeur de marché" Fib (NQ). Result also in JARVIS.data (JSON).
    async tops(opts = {}) {
      const d = day(), found = [];
      const fmt = p => (Math.round(p * 4) / 4).toFixed(2);
      for (let i = 0; i < api.chartsCount(); i++) {
        const c = api.chart(i), sym = root(c.symbol());
        if (!sym) continue;
        const draw = opts.draw !== false;
        if (draw) clearGroup(i, 'tops');
        const used = new Set(), ids = [], isNQ = sym === '/NQ', tol = opts.tol ?? (isNQ ? 6 : 1.5), zone = opts.zone ?? (isNQ ? 30 : 7), N = opts.pivot ?? 15;
        const all = await bars(sym, ny(addDays(d, -1), 18, 0), now());
        if (!all.length) continue;
        const sess = (await sessionData(sym, d)).filter(s => !s.missing && !s.partial && s.hi > s.lo);
        const ext = LV.filter(k => k > 1);
        const lv = (s, up) => ext.map(k => ({ k, p: up ? s.hi + (k - 1) * (s.hi - s.lo) : s.lo - (k - 1) * (s.hi - s.lo) }));
        const agg = min => {
          const m = new Map();
          for (const b of all) {
            const k = Math.floor(b.t / (min * 60)) * min * 60, x = m.get(k);
            if (!x) m.set(k, { t: k, h: b.h, l: b.l }); else { x.h = Math.max(x.h, b.h); x.l = Math.min(x.l, b.l); }
          }
          return [...m.values()].sort((a, b) => a.t - b.t);
        };
        const swings = [];
        for (const [tf, min] of [['H1', 60], ['m15', 15]]) {
          const a = agg(min);
          for (let j = 1; j < a.length - 1; j++) {
            if (a[j].h > a[j - 1].h && a[j].h > a[j + 1].h) swings.push({ tf, side: 'BSL', p: a[j].h, t: a[j].t, conf: a[j + 1].t + min * 60 });
            if (a[j].l < a[j - 1].l && a[j].l < a[j + 1].l) swings.push({ tf, side: 'SSL', p: a[j].l, t: a[j].t, conf: a[j + 1].t + min * 60 });
          }
        }
        const analyse = (b, isH) => {
          const P = isH ? b.h : b.l, hits = [];
          for (const s of sess.filter(s => s.to <= b.t)) {
            // zone: from `zone` pts inside the move up to `tol` beyond the extreme (price traded through the level)
            const L = lv(s, isH).filter(x => (isH ? x.p <= P + tol && x.p >= P - zone : x.p >= P - tol && x.p <= P + zone)).sort((x, y) => Math.abs(x.p - P) - Math.abs(y.p - P));
            if (L.length) hits.push({ ...L[0], s });
          }
          const sw = swings.filter(w => w.side === (isH ? 'BSL' : 'SSL') && w.conf <= b.t && (isH ? w.p < P : w.p > P)).map(w => {
            const tk = all.find(x => x.t >= w.conf && (isH ? x.h > w.p : x.l < w.p));
            return tk && tk.t <= b.t && tk.t >= b.t - 90 * 60 ? { ...w, takenT: tk.t } : null;
          }).filter(Boolean);
          // H1 swing first, then m15 ; within a timeframe the one closest to the extreme
          const pick = tf => sw.filter(w => w.tf === tf).sort((x, y) => (isH ? y.p - x.p : x.p - y.p))[0];
          const liq = pick('H1') || pick('m15') || null;
          const mac = macroOf(b.t);
          const ok = hits.length >= (opts.minStdv ?? 2) && !!liq;
          return { i, sym, isH, P, t: b.t, hits, liq, macro: mac, catchable: ok };
        };
        const from = ny(d, 2, 0), to = Math.min(ny(d, 16, 0), now());
        const day = all.filter(b => b.t >= ny(d, 0, 0) && b.t <= to); // day = Midnight Open → 16h (STDV levels exist)
        if (!day.length) continue;
        const hiB = day.reduce((a, b) => (b.h > a.h ? b : a)), loB = day.reduce((a, b) => (b.l < a.l ? b : a));
        const res = [{ ...analyse(hiB, true), dayExtreme: 'High du jour' }, { ...analyse(loB, false), dayExtreme: 'Low du jour' }];
        res.forEach(r => r.liq && used.add(r.liq.side + r.liq.t + r.liq.p));
        for (let j = 0; j < all.length; j++) {
          const b = all[j];
          if (b.t < from || b.t > to || j + N >= all.length || b === hiB || b === loB) continue;
          const win = all.slice(Math.max(0, j - N), j + N + 1);
          for (const isH of [true, false]) {
            const P = isH ? b.h : b.l;
            if (win.some(x => (isH ? x.h > P : x.l < P)) || win.find(x => (isH ? x.h : x.l) === P) !== b) continue;
            const r = analyse(b, isH);
            if (!r.catchable) continue;
            const lk = r.liq.side + r.liq.t + r.liq.p;
            if (used.has(lk)) continue; // same liquidity already used
            used.add(lk);
            res.push(r);
          }
        }
        res.sort((a, b) => a.t - b.t);
        for (const r of res) {
          const isH = r.isH;
          if (!draw) { if (r.liq && isNQ) r.depth = isH ? Math.floor((r.liq.p - 1e-6) / 10) * 10 : Math.ceil((r.liq.p + 1e-6) / 10) * 10; found.push(r); continue; }
          for (const h of r.hits) {
            ids.push(await c.createMultipointShape([{ time: r.t - 25 * 60, price: h.p }, { time: r.t + 35 * 60, price: h.p }], {
              shape: 'trend_line', text: `${h.k} ${h.s.name} (${fmt(h.p)})`, lock: false,
              overrides: { linecolor: lvColor(h.k), linewidth: 1, linestyle: 0, extendLeft: false, extendRight: false, showLabel: true, textcolor: lvColor(h.k), horzLabelsAlign: 'right', vertLabelsAlign: isH ? 'top' : 'bottom', fontsize: 11 } }));
          }
          if (r.liq) {
            ids.push(await c.createMultipointShape([{ time: r.liq.t, price: r.liq.p }, { time: r.liq.takenT, price: r.liq.p }], {
              shape: 'trend_line', text: `${r.liq.side} ${r.liq.tf}`, lock: false,
              overrides: { linecolor: '#f23645', linewidth: 1, linestyle: 0, extendLeft: false, extendRight: false, showLabel: true, textcolor: '#f23645', horzLabelsAlign: 'right', vertLabelsAlign: isH ? 'top' : 'bottom', fontsize: 11 } }));
            if (isNQ) {
              const base = isH ? Math.floor((r.liq.p - 1e-6) / 10) * 10 : Math.ceil((r.liq.p + 1e-6) / 10) * 10;
              ids.push(await fib(c, r.liq.takenT - 4 * 60, r.liq.takenT, base, isH ? base + 10 : base - 10, 'Profondeur de marché'));
              r.depth = base;
            }
          }
          found.push(r);
        }
        if (draw) keep(i, 'tops', ids);
      }
      J.data = found.map(f => ({ date: d, actif: f.sym.slice(1), type: f.isH ? 'Top' : 'Bottom', extreme: f.dayExtreme || 'Swing', heure_ny: nyHM(f.t), prix: +fmt(f.P),
        macro: f.macro, stdv: f.hits.map(h => ({ niveau: h.k, session: h.s.name, prix: +fmt(h.p) })),
        liquidite: f.liq ? { type: f.liq.side, tf: f.liq.tf, prix: +fmt(f.liq.p), sweep_ny: nyHM(f.liq.takenT) } : null,
        profondeur_depuis: f.depth ?? null, catch_possible: f.catchable }));
      return found.length ? found.map(f => `${f.sym.slice(1)} ${f.dayExtreme || (f.isH ? 'Top' : 'Bottom')} ${nyHM(f.t)} @ ${fmt(f.P)} · ${f.macro} · ` +
        (f.hits.length ? 'STDV ' + f.hits.map(h => `${h.k} ${h.s.name} (${fmt(h.p)})`).join(' + ') : 'aucun STDV') +
        (f.liq ? ` · ${f.liq.side} ${f.liq.tf} ${fmt(f.liq.p)} sweep ${nyHM(f.liq.takenT)}` : ' · pas de sweep H1/m15') +
        (f.depth ? ` · profondeur depuis ${f.depth.toFixed(2)}` : '') + ` → catch ${f.catchable ? 'POSSIBLE ✅' : 'non ❌'}`).join('\n')
        : 'Aucune donnée';
    },
    // Only the macros (XX:50–XX:10) / mini macros (XX:25–XX:35) where a top/bottom of the day formed: two vertical lines each
    async macros() {
      const d = day(), out = [];
      await J.tops({ draw: false });
      const rows = J.data || [];
      for (let i = 0; i < api.chartsCount(); i++) {
        const c = api.chart(i), sym = root(c.symbol());
        if (!sym) continue;
        clearGroup(i, 'macros');
        const ids = [], seen = new Set();
        const vl = async (t, text, color) => ids.push(await c.createShape({ time: t }, { shape: 'vertical_line', text, lock: false,
          overrides: { linecolor: color, linestyle: 2, linewidth: 1, showLabel: !!text, textcolor: color, horzLabelsAlign: 'right', vertLabelsAlign: 'bottom', textOrientation: 'vertical' } }));
        for (const r of rows.filter(r => r.actif === sym.slice(1) && r.macro !== 'hors macro')) {
          if (seen.has(r.macro)) continue;
          seen.add(r.macro);
          const m = r.macro.match(/(\d+)h(30)?$/), H = +m[1];
          if (m[2]) { await vl(ny(d, H, 25), r.macro, '#9c27b0'); await vl(ny(d, H, 35), '', '#9c27b0'); }
          else { await vl(H === 0 ? ny(addDays(d, -1), 23, 50) : ny(d, H - 1, 50), r.macro, '#787b86'); await vl(ny(d, H, 10), '', '#787b86'); }
        }
        keep(i, 'macros', ids);
        out.push(`${c.symbol()} : ${[...seen].join(', ') || 'aucune macro utile'}`);
      }
      return out;
    },
    // ---- NWOG & 1st protocol (layout "NWOG & 1st Matrix") ----
    // Gaps: NWOG = Friday 16:59 close → Sunday 18:00 open (label = Monday dd/mm) ; NDOG = 16:59 close → 18:00 open Mon–Thu (label = close day dd/mm)
    async gapsData(sym, n = 5) {
      const ref = day(), out = [];
      const closeOpen = async (cd, od) => {
        const a = await bars(sym, ny(cd, 16, 40), ny(cd, 17, 0)), b = await bars(sym, ny(od, 18, 0), ny(od, 18, 15));
        const cl = a.filter(x => x.t < ny(cd, 17, 0)).pop(), op = b[0];
        return cl && op ? { close: cl.c, open: op.o, tClose: cl.t, t: op.t, top: Math.max(cl.c, op.o), bot: Math.min(cl.c, op.o) } : null;
      };
      const dm = d => d.slice(8, 10) + '/' + d.slice(5, 7);
      // NWOG: last n weeks
      let mon = ref; while (new Date(mon + 'T12:00:00Z').getUTCDay() !== 1) mon = addDays(mon, -1);
      for (let k = 0; k < n; k++, mon = addDays(mon, -7)) {
        const g = await closeOpen(addDays(mon, -3), addDays(mon, -1));
        if (g && g.top > g.bot) out.push({ kind: 'NWOG', label: 'NWOG ' + dm(mon), date: mon, ...g });
      }
      // NDOG: last n Mon–Thu evenings strictly before the reference session
      let d = addDays(ref, -1), got = 0;
      while (got < n) {
        const wd = new Date(d + 'T12:00:00Z').getUTCDay();
        if (wd >= 1 && wd <= 4 && ny(d, 18, 0) <= now()) {
          const g = await closeOpen(d, d);
          if (g && g.top > g.bot) { out.push({ kind: 'NDOG', label: 'NDOG ' + dm(d), date: d, ...g }); got++; } else got++;
        }
        d = addDays(d, -1);
        if (d < addDays(ref, -30)) break;
      }
      return out;
    },
    // 1st p.FVG after 9:30, its Reflection (first FVG of the opposite type) and the Silver Bullet FVG (10:00–11:00)
    async fvgData(sym, d = day()) {
      const all = await bars(sym, ny(d, 9, 30), Math.min(now(), ny(d, 16, 0)));
      const fv = [];
      // FVG including Volume Imbalances: when the bodies of two consecutive candles don't overlap (VI),
      // the zone edge on that side is the candle body instead of the wick (matches Rudy's boxes 29/10, 30/10, 06/11)
      const bH = b => Math.max(b.o, b.c), bL = b => Math.min(b.o, b.c);
      for (let j = 2; j < all.length; j++) {
        const c1 = all[j - 2], c2 = all[j - 1], c3 = all[j];
        const bBot = bL(c2) > bH(c1) ? bH(c1) : c1.h, bTop = bL(c3) > bH(c2) ? bL(c3) : c3.l; // BISI
        const sTop = bH(c2) < bL(c1) ? bL(c1) : c1.l, sBot = bL(c2) > bH(c3) ? bH(c3) : c3.h; // SIBI
        if (c2.c > c2.o && bTop > bBot) fv.push({ type: 'BISI', bot: bBot, top: bTop, t1: c1.t, t3: c3.t, vi: bBot !== c1.h || bTop !== c3.l });
        else if (c2.c < c2.o && sTop > sBot) fv.push({ type: 'SIBI', bot: sBot, top: sTop, t1: c1.t, t3: c3.t, vi: sTop !== c1.l || sBot !== c3.h });
      }
      const first = fv[0] || null;
      const refl = first ? fv.find(f => f.type !== first.type && f.t1 > first.t1) || null : null;
      const sb = fv.find(f => f.t1 >= ny(d, 10, 0) && f.t3 < ny(d, 11, 0)) || null;
      return { first, refl, sb, all };
    },
    // Data for the "NWOG & 1st" homework: FVG lifetimes, NWOG/NDOG levels touched during RTH and the reaction
    async nwogStats(sym = '/NQ', d = day()) {
      const thr = sym === '/NQ' ? 20 : 5, tol = sym === '/NQ' ? 1 : 0.25, end = Math.min(now(), ny(d, 16, 0));
      const rth = await bars(sym, ny(d, 9, 30), end);
      const fd = await J.fvgData(sym, d);
      const life = z => { // minutes until a candle closes through the far side (BISI below / SIBI above)
        if (!z) return null;
        const brk = rth.find(b => b.t > z.t3 && (z.type === 'BISI' ? b.c < z.bot : b.c > z.top));
        return { min: Math.round(((brk ? brk.t : end) - z.t3) / 60), held: !brk };
      };
      const fv = {};
      for (const k of ['first', 'refl', 'sb']) { const z = fd[k]; fv[k] = z ? { ...z, life: life(z) } : null; }
      const lifes = Object.values(fv).filter(Boolean).map(z => z.life.min);
      const gaps = await J.gapsData(sym, 1); // current week NWOG + previous evening NDOG
      const names = { 0: 'Low', 0.125: 'Octant', 0.25: 'Quadrant', 0.375: 'Octant', 0.5: 'CE', 0.625: 'Octant', 0.75: 'Quadrant', 0.875: 'Octant', 1: 'High' };
      const touches = [];
      for (const g of gaps) {
        for (const [k, nm] of Object.entries(names)) {
          const L = g.bot + (g.top - g.bot) * +k, i = rth.findIndex(b => b.l - tol <= L && b.h + tol >= L);
          if (i < 1) continue;
          const from = rth[i - 1].c >= L ? 'dessus' : 'dessous', next = rth.slice(i, i + 31);
          const away = from === 'dessus' ? next.some(b => b.h >= L + thr) : next.some(b => b.l <= L - thr);
          const crossed = from === 'dessus' ? next.some(b => b.c < L - tol) : next.some(b => b.c > L + tol);
          const beyond = from === 'dessus' ? next.some(b => b.l <= L - thr) : next.some(b => b.h >= L + thr);
          let reaction = 'Traversé';
          if (away && !crossed) reaction = 'Rejet';
          else if (crossed && !beyond) reaction = 'Support/Résistance';
          touches.push({ gap: g.kind, label: g.label, level: `${nm} ${g.kind}`, coeff: +k, price: +L.toFixed(2), t: rth[i].t, from, reaction });
        }
      }
      touches.sort((a, b) => a.t - b.t);
      return { date: d, fvg: fv, avgLife: lifes.length ? Math.round(lifes.reduce((a, b) => a + b, 0) / lifes.length) : null, gaps, touches,
        first: touches[0] || null };
    },
    async nwog(opts = {}) {
      const d = day(), dm = d.slice(8, 10) + '/' + d.slice(5, 7), out = [];
      const rectTpl = { NWOG: '10. NWOG', NDOG: '10. NDOG', first: '8. 1st p.FVG 9h30', refl: '9. 1st p.FVG Reflection', sb: '9. 1st p.FVG Silver Bullet' };
      for (let i = 0; i < api.chartsCount(); i++) {
        const c = api.chart(i), sym = root(c.symbol());
        if (!sym) continue;
        clearGroup(i, 'nwog');
        const ids = [], tickTol = sym === '/NQ' ? 0.5 : 0.25;
        // existing rectangles (Rudy's or older) to verify / fix instead of duplicating
        const rects = c.getAllShapes().filter(s => s.name === 'rectangle').map(s => {
          try { const sh = c.getShapeById(s.id), p = sh.getPoints(); return { id: s.id, sh, top: Math.max(p[0].price, p[1].price), bot: Math.min(p[0].price, p[1].price), t: Math.min(p[0].time, p[1].time) }; } catch (e) { return null; }
        }).filter(Boolean);
        const fibs = c.getAllShapes().filter(s => s.name === 'fib_retracement').map(s => { try { return c.getShapeById(s.id).getPoints().map(p => p.price).sort((a, b) => a - b); } catch (e) { return null; } }).filter(Boolean);
        const usedR = new Set();
        const place = async (z, tplName, text, tA, tB, win = 300, create = true) => {
          const props = (await tpl(tplName, 'LineToolRectangle')) || {};
          // same zone: exact bounds (gaps) or, for an FVG, a rectangle starting within 5 min that overlaps it (drawn by hand)
          const free = rects.filter(r => !usedR.has(r.id));
          const ex = free.find(r => Math.abs(r.top - z.top) <= tickTol && Math.abs(r.bot - z.bot) <= tickTol) ||
            (z.t1 ? free.filter(r => Math.abs(r.t - z.t1) <= win && r.bot < z.top && r.top > z.bot).sort((a, b) => Math.abs(a.t - z.t1) - Math.abs(b.t - z.t1))[0] : null);
          if (ex) usedR.add(ex.id);
          if (!ex && !create) return null;
          const pts = [{ time: tA, price: z.top }, { time: tB, price: z.bot }];
          const off = id => { const t = anchoredAt(c, id); return t !== null && Math.abs(t - tA) > 120 ? ` (⚠️ ancré à ${nyHM(t)} au lieu de ${nyHM(tA)})` : ''; };
          if (ex) { try { ex.sh.setPoints(pts); ex.sh.setProperties({ ...props, text, showLabel: true }); } catch (e) { /* ignore */ } return 'corrigé' + off(ex.id); }
          const id = await c.createMultipointShape(pts, { shape: 'rectangle', text, lock: false });
          try { c.getShapeById(id).setProperties({ ...props, text, showLabel: true }); } catch (e) { /* ignore */ }
          ids.push(id);
          return 'ajouté' + off(id);
        };
        const gaps = await J.gapsData(sym, opts.n ?? 5);
        if (gaps.length) await loadHistory(c, Math.min(...gaps.map(g => g.t)));
        for (const g of gaps) {
          const st = await place(g, rectTpl[g.kind], g.label, g.t, g.t + 3600);
          // octants (5. RTH Octant): NWOG of more than 100 points only, unless already drawn on the same bounds
          if (g.kind === 'NWOG' && g.top - g.bot > 100 && !fibs.some(f => Math.abs(f[0] - g.bot) <= tickTol && Math.abs(f[1] - g.top) <= tickTol)) ids.push(await fib(c, g.t, g.t + 3600, g.bot, g.top, '5. RTH Octant'));
          out.push(`${c.symbol()} ${g.label} ${g.bot}–${g.top} : ${st}`);
        }
        // 1st p.FVG 9h30 / Reflection / Silver Bullet for the last n trading days
        const days = []; for (let dd = d; days.length < (opts.n ?? 5); dd = addDays(dd, -1)) { const wd = new Date(dd + 'T12:00:00Z').getUTCDay(); if (wd >= 1 && wd <= 5) days.push(dd); }
        for (const dd of days) {
          const dmx = dd.slice(8, 10) + '/' + dd.slice(5, 7), fd = await J.fvgData(sym, dd);
          const kinds = [['first', '9h30'], ['refl', 'Reflection'], ['sb', 'Silver Bullet']], res = {};
          for (const [k, name] of kinds) if (fd[k]) res[k] = await place(fd[k], rectTpl[k], `1st p.FVG ${name} ${dmx}`, fd[k].t1, fd[k].t3, 60, false); // boxes starting on the same minute first
          for (const [k, name] of kinds) {
            const z = fd[k];
            if (!z) { out.push(`${c.symbol()} 1st p.FVG ${name} ${dmx} : aucun`); continue; }
            const st = res[k] || await place(z, rectTpl[k], `1st p.FVG ${name} ${dmx}`, z.t1, z.t3);
            out.push(`${c.symbol()} 1st p.FVG ${name} ${dmx} ${z.type} ${z.bot}–${z.top} (${nyHM(z.t1)}) : ${st}`);
          }
        }
        keep(i, 'nwog', ids);
      }
      return out;
    },
    // ---- H4 / H1 / m15 homework: dealing range (OTE fib "4. OTE"), unfilled FVGs of the TF, what the day touched ----
    async htfData(sym, tf = 'H4', d = day()) {
      const cfg = { H4: ['240', 25], H1: ['60', 6], m15: ['15', 1] }[tf];
      const dayFrom = ny(addDays(d, -1), 18, 0), dayTo = Math.min(now(), ny(d, 17, 0));
      const hist = await barsRes(sym, cfg[0], dayFrom - cfg[1] * 86400, dayFrom - 1);
      const dayBars = await barsRes(sym, cfg[0], dayFrom, dayTo);
      if (hist.length < 10 || !dayBars.length) return null;
      let hi = 0, lo = 0; hist.forEach((b, i) => { if (b.h > hist[hi].h) hi = i; if (b.l < hist[lo].l) lo = i; });
      const down = hi < lo, start = down ? hist[hi] : hist[lo], end = down ? hist[lo] : hist[hi];
      const S = down ? start.h : start.l, E = down ? end.l : end.h, R = S - E;
      const K = [0.5, 0.618, 0.705, 0.786, 0.886], lv = k => +(E + k * R).toFixed(2);
      const dH = Math.max(...dayBars.map(b => b.h)), dL = Math.min(...dayBars.map(b => b.l)), close = dayBars[dayBars.length - 1].c;
      const kMax = down ? (dH - E) / R : (E - dL) / (-R) * -1; // retracement reached by the day (0 = leg end, 1 = leg start)
      const kReach = down ? (dH - E) / R : (dL - E) / R;
      const kClose = +((close - E) / R).toFixed(3);
      const touched = K.filter(k => kReach >= k);
      const zone = kClose < 0 ? 'Au-delà du range' : kClose < 0.5 ? (down ? 'Discount' : 'Premium') : kClose < 0.618 ? (down ? 'Premium' : 'Discount') : kClose <= 0.786 ? 'OTE' : kClose <= 1 ? (down ? 'Premium profond' : 'Discount profond') : 'Range cassé';
      // unfilled FVGs of the leg (retracement side) before the day
      const legBars = hist.filter(b => b.t >= start.t && b.t <= end.t);
      const fv = fvgList(legBars).filter(f => f.type === (down ? 'SIBI' : 'BISI')).filter(f => {
        const after = hist.filter(b => b.t > f.t3);
        return !after.some(b => (down ? b.c > f.top : b.c < f.bot));
      }).filter(f => (down ? f.bot <= E + 0.886 * R : f.top >= E + 0.886 * R)) // inside the retracement range
        .sort((a, b) => (down ? a.bot - b.bot : b.top - a.top)).slice(0, 3); // the 3 closest to the leg end
      const fvr = fv.map(f => {
        const hit = dayBars.find(b => b.h >= f.bot && b.l <= f.top);
        const thru = dayBars.some(b => (down ? b.c > f.top : b.c < f.bot));
        return { ...f, hit: !!hit, hitT: hit ? hit.t : null, reaction: !hit ? 'Pas touché' : thru ? 'Traversé' : 'Rejet' };
      });
      const firstHit = fvr.filter(f => f.hit).sort((a, b) => a.hitT - b.hitT)[0];
      return { tf, sym, down, S, E, tS: start.t, tE: end.t, levels: K.map(k => ({ k, p: lv(k) })), dH, dL, close, kReach: +kReach.toFixed(3), kClose, zone, touched,
        fvgs: fvr, reaction: firstHit ? firstHit.reaction : (touched.length ? 'Niveaux touchés' : 'Pas touché') };
    },
    async htf(tf = 'H4', opts = {}) {
      const d = day(), out = [], res = { H4: '240', H1: '60', m15: '15' }[tf], tg = targets(res);
      for (let i = 0; i < api.chartsCount(); i++) {
        const c = api.chart(i), sym = root(c.symbol());
        if (!sym) continue;
        clearGroup(i, 'htf' + tf);
        if (!tg.includes(i)) continue;
        const x = await J.htfData(sym, tf, d), ids = [];
        if (!x) { out.push(`${c.symbol()} ${tf} : pas de données`); continue; }
        await loadHistory(c, x.tS);
        ids.push(await fib(c, x.tS, x.tE + (x.tE - x.tS) * 0.6, x.E, x.S, '4. OTE'));
        const props = (await tpl('4. FVG', 'LineToolRectangle')) || {};
        for (const f of x.fvgs) {
          const id = await c.createMultipointShape([{ time: f.t1, price: f.top }, { time: f.t3, price: f.bot }], { shape: 'rectangle', text: `${f.type} ${tf}`, lock: false });
          try { c.getShapeById(id).setProperties({ ...props, text: `${f.type} ${tf}${f.vi ? ' (VI)' : ''}`, showLabel: true }); } catch (e) { /* ignore */ }
          ids.push(id);
        }
        keep(i, 'htf' + tf, ids);
        J['last' + tf + sym] = x;
        out.push(`${c.symbol()} ${tf} : ${x.down ? 'leg baissier' : 'leg haussier'} ${x.S}→${x.E} · retracement max ${x.kReach} · clôture ${x.kClose} (${x.zone}) · niveaux ${x.touched.join(', ') || 'aucun'} · ${x.fvgs.length} FVG ${x.fvgs.map(f => f.reaction).join('/')}`);
      }
      return out;
    },
    // ---- Premarket (7h–9h30): 1st p.FVG 7h, 7h/8h/9h lines, liquidity pool (5h–7h high/low) ----
    async pmData(sym, d = day()) {
      const all = await bars(sym, ny(d, 5, 0), Math.min(now(), ny(d, 12, 0)));
      const pre = all.filter(b => b.t < ny(d, 7, 0)), pm = all.filter(b => b.t >= ny(d, 7, 0) && b.t < ny(d, 9, 30));
      const f = fvgList(pm)[0] || null;
      if (f) {
        const brk = all.find(b => b.t > f.t3 && (f.type === 'BISI' ? b.c < f.bot : b.c > f.top));
        const back = all.find(b => b.t > f.t3 + 120 && b.h >= f.bot && b.l <= f.top);
        f.life = brk ? Math.round((brk.t - f.t3) / 60) : null; f.retest = back ? back.t : null;
        f.reaction = !back ? 'Pas revisité' : brk && brk.t <= back.t + 300 ? 'Traversé' : 'Respecté';
      }
      const pool = pre.length ? { hi: Math.max(...pre.map(b => b.h)), lo: Math.min(...pre.map(b => b.l)) } : null;
      if (pool) {
        const after = all.filter(b => b.t >= ny(d, 7, 0));
        const th = after.find(b => b.h > pool.hi), tl = after.find(b => b.l < pool.lo);
        pool.hiT = th ? th.t : null; pool.loT = tl ? tl.t : null;
        pool.tHi = pre.find(b => b.h === pool.hi).t; pool.tLo = pre.find(b => b.l === pool.lo).t;
      }
      return { fvg: f, pool };
    },
    async premarket() {
      const d = day(), dm = d.slice(8, 10) + '/' + d.slice(5, 7), out = [], tg = targets('1');
      for (let i = 0; i < api.chartsCount(); i++) {
        const c = api.chart(i), sym = root(c.symbol());
        if (!sym) continue;
        clearGroup(i, 'pm');
        if (!tg.includes(i)) continue;
        const x = await J.pmData(sym, d), ids = [];
        for (const [h, m] of [[7, 0], [8, 0], [9, 0]]) ids.push(await c.createShape({ time: ny(d, h, m) }, { shape: 'vertical_line', lock: false, overrides: { linecolor: '#787b86', linestyle: 1, linewidth: 1, showLabel: false } }));
        if (x.fvg) {
          const props = (await tpl('7. 1st p.FVG 7h', 'LineToolRectangle')) || {};
          const id = await c.createMultipointShape([{ time: x.fvg.t1, price: x.fvg.top }, { time: x.fvg.t3, price: x.fvg.bot }], { shape: 'rectangle', lock: false });
          try { c.getShapeById(id).setProperties({ ...props, text: `1st p.FVG 7h ${dm}`, showLabel: true }); } catch (e) { /* ignore */ }
          ids.push(id);
        }
        if (x.pool) for (const [p, t, side] of [[x.pool.hi, x.pool.tHi, 'High'], [x.pool.lo, x.pool.tLo, 'Low']]) {
          ids.push(await c.createMultipointShape([{ time: t, price: p }, { time: ny(d, 11, 0), price: p }], { shape: 'trend_line', text: `Liq Pool ${side}`, lock: false,
            overrides: { linecolor: '#f23645', linewidth: 1, linestyle: 0, extendLeft: false, extendRight: false, showLabel: true, textcolor: '#f23645', horzLabelsAlign: 'right', vertLabelsAlign: side === 'High' ? 'top' : 'bottom' } }));
        }
        keep(i, 'pm', ids);
        out.push(`${c.symbol()} Premarket : 1st p.FVG 7h ${x.fvg ? `${x.fvg.type} ${x.fvg.bot}–${x.fvg.top} (${nyHM(x.fvg.t1)}) ${x.fvg.reaction}` : 'aucun'} · Liq Pool H ${x.pool && x.pool.hi} ${x.pool && x.pool.hiT ? 'pris ' + nyHM(x.pool.hiT) : 'non pris'} / L ${x.pool && x.pool.lo} ${x.pool && x.pool.loT ? 'pris ' + nyHM(x.pool.loT) : 'non pris'}`);
      }
      return out;
    },
    // ---- First Hour of Trading (9:30–10:30) ----
    async fhtData(sym, d = day()) {
      const all = await bars(sym, ny(d, 9, 30), Math.min(now(), ny(d, 16, 0)));
      const fh = all.filter(b => b.t < ny(d, 10, 30)), rest = all.filter(b => b.t >= ny(d, 10, 30));
      if (!fh.length) return null;
      const hi = Math.max(...fh.map(b => b.h)), lo = Math.min(...fh.map(b => b.l));
      const th = rest.find(b => b.h > hi), tl = rest.find(b => b.l < lo);
      const first = th && (!tl || th.t < tl.t) ? 'High' : tl ? 'Low' : 'Aucun';
      return { hi, lo, tHi: fh.find(b => b.h === hi).t, tLo: fh.find(b => b.l === lo).t, open: fh[0].o, close: fh[fh.length - 1].c, first, tFirst: first === 'High' ? th.t : first === 'Low' ? tl.t : null };
    },
    async report() {
      const d = day(), lines = [`Jarvis 8H — ${d} (NY ${nyHM(now())})`];
      for (const sym of ['/NQ', '/ES']) {
        const all = await bars(sym, ny(addDays(d, -1), 18, 0), now());
        if (!all.length) { lines.push(`${sym.slice(1)} : pas de données`); continue; }
        const last = all[all.length - 1].c;
        lines.push(`\n${sym.slice(1)} — dernier ${last}`);
        for (const s of await sessionData(sym, d)) {
          if (s.missing) { lines.push(`• ${s.name} : ${s.missing}`); continue; }
          const R = s.hi - s.lo, after = all.filter(b => b.t >= Math.min(s.to, now()));
          const mx = after.length ? Math.max(...after.map(b => b.h)) : -Infinity, mn = after.length ? Math.min(...after.map(b => b.l)) : Infinity;
          const ext = LV.filter(k => k > 1);
          const up = ext.map(k => ({ k, p: +(s.hi + (k - 1) * R).toFixed(2) })), dn = ext.map(k => ({ k, p: +(s.lo - (k - 1) * R).toFixed(2) }));
          const tu = up.filter(x => mx >= x.p).pop(), td = dn.filter(x => mn <= x.p).pop();
          const nu = up.find(x => mx < x.p), nd = dn.find(x => mn > x.p);
          lines.push(`• ${s.name}${s.partial ? ' (en cours)' : ''} H ${s.hi} / L ${s.lo} (range ${R.toFixed(2)}) — ` +
            `haut : ${tu ? tu.k + ' touché' : 'aucun STDV'}${nu ? ', next ' + nu.k + ' @ ' + nu.p : ''} · ` +
            `bas : ${td ? td.k + ' touché' : 'aucun STDV'}${nd ? ', next ' + nd.k + ' @ ' + nd.p : ''}`);
        }
        const at = t => all.find(b => b.t >= t && b.t < t + 60);
        for (const [nm, t] of [['Midnight Open', ny(d, 0, 0)], ['8H30 Open', ny(d, 8, 30)]]) {
          const b = at(t);
          lines.push(b ? `• ${nm} ${b.o} — prix ${last > b.o ? 'au-dessus' : 'en dessous'} (${(last - b.o).toFixed(2)} pts)` : `• ${nm} : pas encore formé`);
        }
        const t7 = ny(d, 7, 0), liq = [];
        for (const s of (await sessionData(sym, d)).filter(s => (s.key === 'asia' || s.key === 'london') && !s.missing && now() >= s.to)) {
          const nm = s.key === 'asia' ? 'Asia' : 'London';
          const pre = all.filter(b => b.t >= s.to && b.t < t7), post = all.filter(b => b.t >= t7);
          for (const [side, p, broke] of [['High', s.hi, b => b.h > s.hi], ['Low', s.lo, b => b.l < s.lo]]) {
            if (pre.some(broke)) continue;
            const hit = post.find(broke);
            liq.push(`${nm} ${side} ${p}${hit ? ' (pris à ' + nyHM(hit.t) + ')' : ' — non pris'}`);
          }
        }
        lines.push('• Liquidités à 7h : ' + (liq.length ? liq.join(' · ') : 'aucune (tout pris avant 7h)'));
      }
      return lines.join('\n');
    },
    async save() {
      return new Promise(r => { try { api.saveChartToServer(() => r('enregistré'), () => r('échec'), {}); } catch (e) { r('erreur: ' + e.message); } setTimeout(() => r('timeout'), 8000); });
    },
  };
  window.JARVIS = J;
  return 'JARVIS prêt';
})();
