/* Market data store for the backtester: TopstepX chart API -> CSV files on disk.
 * m1 bars since mid-2023 (one CSV per symbol and year) + 1-second bars (only the last days exist on TopstepX, one CSV per month).
 * Columns: time_ny,ts,open,high,low,close,volume   (/NQ and /ES = front contract, same prices as NQZ26 / ESZ26 on the chart)
 *
 * + dossier « data_csv » (téléchargé à la main) : un CSV par symbole et par unité de temps, NQ / ES / MNQ / MES
 *   (NQ_1s.csv, NQ_5s.csv, NQ_15s.csv, NQ_30s.csv, NQ_m1.csv … NQ_12M.csv). Il passe avant le dossier « data » ;
 *   les trous du m1 / 1s sont comblés par les fichiers de la synchro (ceux du NQ / ES pour les micros).
 * Les CSV sont lus une seule fois (en flux, sans bloquer l'app) puis gardés en mémoire en tableaux typés : voir bank().
 */
const fs = require("fs");
const path = require("path");

const SYMS = ["NQ", "ES"];               // symboles synchronisés depuis TopstepX
const UND = { MNQ: "NQ", MES: "ES" };    // micros : mêmes prix que le contrat principal (repli quand leur fichier manque)
const SEC_TFS = ["1s", "5s", "15s", "30s"];
const M1_START = Date.UTC(2023, 6, 1) / 1000; // first m1 data available on TopstepX ~ July 2023
const TAIL = 15;                          // v1.85 : bougies de fin de bloc jetées (retéléchargées ensuite)
const HEADER = "time_ny,ts,open,high,low,close,volume\n";

const fmtNY = (() => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  return (ts) => { const o = {}; f.formatToParts(new Date(ts * 1000)).forEach((x) => (o[x.type] = x.value)); return `${o.year}-${o.month}-${o.day} ${o.hour}:${o.minute}:${o.second}`; };
})();

/* ---------- v1.85 : nettoyage des bougies (option « Écarter les données douteuses », et synchro) ----------
 * Retire : les bougies hors séance CME (samedi, vendredi après 17:00, dimanche avant 18:00 NY) et les sauts aberrants qui reviennent :
 * une bougie qui ouvre à plus de JUMP pts de la dernière clôture gardée, alors que le prix revient à moins de BACK pts de cette clôture
 * dans les LOOK bougies suivantes, ou juste avant une pause du marché (fin de bloc corrompue de l'API History, contrat secondaire
 * pendant un rollover). Un vrai gap qui ne revient pas est gardé. Les séances complètes de moins de 600 bougies m1 sont retirées. rows = [[ts, o, h, l, c, v], …] triées. Pur, testé dans marketdata.test.js. */
const OFFS = new Map(), SKEY = new Map();
function offSession(ts) {
  const h = Math.floor(ts / 3600); let v = OFFS.get(h);
  if (v === undefined) { const s = fmtNY(h * 3600), d = new Date(s.slice(0, 10) + "T12:00:00Z").getUTCDay(), hr = +s.slice(11, 13); v = d === 6 || (d === 5 && hr >= 17) || (d === 0 && hr < 18); if (OFFS.size > 300000) OFFS.clear(); OFFS.set(h, v); }
  return v;
}
function cleanBars(rows, o = {}) {
  const JUMP = o.jump || 120, BACK = o.back || 40, LOOK = o.look || 60, out = [], removed = { offSession: 0, spikes: 0 };
  let g = o.prevClose != null && isFinite(o.prevClose) ? +o.prevClose : null, lastT = -Infinity;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (offSession(r[0])) { removed.offSession++; continue; }
    if (g !== null && (r[0] - lastT <= 1800 || Math.abs(r[1] - g) > (o.big || 600)) && Math.abs(r[1] - g) > JUMP) { // une réouverture (après une pause de plus de 30 min) n'est jamais un saut aberrant : vrai gap
      let end = -1;
      const big = Math.abs(r[1] - g) > (o.big || 600); // saut impossible sur le NQ / ES : on cherche le retour sans limite de durée
      for (let j = i + 1; j < rows.length && (big || j <= i + LOOK); j++) {
        if (!big && rows[j][0] - rows[j - 1][0] > 1800) { end = j; break; } // pause du marché juste après le saut : bougies de fin de séance corrompues
        if (!offSession(rows[j][0]) && Math.abs(rows[j][1] - g) <= BACK) { end = j; break; }
      }
      if (end > 0) { removed.spikes += end - i; i = end - 1; continue; }
    }
    out.push(r); g = r[4]; lastT = r[0];
  }
  // séances clairsemées (moins de minBars bougies m1 : données incomplètes ou fausses), sauf la première et la dernière lues (coupées par la plage, séance en cours)
  const minBars = o.minBars === undefined ? 600 : o.minBars;
  if (minBars > 0 && out.length) {
    const key = (t) => { const h = Math.floor((t + 6 * 3600) / 3600); let v = SKEY.get(h); if (v === undefined) { v = fmtNY(h * 3600).slice(0, 10); if (SKEY.size > 300000) SKEY.clear(); SKEY.set(h, v); } return v; };
    const cnt = new Map(); out.forEach((x) => { const k = key(x[0]); cnt.set(k, (cnt.get(k) || 0) + 1); });
    const first = key(out[0][0]), last = key(out[out.length - 1][0]), thin = new Set([...cnt].filter(([k, n]) => n < minBars && k !== first && k !== last).map(([k]) => k));
    if (thin.size) { const kept = out.filter((x) => !thin.has(key(x[0]))); removed.thinSessions = thin.size; removed.thinBars = out.length - kept.length; return { rows: kept, removed, lastClose: g }; }
  }
  return { rows: out, removed, lastClose: g };
}

