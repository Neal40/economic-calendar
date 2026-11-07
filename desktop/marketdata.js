/* Market data store for the backtester: TopstepX chart API -> CSV files on disk.
 * m1 bars since mid-2023 (one CSV per symbol and year) + 1-second bars (only the last days exist on TopstepX, one CSV per month).
 * Columns: time_ny,ts,open,high,low,close,volume   (/NQ and /ES = front contract, same prices as NQZ26 / ESZ26 on the chart)
 */
const fs = require("fs");
const path = require("path");

const SYMS = ["NQ", "ES"];
const M1_START = Date.UTC(2023, 6, 1) / 1000; // first m1 data available on TopstepX ~ July 2023
const HEADER = "time_ny,ts,open,high,low,close,volume\n";

const fmtNY = (() => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  return (ts) => { const o = {}; f.formatToParts(new Date(ts * 1000)).forEach((x) => (o[x.type] = x.value)); return `${o.year}-${o.month}-${o.day} ${o.hour}:${o.minute}:${o.second}`; };
})();

function create(baseDir) {
  const dir = baseDir;
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
        let cur = st[sym].m1Last ? st[sym].m1Last + 60 : M1_START, added = 0;
        while (cur < now - 60) {
          const to = Math.min(cur + 15 * 86400, now);
          const rows = (await chunk(token, fetchFn, sym, "1", cur, to, 25000)).filter((b) => !st[sym].m1Last || b.t > st[sym].m1Last);
          const byYear = {};
          rows.forEach((b) => (byYear[yearOf(b.t)] = byYear[yearOf(b.t)] || []).push(b));
          Object.entries(byYear).forEach(([y, rs]) => append(fileM1(sym, y), rs));
          if (rows.length) { st[sym].m1Last = rows[rows.length - 1].t; added += rows.length; writeState(st); }
          cur = to + 1;
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
    const st = readState(), out = { dir, running, lastSync: st.lastSync || null };
    for (const sym of SYMS) {
      const files = fs.readdirSync(dir).filter((f) => f.startsWith(sym + "_") && f.endsWith(".csv"));
      out[sym] = { m1Last: st[sym] && st[sym].m1Last ? fmtNY(st[sym].m1Last) : null, s1Last: st[sym] && st[sym].s1Last ? fmtNY(st[sym].s1Last) : null,
        files: files.length, mb: +(files.reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0) / 1048576).toFixed(1) };
    }
    return out;
  }

  // read bars of a symbol between two unix timestamps (m1 or 1s)
  function read(sym, from, to, res = "m1") {
    const files = res === "1s"
      ? fs.readdirSync(dir).filter((f) => f.startsWith(`${sym}_1s_`)).sort()
      : Array.from({ length: yearOf(to) - yearOf(from) + 1 }, (_, i) => `${sym}_m1_${yearOf(from) + i}.csv`);
    const out = [];
    for (const f of files) {
      const p = path.join(dir, f);
      if (!fs.existsSync(p)) continue;
      const lines = fs.readFileSync(p, "utf8").split("\n");
      for (let i = 1; i < lines.length; i++) {
        const L = lines[i]; if (!L) continue;
        const a = L.split(","), t = +a[1];
        if (t < from || t > to || (out.length && t <= out[out.length - 1][0])) continue; // doublons laissés par une synchro interrompue
        out.push([t, +a[2], +a[3], +a[4], +a[5], +a[6]]);
      }
    }
    return out;
  }
  return { sync, status, read, dir, isRunning: () => running };
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

module.exports = { create, parseCsv, parseNY, SYMS };
