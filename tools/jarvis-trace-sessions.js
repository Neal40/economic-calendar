/* jarvis-trace-sessions.js — Jarvis 8H (TopstepX, NQ/ES, New York time)
 * Paste in the topstepx.com/trade page (javascript_tool), then call:
 *   await JARVIS.status()            -> layout, charts, symbols, TSX Sessions present?
 *   await JARVIS.stdv()              -> STDV fibs (both directions) for Asian, Pre-London, London, Premarket on every chart
 *   await JARVIS.lines()             -> NQ chart: vertical lines, Midnight/8H30 opens, untaken Asia/London H/L
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
  const now = () => Math.floor(Date.now() / 1000);
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
  const keyOf = (i, g) => `jarvis:${api.layoutId ? api.layoutId() : api.layoutName()}:${i}:${g}`;
  function clearGroup(i, g) {
    const c = api.chart(i), k = keyOf(i, g);
    const ids = JSON.parse(W.localStorage.getItem(k) || '[]');
    const exist = new Set(c.getAllShapes().map(s => s.id));
    ids.forEach(id => { if (exist.has(id)) { try { c.removeEntity(id); } catch (e) { /* ignore */ } } });
    W.localStorage.removeItem(k);
  }
  function keep(i, g, ids) { W.localStorage.setItem(keyOf(i, g), JSON.stringify(ids.filter(Boolean))); }

  async function fib(c, p1, p2) {
    const id = await c.createMultipointShape([p1, p2], { shape: 'fib_retracement', lock: false });
    const props = { showCoeffs: true, showPrices: false, extendLines: false, extendLinesLeft: false, fillBackground: false, reverse: false,
      horzLabelsAlign: 'left', coeffsAsPercents: false, trendline: { visible: false } };
    for (let n = 1; n <= 24; n++) {
      const c0 = LV[n - 1];
      props['level' + n] = c0 === undefined ? { visible: false } : { coeff: c0, color: lvColor(c0), visible: true };
    }
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
    async stdv() {
      const d = day(), done = [];
      for (let i = 0; i < api.chartsCount(); i++) {
        const c = api.chart(i), sym = root(c.symbol());
        if (!sym) continue;
        clearGroup(i, 'stdv');
        const ids = [];
        for (const s of await sessionData(sym, d)) {
          if (s.missing || s.hi === s.lo) continue;
          const tA = s.from, tB = Math.min(s.to, now());
          // low -> high : extensions below the low ; high -> low : extensions above the high
          ids.push(await fib(c, { time: tA, price: s.lo }, { time: tB, price: s.hi }));
          ids.push(await fib(c, { time: tA, price: s.hi }, { time: tB, price: s.lo }));
          done.push(`${c.symbol()} ${s.name}${s.partial ? ' (en cours)' : ''} H ${s.hi} / L ${s.lo}`);
        }
        keep(i, 'stdv', ids);
      }
      return done;
    },
    async lines() {
      const d = day(), n = api.chartsCount();
      let i = 0;
      for (let k = 0; k < n; k++) if (root(api.chart(k).symbol()) === '/NQ') { i = k; break; }
      const c = api.chart(i), sym = root(c.symbol());
      clearGroup(i, 'lines');
      const ids = [], done = [];
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
      const t7 = ny(d, 7, 0);
      for (const s of (await sessionData(sym, d)).filter(s => (s.key === 'asia' || s.key === 'london') && !s.missing)) {
        const after = all.filter(b => b.t >= s.to && b.t < t7);
        const name = s.key === 'asia' ? 'Asia' : 'London';
        if (now() < s.to) continue;
        if (!after.some(b => b.h > s.hi)) await ray(t7, s.hi, name + ' High', { width: 2, style: 0 });
        if (!after.some(b => b.l < s.lo)) await ray(t7, s.lo, name + ' Low', { width: 2, style: 0, below: true });
      }
      keep(i, 'lines', ids);
      return done;
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