/* ---------- banque de bougies : un CSV -> Float64Array (6 valeurs par bougie : ts, o, h, l, c, v), triée, sans doublons ----------
 * Lecture en flux (un fichier 1 s de 100 Mo ne bloque pas l'app), une seule fois par fichier : relu seulement si sa date ou sa taille change.
 * Mémoire : au-delà de MAXB octets, les plus gros fichiers les moins récemment utilisés sont libérés (ils seront relus au prochain clic). */
function bank(MAXB = 400 * 1048576) {
  const C = new Map();
  let tick = 0;
  async function parse(file, size) {
    let cap = Math.max(256, Math.ceil(size / 48)), a = new Float64Array(cap * 6), n = 0, rest = "", cols = null, sorted = true, lastT = -Infinity;
    const line = (L) => {
      if (!L) return;
      if (L.charCodeAt(L.length - 1) === 13) { L = L.slice(0, -1); if (!L) return; }
      const f = L.split(cols ? cols.sep : /[;,]/);
      if (!cols) {
        const head = f.map((x) => x.trim().toLowerCase()), idx = (names) => head.findIndex((h) => names.includes(h));
        cols = { sep: L.includes(";") && !L.includes(",") ? ";" : ",", t: idx(["ts", "timestamp", "unix", "time"]), o: idx(["open", "o"]), h: idx(["high", "h"]), l: idx(["low", "l"]), c: idx(["close", "c"]), v: idx(["volume", "vol", "v"]) };
        if (cols.t < 0 || cols.o < 0 || cols.h < 0 || cols.l < 0 || cols.c < 0) throw new Error("colonnes ts / open / high / low / close introuvables dans " + path.basename(file));
        return;
      }
      let t = +f[cols.t]; if (f[cols.t] === "" || !isFinite(t)) t = parseNY(String(f[cols.t] || "").trim()); if (t > 1e12) t = Math.floor(t / 1000);
      if (!isFinite(t)) return;
      if (t === lastT) return; // doublon (synchro interrompue)
      if (t < lastT) sorted = false; else lastT = t;
      if (n === cap) { cap *= 2; const b = new Float64Array(cap * 6); b.set(a); a = b; }
      const k = n * 6; a[k] = t; a[k + 1] = +f[cols.o]; a[k + 2] = +f[cols.h]; a[k + 3] = +f[cols.l]; a[k + 4] = +f[cols.c]; a[k + 5] = cols.v >= 0 ? +f[cols.v] || 0 : 0; n++;
    };
    for await (const chunk of fs.createReadStream(file, { encoding: "utf8", highWaterMark: 1 << 20 })) {
      const parts = (rest + chunk).split("\n"); rest = parts.pop();
      for (let i = 0; i < parts.length; i++) line(parts[i]);
    }
    line(rest);
    if (!sorted) { // fichier pas dans l'ordre : tri par heure puis doublons retirés
      const ix = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[x * 6] - a[y * 6]), b = new Float64Array(n * 6); let m = 0;
      for (const i of ix) { if (m && a[i * 6] === b[(m - 1) * 6]) continue; b.set(a.subarray(i * 6, i * 6 + 6), m * 6); m++; }
      a = b; n = m;
    }
    return { a: a.slice(0, n * 6), n };
  }
  function evict() {
    let tot = 0; for (const c of C.values()) tot += c.bytes || 0;
    if (tot <= MAXB) return;
    for (const [k, c] of [...C.entries()].filter(([, c]) => c.bytes > 8 * 1048576).sort((x, y) => x[1].use - y[1].use)) { if (tot <= MAXB) break; if (c.use === tick) continue; tot -= c.bytes; C.delete(k); }
  }
  // { a, n } du fichier (promesse partagée par les lectures simultanées), ou null si le fichier n'existe pas
  function get(file) {
    let st; try { st = fs.statSync(file); } catch (e) { C.delete(file); return Promise.resolve(null); }
    let c = C.get(file);
    if (!c || c.m !== st.mtimeMs || c.size !== st.size) {
      c = { m: st.mtimeMs, size: st.size, bytes: 0, use: 0 };
      c.p = parse(file, st.size).then((r) => { c.bytes = r.a.byteLength; evict(); return r; }, (e) => { if (C.get(file) === c) C.delete(file); throw e; });
      C.set(file, c);
    }
    c.use = ++tick;
    return c.p;
  }
  return { get, size: () => C.size };
}
/* ---------- v1.67 : bornes d'un CSV sans le lire en entier (actifs proposés à la création d'une session, NAV-05) ----------
 * En-tête + 1re ligne (début du fichier), puis dernière ligne complète (fin du fichier) : deux lectures de 64 Ko au plus, même sur un fichier 1 s de 100 Mo. */
function csvCols(head) {
  const L = String(head || "").replace(/\r$/, ""), sep = L.includes(";") && !L.includes(",") ? ";" : ",", h = L.split(sep).map((x) => x.trim().toLowerCase());
  const t = h.findIndex((x) => ["ts", "timestamp", "unix", "time"].includes(x));
  return t < 0 ? null : { sep, t };
}
function tsOf(line, cols) {
  const L = String(line || "").replace(/\r$/, ""); if (!L) return NaN;
  const v = String(L.split(cols.sep)[cols.t] || "").trim(); if (!v) return NaN;
  let t = /^\d+(\.\d+)?$/.test(v) ? +v : parseNY(v); if (t > 1e12) t = Math.floor(t / 1000);
  return isFinite(t) ? t : NaN;
}
async function csvEdges(file, chunk = 65536) {
  let fh; try { fh = await fs.promises.open(file, "r"); } catch (e) { return null; }
  try {
    const { size } = await fh.stat(); if (!size) return null;
    const rd = async (pos, len) => { const b = Buffer.alloc(len), r = await fh.read(b, 0, len, pos); return b.toString("utf8", 0, r.bytesRead); };
    const head = (await rd(0, Math.min(size, chunk))).split("\n"), cols = csvCols(head[0]); if (!cols) return null;
    let first = NaN; for (let i = 1; i < head.length && !isFinite(first); i++) first = tsOf(head[i], cols);
    const tail = size <= chunk ? head.slice(1) : (await rd(size - chunk, chunk)).split("\n").slice(1); // 1re ligne de la fin : peut-être coupée
    let last = NaN; for (let i = tail.length - 1; i >= 0 && !isFinite(last); i--) last = tsOf(tail[i], cols);
    return isFinite(first) && isFinite(last) ? [Math.min(first, last), Math.max(first, last)] : null;
  } finally { await fh.close(); }
}

// 1re bougie dont l'heure est >= t (recherche dichotomique)
function lowerBound(b, t) { let lo = 0, hi = b.n; while (lo < hi) { const m = (lo + hi) >> 1; if (b.a[m * 6] < t) lo = m + 1; else hi = m; } return lo; }
// bougies [ts, o, h, l, c, v] d'une banque entre deux heures unix (bornes incluses)
function sliceRows(b, from, to) {
  if (!b || !b.n) return [];
  const out = [], a = b.a;
  for (let i = lowerBound(b, from); i < b.n && a[i * 6] <= to; i++) { const k = i * 6; out.push([a[k], a[k + 1], a[k + 2], a[k + 3], a[k + 4], a[k + 5]]); }
  return out;
}
// réunion de deux listes triées : « main » gagne sur une même heure, « fill » comble les trous
function mergeRows(main, fill) {
  if (!fill || !fill.length) return main || [];
  if (!main || !main.length) return fill;
  const out = []; let i = 0, j = 0;
  while (i < main.length || j < fill.length) {
    if (j >= fill.length || (i < main.length && main[i][0] <= fill[j][0])) { if (j < fill.length && fill[j][0] === main[i][0]) j++; out.push(main[i++]); }
    else out.push(fill[j++]);
  }
  return out;
}

// v1.67.1 : dossiers « data_csv » possibles, dans l'ordre : <dossier ICT>\data_csv, puis le data_csv de chaque sous-dossier du dossier ICT
// (le dépôt posé là, ex. economic-calendar-main\data_csv ; ordre alphabétique), puis extra
function csvDirsOf(ict, extra) {
  const out = [path.join(ict, "data_csv")];
  try { fs.readdirSync(ict, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).forEach((n) => out.push(path.join(ict, n, "data_csv"))); } catch (e) { /* dossier ICT absent */ }
  return out.concat(extra || []);
}

// opts.csvDirs : dossiers « data_csv » possibles (le 1er qui existe et contient des CSV est utilisé)
function create(baseDir, opts = {}) {
  const dir = baseDir, B = bank();
  let csvFound = null;
  const hasCsv = (d) => { try { return fs.readdirSync(d).some((f) => /^[A-Za-z]+_[0-9A-Za-z]+\.csv$/.test(f)); } catch (e) { return false; } };
  const csvDir = () => { if (csvFound && fs.existsSync(csvFound)) return csvFound; csvFound = (opts.csvDirs || []).find(hasCsv) || null; return csvFound; };
  const csvFile = (sym, tf) => { const d = csvDir(); return d ? path.join(d, `${sym}_${tf}.csv`) : null; };
  const rowsOf = async (file, from, to) => { const b = file ? await B.get(file) : null; return b ? sliceRows(b, from, to) : null; };
  const stateFile = path.join(dir, "data-state.json");
  fs.mkdirSync(dir, { recursive: true });
  const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch (e) { return {}; } };
  const writeState = (s) => fs.writeFileSync(stateFile, JSON.stringify(s, null, 2));
  const fileM1 = (sym, year) => path.join(dir, `${sym}_m1_${year}.csv`);
  const fileS1 = (sym, ym) => path.join(dir, `${sym}_1s_${ym}.csv`);

  async function chunk(token, fetchFn, sym, res, from, to, countback) {
    const u = `https://chartapi.topstepx.com/History?Symbol=${encodeURIComponent("/" + sym)}&Resolution=${res}&Countback=${countback}&From=${from}&To=${to}`;
    const r = await fetchFn(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
    if (r.status === 401 || r.status === 403) { const e = new Error("auth"); e.code = "AUTH"; throw e; }
    if (!r.ok) throw new Error("History " + r.status);
    const j = await r.json();
    return (j.t || []).map((t, i) => ({ t, o: j.o[i], h: j.h[i], l: j.l[i], c: j.c[i], v: j.v ? j.v[i] : 0 })).filter((b) => b.t >= from && b.t <= to).sort((a, b) => a.t - b.t);
  }
  function append(file, rows) {
    if (!rows.length) return;
    const head = fs.existsSync(file) ? "" : HEADER;
    fs.appendFileSync(file, head + rows.map((b) => `${fmtNY(b.t)},${b.t},${b.o},${b.h},${b.l},${b.c},${b.v}`).join("\n") + "\n");
  }
  const yearOf = (ts) => new Date(ts * 1000).getUTCFullYear();
  const ymOf = (ts) => new Date(ts * 1000).toISOString().slice(0, 7);

  let running = false;
  async function sync(token, fetchFn, onProgress = () => {}) {
    if (running) return { ok: false, reason: "busy" };
    running = true;
    const st = readState(), now = Math.floor(Date.now() / 1000), summary = {};
    try {
      for (const sym of SYMS) {
        st[sym] = st[sym] || {};
        // ---- m1: forward from the last saved bar (or July 2023), 15 calendar days per request (< 25 000 bars)
        // v1.85 : les dernières bougies renvoyées par l'API History pour un bloc sont parfois fausses (prix d'autres contrats en escalier) :
        // les TAIL dernières sont jetées et retéléchargées au début du bloc suivant (ou à la prochaine synchro), puis le bloc est nettoyé (cleanBars)
        let cur = st[sym].m1Last ? st[sym].m1Last + 60 : M1_START, added = 0;
        while (cur < now - 60) {
          const to = Math.min(cur + 15 * 86400, now), final = to >= now;
          let rows = (await chunk(token, fetchFn, sym, "1", cur, to, 25000)).filter((b) => !st[sym].m1Last || b.t > st[sym].m1Last);
          if (rows.length > TAIL) rows = rows.slice(0, rows.length - TAIL); else if (final) rows = [];
          const cl = cleanBars(rows.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v]), { prevClose: st[sym].m1LastClose, minBars: 0 });
          const keep = cl.rows.map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
          const byYear = {};
          keep.forEach((b) => (byYear[yearOf(b.t)] = byYear[yearOf(b.t)] || []).push(b));
          Object.entries(byYear).forEach(([y, rs]) => append(fileM1(sym, y), rs));
          if (rows.length) { st[sym].m1Last = rows[rows.length - 1].t; if (cl.lastClose != null) st[sym].m1LastClose = cl.lastClose; added += keep.length; st[sym].m1Removed = (st[sym].m1Removed || 0) + cl.removed.spikes + cl.removed.offSession; writeState(st); }
          cur = rows.length && !final ? st[sym].m1Last + 60 : to + 1;
          onProgress({ sym, kind: "m1", upTo: fmtNY(Math.min(cur, now)).slice(0, 10), added });
        }
        // ---- 1-second bars: TopstepX keeps only the last days -> collect every evening, 6 h per request
        let s = Math.max(st[sym].s1Last ? st[sym].s1Last + 1 : 0, now - 4 * 86400), addedS = 0;
        while (s < now - 1) {
          const to = Math.min(s + 6 * 3600, now);
          const rows = (await chunk(token, fetchFn, sym, "1S", s, to, 25000)).filter((b) => !st[sym].s1Last || b.t > st[sym].s1Last);
          const byM = {};
          rows.forEach((b) => (byM[ymOf(b.t)] = byM[ymOf(b.t)] || []).push(b));
          Object.entries(byM).forEach(([m, rs]) => append(fileS1(sym, m), rs));
          if (rows.length) { st[sym].s1Last = rows[rows.length - 1].t; addedS += rows.length; writeState(st); }
          s = to + 1;
          onProgress({ sym, kind: "1s", upTo: fmtNY(Math.min(s, now)).slice(0, 16), added: addedS });
        }
        summary[sym] = { m1: added, s1: addedS, m1Last: st[sym].m1Last ? fmtNY(st[sym].m1Last) : null };
      }
      st.lastSync = new Date().toISOString(); writeState(st);
      return { ok: true, summary, dir };
    } catch (e) {
      return { ok: false, reason: e.code === "AUTH" ? "login" : String(e.message || e), summary };
    } finally { running = false; }
  }

  function status() {
    const st = readState(), out = { dir, running, lastSync: st.lastSync || null, allTf: st.allTf || null, csv: null };
    const cd = csvDir();
    if (cd) { // dossier data_csv : symboles et unités de temps présents
      const fl = fs.readdirSync(cd).map((f) => /^([A-Za-z]+)_([0-9A-Za-z]+)\.csv$/.exec(f)).filter(Boolean), syms = {};
      fl.forEach((m) => (syms[m[1].toUpperCase()] = syms[m[1].toUpperCase()] || []).push(m[2]));
      out.csv = { dir: cd, files: fl.length, mb: +(fl.reduce((a, m) => a + fs.statSync(path.join(cd, m[0])).size, 0) / 1048576).toFixed(0), syms };
    }
    for (const sym of SYMS) {
      const files = fs.readdirSync(dir).filter((f) => f.startsWith(sym + "_") && f.endsWith(".csv"));
      out[sym] = { m1Last: st[sym] && st[sym].m1Last ? fmtNY(st[sym].m1Last) : null, s1Last: st[sym] && st[sym].s1Last ? fmtNY(st[sym].s1Last) : null,
        files: files.length, mb: +(files.reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0) / 1048576).toFixed(1) };
    }
    return out;
  }

  // fichiers de la synchro TopstepX qui couvrent [from, to] : un par an (m1) ou par mois (1s), noms en UTC
  function syncFiles(sym, from, to, res) {
    if (res === "1s") { const a = ymOf(from), z = ymOf(to); let all; try { all = fs.readdirSync(dir); } catch (e) { return []; } return all.filter((f) => f.startsWith(`${sym}_1s_`) && f.slice(sym.length + 4, sym.length + 11) >= a && f.slice(sym.length + 4, sym.length + 11) <= z).sort().map((f) => path.join(dir, f)); }
    return Array.from({ length: Math.max(0, yearOf(to) - yearOf(from) + 1) }, (_, i) => fileM1(sym, yearOf(from) + i));
  }
  // un symbole a-t-il ses propres bougies dans cette résolution (fichier data_csv, ou fichiers de la synchro) ?
  const hasOwn = (sym, res) => { const f = csvFile(sym, res); if (f && fs.existsSync(f)) return true; try { return fs.readdirSync(dir).some((x) => x.startsWith(`${sym}_${res}_`) && x.endsWith(".csv")); } catch (e) { return false; } };
  // read bars of a symbol between two unix timestamps (m1 or 1s) : data_csv d'abord, trous comblés par la synchro du même symbole.
  // v1.67.1 (décision de l'arbitre du 20/11/2026) : un micro (MNQ, MES) n'utilise que ses propres bougies ; sans aucun fichier à lui dans cette résolution, il prend celles de son sous-jacent (NQ, ES)
  async function read(sym, from, to, res = "m1", clean = false) {
    res = res === "1s" ? "1s" : "m1";
    if (sym in UND && !hasOwn(sym, res)) return read(UND[sym], from, to, res, clean);
    if (clean) return cleanBars(await read(sym, from, to, res, false), res === "1s" ? { look: 3600, minBars: 0 } : {}).rows;
    to = Math.min(to, Math.floor(Date.now() / 1000) + 86400); from = Math.max(from, 0);
    const main = await rowsOf(csvFile(sym, res), from, to);
    let fill = [];
    for (const f of syncFiles(sym, from, to, res)) { const r = await rowsOf(f, from, to); if (r && r.length) fill = fill.length ? mergeRows(fill, r) : r; }
    return mergeRows(main, fill);
  }

  /* ---------- toutes les unités de temps (m2 … 12M) : NQ_all_tf.csv / ES_all_tf.csv + un CSV par unité ---------- */
  const TFS = ["m2", "m3", "m5", "m15", "H1", "H4", "D", "W", "M", "3M", "6M", "12M"];
  const quarter = (d, n) => d.slice(0, 4) + "-" + Math.floor((+d.slice(5, 7) - 1) / n); // trimestre (n = 3), semestre (6), année (12)
  const DERIVED = { W: (b) => monday(dateNY(b[0])), M: (b) => dateNY(b[0]).slice(0, 7), "3M": (b) => quarter(dateNY(b[0]), 3), "6M": (b) => quarter(dateNY(b[0]), 6), "12M": (b) => dateNY(b[0]).slice(0, 4) };
  const NATIVE = { m2: "2", m3: "3", m5: "5", m15: "15", H1: "60", H4: "240", D: "1D" };
  const fileTf = (sym, tf) => path.join(dir, `${sym}_${tf}.csv`);
  const dateNY = (ts) => fmtNY(ts).slice(0, 10);
  const monday = (d) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  function agg(rows, keyf) {
    const out = []; let cur = null, k = null;
    for (const b of rows) { const kk = keyf(b); if (kk !== k) { if (cur) out.push(cur); k = kk; cur = b.slice(); } else { cur[2] = Math.max(cur[2], b[2]); cur[3] = Math.min(cur[3], b[3]); cur[4] = b[4]; cur[5] += b[5]; } }
    if (cur) out.push(cur); return out;
  }
  async function native(token, fetchFn, sym, res) {
    const map = new Map(); let to = Math.floor(Date.now() / 1000);
    for (let page = 0; page < 200; page++) {
      const u = `https://chartapi.topstepx.com/History?Symbol=${encodeURIComponent("/" + sym)}&Resolution=${res}&Countback=25000&From=0&To=${to}`;
      const r = await fetchFn(u, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
      if (r.status === 401 || r.status === 403) { const e = new Error("auth"); e.code = "AUTH"; throw e; }
      if (!r.ok) throw new Error("History " + r.status);
      const j = await r.json(), t = j.t || []; if (!t.length) break;
      let added = 0; t.forEach((x, i) => { if (!map.has(x)) { map.set(x, [x, j.o[i], j.h[i], j.l[i], j.c[i], j.v ? j.v[i] : 0]); added++; } });
      if (!added || t[0] >= to || t.length < 1000) break; to = t[0] - 1;
    }
    return [...map.values()].sort((a, b) => a[0] - b[0]);
  }
  const line = (b) => `${fmtNY(b[0])},${b[0]},${b[1]},${b[2]},${b[3]},${b[4]},${b[5]}`;
  function writeAll(sym, T) {
    const all = [];
    for (const tf of TFS) { const rows = T[tf] || []; fs.writeFileSync(fileTf(sym, tf), HEADER + rows.map(line).join("\n") + "\n"); rows.forEach((b) => all.push(tf + "," + line(b))); }
    fs.writeFileSync(path.join(dir, `${sym}_all_tf.csv`), "tf," + HEADER + all.join("\n") + "\n");
  }
  async function buildAllTf(token, fetchFn, onProgress = () => {}) {
    const out = {};
    for (const sym of SYMS) {
      const T = {};
      for (const [tf, res] of Object.entries(NATIVE)) { T[tf] = await native(token, fetchFn, sym, res); onProgress({ sym, kind: tf, upTo: T[tf].length ? dateNY(T[tf][0][0]) : "-", added: T[tf].length }); }
      if (T.H1.length && T.m15.length) { const f = T.H1[0][0]; T.H1 = agg(T.m15.filter((b) => b[0] < f), (b) => Math.floor(b[0] / 3600)).map((b) => [Math.floor(b[0] / 3600) * 3600, ...b.slice(1)]).concat(T.H1); }
      T.W = agg(T.D, (b) => monday(dateNY(b[0])));
      T.M = agg(T.D, (b) => dateNY(b[0]).slice(0, 7));
      T["3M"] = agg(T.D, (b) => { const d = dateNY(b[0]); return d.slice(0, 4) + "Q" + Math.floor((+d.slice(5, 7) - 1) / 3); });
      T["6M"] = agg(T.D, (b) => { const d = dateNY(b[0]); return d.slice(0, 4) + "H" + Math.floor((+d.slice(5, 7) - 1) / 6); });
      T["12M"] = agg(T.D, (b) => dateNY(b[0]).slice(0, 4));
      writeAll(sym, T);
      out[sym] = Object.fromEntries(TFS.map((tf) => [tf, T[tf].length]));
    }
    const st = readState(); st.allTf = new Date().toISOString(); writeState(st);
    return out;
  }
  // un fichier *_all_tf.csv importé à la main -> découpé en un CSV par unité
  function importAllTf(text, name) {
    const sym = /ES/i.test(name) && !/NQ/i.test(name) ? "ES" : "NQ", T = {};
    const lines = text.split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) { const a = lines[i].split(","); if (a.length < 8 || !TFS.includes(a[0])) continue; (T[a[0]] = T[a[0]] || []).push([+a[2], +a[3], +a[4], +a[5], +a[6], +a[7]]); }
    Object.values(T).forEach((r) => r.sort((x, y) => x[0] - y[0]));
    writeAll(sym, T);
    return { sym, counts: Object.fromEntries(TFS.map((tf) => [tf, (T[tf] || []).length])) };
  }
  // banque d'une unité de temps : data_csv, sinon dossier data ; W / M / 3M / 6M / 12M absents = recalculés depuis le D ; micros = repli sur NQ / ES
  async function tfBank(sym, tf) {
    for (const f of [csvFile(sym, tf), fileTf(sym, tf)]) { const b = f ? await B.get(f) : null; if (b && b.n) return b; }
    if (DERIVED[tf]) {
      const d = await tfBank(sym, "D");
      if (d && d.n) { const rows = agg(sliceRows(d, 0, Infinity), DERIVED[tf]), a = new Float64Array(rows.length * 6); rows.forEach((r, i) => a.set(r, i * 6)); return { a, n: rows.length }; }
    }
    return sym in UND ? tfBank(UND[sym], tf) : null;
  }
  // bougies d'une unité de temps (clés : 1s 5s 15s 30s m1 m2 m3 m5 m15 H1 H4 D W M 3M 6M 12M) ; null = aucun fichier
  async function readTf(sym, tf, from, to) { const b = await tfBank(sym, tf); return b ? sliceRows(b, from, to) : null; }
  // [1re heure, dernière heure] couvertes par une unité de temps (pour dire à l'utilisateur ce qui existe)
  async function span(sym, tf) { const b = tf === "m1" || tf === "1s" ? await B.get(csvFile(sym, tf) || "") : await tfBank(sym, tf); return b && b.n ? [b.a[0], b.a[(b.n - 1) * 6]] : null; }
  /* v1.67 : actifs ayant des bougies m1 / 1 s (NAV-05) : data_csv (NQ_m1.csv, NQ_1s.csv…) puis data (NQ_m1_2026.csv, NQ_1s_2026-11.csv…), avec la 1re et la dernière heure.
     Lecture légère : liste des fichiers puis début et fin de chacun (csvEdges) ; les micros sans fichier sont repliés sur NQ / ES par l'app (même règle que read). */
  async function assets() {
    const syms = {}, scan = (d) => { try { return fs.readdirSync(d); } catch (e) { return []; } };
    const add = async (sym, res, file, src) => {
      const e = await csvEdges(file); if (!e) return;
      const s = (syms[sym] = syms[sym] || { m1: null, s1: null, src: [] }), k = res === "1s" ? "s1" : "m1";
      s[k] = s[k] ? [Math.min(s[k][0], e[0]), Math.max(s[k][1], e[1])] : e; if (!s.src.includes(src)) s.src.push(src);
    };
    const cd = csvDir();
    for (const f of cd ? scan(cd) : []) { const m = /^([A-Za-z]+)_(m1|1s)\.csv$/i.exec(f); if (m) await add(m[1].toUpperCase(), m[2].toLowerCase(), path.join(cd, f), "data_csv"); }
    for (const f of scan(dir)) { const m = /^([A-Za-z]+)_(m1|1s)_\d{4}(-\d\d)?\.csv$/i.exec(f); if (m) await add(m[1].toUpperCase(), m[2].toLowerCase(), path.join(dir, f), "data"); }
    return { csvDir: cd, dataDir: dir, syms };
  }
  // v1.85 : retélécharge tout l'historique m1 avec la synchro corrigée ; les anciens fichiers sont gardés dans data\_avant_reparation_AAAA-MM-JJ
  async function repair(token, fetchFn, onProgress = () => {}) {
    if (running) return { ok: false, reason: "busy" };
    const day = new Date().toISOString().slice(0, 10), back = path.join(dir, "_avant_reparation_" + day); let moved = 0;
    try { fs.mkdirSync(back, { recursive: true }); for (const f of fs.readdirSync(dir)) if (/^(NQ|ES)_m1_\d{4}\.csv$/.test(f)) { fs.renameSync(path.join(dir, f), path.join(back, f)); moved++; } } catch (e) { return { ok: false, reason: String(e.message || e) }; }
    const st = readState(); SYMS.forEach((k) => { if (st[k]) { delete st[k].m1Last; delete st[k].m1LastClose; delete st[k].m1Removed; } }); writeState(st);
    const r = await sync(token, fetchFn, onProgress); return { ...r, backup: back, moved };
  }
  return { sync, repair, status, read, readTf, span, assets, buildAllTf, importAllTf, TFS, dir, csvDir, isRunning: () => running };
}

// parse a CSV chosen by the user (time_ny,ts,open,high,low,close,volume or any CSV with ts/open/high/low/close[/volume])
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const head = lines[0].toLowerCase().split(/[;,]/).map((s) => s.trim());
  const idx = (names) => head.findIndex((h) => names.includes(h));
  const it = idx(["ts", "timestamp", "unix", "time"]), io = idx(["open", "o"]), ih = idx(["high", "h"]), il = idx(["low", "l"]), ic = idx(["close", "c"]), iv = idx(["volume", "vol", "v"]);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i].split(/[;,]/);
    let t = (a[it] || "").trim(); t = /^\d+(\.\d+)?$/.test(t) ? +t : parseNY(t); if (t > 1e12) t = Math.floor(t / 1000);
    if (!isFinite(t)) continue;
    out.push([t, +a[io], +a[ih], +a[il], +a[ic], iv >= 0 ? +a[iv] : 0]);
  }
  return out.sort((x, y) => x[0] - y[0]).filter((b, i, A) => !i || b[0] > A[i - 1][0]);
}

// "2026-11-05 09:30:00" (sans fuseau) = heure de New York ; une date avec Z ou ±hh:mm garde son fuseau
function parseNY(s) {
  if (/(Z|[+-]\d\d:?\d\d)$/i.test(s) && /\d[T ]\d/.test(s)) return Date.parse(s) / 1000;
  const want = Date.parse(s.replace(" ", "T") + "Z") / 1000;
  if (!isFinite(want)) return NaN;
  let g = want;
  for (let i = 0; i < 2; i++) g += want - Date.parse(fmtNY(g).replace(" ", "T") + "Z") / 1000; // corrige l'écart NY (heure d'été comprise)
  return g;
}

module.exports = { create, csvDirsOf, parseCsv, parseNY, mergeRows, csvEdges, cleanBars, offSession, SYMS, UND, SEC_TFS };
