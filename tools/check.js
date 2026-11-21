// Garde-fou CI (aucune dépendance) : syntaxe JS de desktop/ + tools/, scripts inline de index.html,
// et contrat IPC preload.js <-> main.js. Usage : node tools/check.js  (code de sortie 1 si erreur)
const fs = require("fs"), path = require("path"), vm = require("vm"), { spawnSync } = require("child_process");
const root = path.join(__dirname, ".."), errors = [];
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

for (const dir of ["desktop", "tools"])
  for (const f of fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".js"))) {
    const r = spawnSync(process.execPath, ["--check", path.join(root, dir, f)], { encoding: "utf8" });
    if (r.status !== 0) errors.push(`${dir}/${f} : ${r.stderr.trim().split("\n").slice(0, 4).join(" | ")}`);
  }

const html = read("index.html");
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  const line = html.slice(0, m.index).split("\n").length;
  try { new vm.Script(m[1], { filename: `index.html (script ligne ${line})` }); } catch (e) { errors.push(`index.html script ligne ${line} : ${e.message}`); }
}

// stats du Journal backtest (btStats, fonction pure extraite d'index.html)
try {
  const src = /\/\* btStats:start[^\n]*\n([\s\S]*?)\/\* btStats:end \*\//.exec(html)[1], btStats = new Function(src + "; return btStats;")();
  const cfg = { type: "prop", target: 300, cons: 50, payDays: 2, payMin: 100 }, d = (day, pnl) => ({ day, pnl, dur: 60 });
  const st = btStats([d("2026-01-05", 200), d("2026-01-05", -50), d("2026-01-06", 120), d("2026-01-07", 150)], cfg);
  const ok = st.n === 4 && st.wins === 3 && st.pnl === 420 && st.days === 3 && st.targetDay === "2026-01-07" && st.payouts.length === 1 && st.payouts[0].day === "2026-01-06" && Math.abs(st.rr - 470 / 3 / 50) < 1e-9;
  if (!ok) errors.push("btStats : résultat inattendu " + JSON.stringify(st));
  if (btStats([d("2026-01-05", 500)], cfg).targetDay !== null) errors.push("btStats : consistance ignorée");
  if (btStats([], { type: "classic" }).n !== 0) errors.push("btStats : liste vide");
} catch (e) { errors.push("btStats : " + e.message); }

// moteur Pine Script v5 / v6 (pineEngine, extrait d'index.html) : syntaxe v6, historique, var, fonctions, UDT / méthodes, tableaux, dessins, request.security
try {
  const src = /\/\* pineEngine:start[^\n]*\n([\s\S]*?)\/\* pineEngine:end \*\//.exec(html)[1], win = {};
  const { PineEngine: PE } = new Function("window", src + "; return { PineEngine, PineDraw };")(win);
  const bars = []; const t0 = Date.UTC(2026, 10, 2, 14, 30) / 1000; for (let i = 0; i < 300; i++) { const o = 100 + i; bars.push([t0 + i * 300, o, o + 2, o - 1, o + 1, 10]); }
  const run = (code) => { const c = PE.compile(code); if (c.error) throw new Error(c.error); const r = PE.run(c, bars, { ny: (t) => t - 5 * 3600, tfSec: 300, sym: "NQ" }); if (r.error) throw new Error(r.error); return r; };
  const last = (code, k = 0) => run(code).plots[k].data[bars.length - 1];
  const T = [
    ["historique", "//@version=5\nindicator(\"x\")\nplot(close[3])", 397],
    ["var", "//@version=5\nindicator(\"x\")\nvar c = 0\nif bar_index % 2 == 0\n    c += 1\nplot(c[1])", 150],
    ["ta dans une fonction (état par appel)", "//@version=5\nindicator(\"x\")\nf(x) => ta.sma(x, 2)\nplot(f(close) - f(open))", 1],
    ["switch + if expression", "//@version=6\nindicator(\"x\")\ns = \"b\"\nv = switch s\n    \"a\" => 1\n    \"b\" => 2\n    => 3\nw = if close > 1000\n    10\nelse\n    20\nplot(v + w)", 22],
    ["type + method", "//@version=6\nindicator(\"x\")\ntype P\n    float a = 1\n    float b\nmethod tot(P this, float k = 2) =>\n    this.a + nz(this.b) * k\np = P.new(b = 5)\nplot(p.tot(k = 3))", 16],
    ["tableaux + for in", "//@version=6\nindicator(\"x\")\nvar a = array.new<float>()\na.push(close)\nif a.size() > 3\n    a.shift()\ns = 0.0\nfor v in a\n    s += v\nplot(s)", 400 + 399 + 398],
    ["déclarations multiples", "//@version=5\nindicator(\"x\")\na = 1, b = 2\nvar float x = 0.0, y = 1.0\nplot(a + b + x + y)", 4],
  ];
  for (const [name, code, exp] of T) { const v = last(code); if (Math.abs(v - exp) > 1e-9) errors.push(`pineEngine ${name} : ${v} au lieu de ${exp}`); }
  const d = run("//@version=5\nindicator(\"x\", overlay=true, max_lines_count=10)\nline.new(bar_index, close, bar_index + 1, close)\nif barstate.islast\n    label.new(bar_index, high, \"hi \" + str.tostring(close, \"#.00\"))\n    box.new(bar_index - 5, high, bar_index, low)\nplot(close)").draw;
  if (d.lines.length !== 10 || d.labels.length !== 1 || d.labels[0].text !== "hi 400.00" || d.boxes.length !== 1) errors.push("pineEngine dessins : " + JSON.stringify({ l: d.lines.length, lb: d.labels.map((x) => x.text), b: d.boxes.length }));
  const s = run("//@version=5\nindicator(\"x\")\nplot(request.security(syminfo.tickerid, \"60\", close[1], lookahead = barmerge.lookahead_on))").plots[0].data;
  if (!Number.isFinite(s[bars.length - 1])) errors.push("pineEngine request.security : valeur na");
  if (!PE.compile("//@version=4\nstudy(\"x\")\nplot(close)").error) errors.push("pineEngine : un script v4 doit être renvoyé vers l'ancien moteur");
} catch (e) { errors.push("pineEngine : " + e.message); }

// risque par position du Journal (riskCalc, fonction pure extraite d'index.html)
try {
  const src = /\/\* riskCalc:start[\s\S]*?\*\/\r?\n([\s\S]*?)\/\* riskCalc:end \*\//.exec(html)[1], riskCalc = new Function(src + "; return riskCalc;")();
  const f = (ID, Day, a, b, net, Direction) => ({ ID, Day, Entry: Day + "T" + a + ":00Z", Exit: Day + "T" + b + ":00Z", "Net P&L": net, Direction: Direction || "Long" });
  const F = [f("a", "2026-01-05", "15:00", "15:05", -400), f("b1", "2026-01-05", "15:10", "15:20", -150), f("b2", "2026-01-05", "15:11", "15:20", -150), f("c", "2026-01-05", "15:30", "15:40", 600),
    f("d", "2026-01-06", "15:00", "15:10", 1500), f("e", "2026-01-07", "15:00", "15:10", 100)];
  const r = riskCalc(F, 50000, { rrOf: (id) => ({ c: 3, d: 3 }[id]) });
  const ok = r.rows.length === 5 && r.n === 4 && r.avg === 350 && r.pct === 17.5 && r.ok === 4 && r.est === 2 && r.rows[2].dd === 1300 && r.rows[2].allowed === 250 && r.rows[3].dd === 1900 && r.rows[4].dd === 2000 && r.rows[4].risk === null;
  if (!ok) errors.push("riskCalc : résultat inattendu " + JSON.stringify(r));
  const k = riskCalc([f("x", "2026-01-05", "15:00", "15:05", 900)], 49000 + 1000, { tagRisk: () => 600 });
  if (k.ok !== 0 || k.pct !== 30) errors.push("riskCalc : tag Risque / règle des tranches");
  if (riskCalc([], 50000).n !== 0) errors.push("riskCalc : liste vide");
} catch (e) { errors.push("riskCalc : " + e.message); }

// Sortie 2R ou 3R ? du Journal de Neal (exitCalc, fonction pure extraite d'index.html)
try {
  const src = /\/\* exitCalc:start[\s\S]*?\*\/\r?\n([\s\S]*?)\/\* exitCalc:end \*\//.exec(html)[1], exitCalc = new Function(src + "; return exitCalc;")();
  const R = [{ Status: ["Pas pris (TP)"], "MFE (R)": 2.5, "RR fait": 2.5 }, { Status: ["TP"], "MFE (R)": 4, "RR fait": 4 }, { Status: ["BE (SL)"], "MFE (R)": 2.2, "RR fait": 0 },
    { Status: ["SL"], "MFE (R)": 1.2, "RR fait": -1 }, { Status: ["Pas pris (TP)"], "RR fait": 2 }];
  const x = exitCalc(R);
  const ok = x.n === 4 && x.taken === 3 && x.r2 === 5 && x.r3 === 2 && x.rp === 3.5 && x.real === 3 && x.between.length === 2 && x.missR === 4 && x.gave.length === 1 && x.gaveR === 2 && x.best === "r2";
  if (!ok) errors.push("exitCalc : résultat inattendu " + JSON.stringify({ ...x, between: x.between.length, gave: x.gave.length }));
  if (exitCalc(R, { miss: -1 }).r3 !== 1) errors.push("exitCalc : hypothèse SL si 3R non atteint");
  if (exitCalc([]).n !== 0) errors.push("exitCalc : liste vide");
} catch (e) { errors.push("exitCalc : " + e.message); }

// Skill IA du Profil (profilCalc, fonction pure extraite d'index.html)
try {
  const src = /\/\* profilCalc:start[\s\S]*?\*\/\r?\n([\s\S]*?)\/\* profilCalc:end \*\//.exec(html)[1], profilCalc = new Function(src + "; return profilCalc;")();
  const f = (ID, Day, h, net, Size, acc) => ({ ID, "ID TopstepX": acc || "A", Day, Entry: Day + "T" + h + ":00Z", Exit: Day + "T" + h.slice(0, 3) + "59:00Z", Direction: "Long", Size: Size || 2, "Net P&L": net });
  const days = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-12", "2026-01-13", "2026-01-14", "2026-01-15", "2026-01-16"];
  const steady = days.map((d, i) => f("s" + i, d, "15:00", i % 4 === 3 ? -100 : 150));
  const rules = { entries: "1st P.FVG M1 en macro", stops: "sous le swing, 500 $ max", tp: "50 % à 2RR puis BE", trail: "BE après 2RR puis FVG", exits: "fin de macro ou 2 SL" };
  const a = profilCalc(steady, { rules, risk: { n: 10, ok: 10 }, meta: () => ({ time: true, pda: true, plan: 1, err: [] }) });
  const by = (r, id) => r.criteria.find((c) => c.id === id).score;
  if (!(a.n === 10 && a.days === 10 && a.score >= 80 && a.status.k === "ok" && by(a, "rules") === 1 && by(a, "size") === 1)) errors.push("profilCalc : profil régulier mal noté " + JSON.stringify({ s: a.score, c: a.criteria.map((c) => [c.id, c.score]) }));
  // windfall + revenge (taille doublée juste après une perte) + taille erratique
  const wild = [...days.slice(0, 9).map((d, i) => f("w" + i, d, "15:00", 20)), f("big", days[9], "15:00", 3000, 10), f("l1", days[2], "16:00", -400), f("l2", days[2], "16:10", -600, 6)];
  const b = profilCalc(wild, { meta: () => ({ time: false, pda: false, plan: 0, err: ["Gambling"] }) });
  if (!(b.score < a.score && by(b, "windfall") === 0 && by(b, "erratic") < 0.5 && by(b, "size") < 1 && by(b, "rules") === 0 && b.status.k !== "ok")) errors.push("profilCalc : profil erratique mal noté " + JSON.stringify({ s: b.score, c: b.criteria.map((c) => [c.id, c.score]) }));
  if (profilCalc([], {}).score !== 0 || profilCalc([], {}).n !== 0) errors.push("profilCalc : liste vide");
  // tous les comptes Apex + Topstep (journées comptes.json) : dédoublonnage avec les trades détaillés, parcours prop firm
  const ext = [{ acc: "A", day: days[0], pnl: 999, n: 1, c: 2 }, { acc: "APEX-1", day: days[0], pnl: -1200, n: 3 }, { acc: "APEX-1", day: days[1], pnl: 300, n: 1 }];
  const accs = [{ id: "E1", firm: "Apex", kind: "eval", res: "passed", days: 2 }, { id: "E2", firm: "Apex", kind: "eval", res: "failed", days: 2 }, { id: "E3", firm: "Topstep", kind: "eval", res: "failed", days: 3 },
    { id: "F1", firm: "Apex", kind: "funded", res: "failed", days: 10 }, { id: "F2", firm: "Topstep", kind: "funded", res: "active", days: 4 }];
  const c = profilCalc(steady, { rules, days: ext, accounts: accs, money: { paid: 500, spent: 1000, payouts: 1 } });
  if (!(c.accDays === 12 && c.nAcc === 5 && c.net === a.net - 900 && Math.abs(by(c, "evals") - (1 / 3) / 0.6) < 0.01 && by(c, "funded") === 0.2 && by(c, "payouts") === 0.5 && by(c, "risk") < 1))
    errors.push("profilCalc : comptes Apex + Topstep " + JSON.stringify({ d: c.accDays, n: c.nAcc, net: c.net, c: c.criteria.map((x) => [x.id, x.score]) }));
  // v1.43 : tailles et risque ramenés à un compte 50K, consistance par compte, trades concernés, positions sans tags
  const big = days.map((d, i) => f("k" + i, d, "15:00", i % 4 === 3 ? -900 : 300, 6, "K150"));
  const k1 = profilCalc(big, { accounts: [{ id: "K150", firm: "Apex", kind: "funded", res: "active", size: 150000, cons: 0.5 }], meta: () => null });
  if (!(by(k1, "risk") === 1 && k1.pos[0].size === 2 && k1.pos[0].raw === 6 && k1.untagged.length === 10)) errors.push("profilCalc : taille / risque 150K " + JSON.stringify({ r: by(k1, "risk"), p: k1.pos[0], u: k1.untagged.length }));
  const rv = [f("r1", days[0], "15:00", -300, 2), { ...f("r2", days[0], "15:05", -200, 4), Entry: days[0] + "T15:05:00Z", Exit: days[0] + "T15:08:00Z" }];
  rv[0].Exit = days[0] + "T15:02:00Z";
  const k2 = profilCalc(rv.concat(steady.slice(1)), {}), er = k2.criteria.find((c) => c.id === "erratic");
  if (!(er.ids && er.ids[0] === "r2")) errors.push("profilCalc : revenge non repéré " + JSON.stringify(er));
  const wd = (t) => profilCalc(days.slice(0, 4).map((d, i) => f("c" + i, d, "15:00", i === 0 ? 450 : 200, 2, "W")), { accounts: [{ id: "W", firm: "MFFU", kind: "funded", res: "active", cons: t }] }).criteria.find((c) => c.id === "windfall").score;
  if (!(wd(0.5) === 1 && wd(0.3) < 1)) errors.push("profilCalc : consistance par compte " + JSON.stringify([wd(0.5), wd(0.3)]));
} catch (e) { errors.push("profilCalc : " + e.message); }

// « Prêt pour un payout ? » (payoutCalc, fonction pure extraite d'index.html)
try {
  const src = /\/\* payoutCalc:start[\s\S]*?\*\/\r?\n([\s\S]*?)\/\* payoutCalc:end \*\//.exec(html)[1], payoutCalc = new Function(src + "; return payoutCalc;")();
  const D = (L) => L.map((pnl, i) => ({ d: "2026-11-0" + (i + 1), pnl }));
  const ap = payoutCalc({ type: "50k Tradovate EOD Trail", startBalance: 50000, balance: 53000, requirements: { minDays: 5, minDailyProfit: 250, consistency: 50 }, summary: { minPayout: 52600 }, days: D([300, 300, 300, 300, 1800]) }, "apex", []);
  if (!(!ap.ok && ap.qual === 5 && ap.items.find((x) => x.k === "cons").ok === false && /consistance/.test(ap.need.join(" ")))) errors.push("payoutCalc : Apex consistance " + JSON.stringify(ap));
  const ap2 = payoutCalc({ type: "50k Tradovate EOD Trail", startBalance: 50000, balance: 53000, requirements: { minDays: 5, minDailyProfit: 250, consistency: 50 }, summary: { minPayout: 52600 }, days: D([-500, 600, 600, 600, 600, 600]) }, "apex", [{ requested: "2026-11-01" }]);
  if (!(ap2.ok && ap2.since === "2026-11-01" && ap2.qual === 5)) errors.push("payoutCalc : Apex depuis le dernier payout " + JSON.stringify(ap2));
  const ts = payoutCalc({ type: "50K Buying Power DLL", stage: "Express Funded", startBalance: 0, balance: 700, days: D([150, 160, 100, 200, 151]) }, "topstep", []);
  if (!(!ts.ok && ts.qual === 4 && !ts.items.some((x) => x.k === "cons"))) errors.push("payoutCalc : Topstep XFA " + JSON.stringify(ts));
  const mf = payoutCalc({ type: "Core", days: D([150, 150, 150, 150, 400]) }, "mffu", []);
  if (!(!mf.ok && mf.items.find((x) => x.k === "cons").label === "Consistance 40 %" && mf.items.find((x) => x.k === "cycle").ok)) errors.push("payoutCalc : MFFU Core " + JSON.stringify(mf));
} catch (e) { errors.push("payoutCalc : " + e.message); }

// cœur du replay (btCore : horloge, buffer, exécution des ordres), extrait d'index.html
try {
  const src = /\/\* btCore:start[^\n]*\n([\s\S]*?)\/\* btCore:end \*\//.exec(html)[1], C = new Function(src + "; return btCore;")();
  const eq = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) errors.push(`btCore.${name} : ${JSON.stringify(got)} au lieu de ${JSON.stringify(want)}`); };
  const bar = (t, o, h, l, c) => [t, o, h, l, c, 0], T = 0.25;
  // limites et stops touchés par le high / low
  eq("trigger limit achat", C.trigger({ type: "Limit", qty: 1, px: 100 }, bar(60, 102, 103, 99.5, 101), T), 100);
  eq("trigger limit achat pas touché", C.trigger({ type: "Limit", qty: 1, px: 100 }, bar(60, 102, 103, 100.25, 101), T), null);
  eq("trigger limit vente", C.trigger({ type: "Limit", qty: -1, px: 105 }, bar(60, 102, 105, 101, 104), T), 105);
  eq("trigger stop achat", C.trigger({ type: "Stop", qty: 1, px: 103 }, bar(60, 102, 103.5, 101, 103), T), 103);
  eq("trigger stop vente", C.trigger({ type: "Stop", qty: -1, px: 100 }, bar(60, 102, 103, 99, 100), T), 100);
  // gaps : limite exécutée à l'ouverture (meilleur prix), stop à l'ouverture (pire prix)
  eq("gap limit achat", C.trigger({ type: "Limit", qty: 1, px: 100 }, bar(60, 98, 99, 97, 98), T), 98);
  eq("gap stop vente", C.trigger({ type: "Stop", qty: -1, px: 100 }, bar(60, 97, 98, 96, 97), T), 97);
  eq("slippage stop achat", C.trigger({ type: "Stop", qty: 1, px: 103, slip: 2 }, bar(60, 102, 104, 101, 103), T), 103.5);
  // anti-lookahead : jamais sur la bougie de pose
  eq("anti-lookahead bougie de pose", C.trigger({ type: "Stop", qty: -1, px: 100, at: 60 }, bar(60, 102, 103, 99, 100), T), null);
  eq("anti-lookahead bougie suivante", C.trigger({ type: "Stop", qty: -1, px: 100, at: 60 }, bar(61, 102, 103, 99, 100), T), 100);
  // SL avant TP dans la même bougie
  eq("evalOrder SL d'abord", C.evalOrder([{ id: 1, bracket: "TP" }, { id: 2 }, { id: 3, bracket: "SL" }]).map((o) => o.id), [3, 1, 2]);
  // horloge : 1× = 60 s de marché par seconde, saut des fermetures
  eq("clockAdvance 1×", C.clockAdvance(1000, 1, 100, 1100), 1006);
  eq("clockAdvance 10×", C.clockAdvance(1000, 10, 1000, 1650), 1600);
  eq("clockAdvance marché fermé", C.clockAdvance(1000, 1, 100, 90000), 90000);
  const raw = [bar(0), bar(60), bar(120), bar(180)];
  eq("cursorAt", C.cursorAt(raw, 0, 130), 2);
  eq("needsMore", [C.needsMore(raw, 0, 100), C.needsMore(raw, 0, 200)], [false, true]);
  // buffer : ajout sur place des seules bougies plus récentes
  const buf = [bar(0), bar(60)]; eq("append", [C.append(buf, [bar(60), bar(120), bar(90), bar(180)]), buf.map((b) => b[0])], [2, [0, 60, 120, 180]]);
  const s1 = Array.from({ length: 120 }, (_, i) => bar(120 + i)); eq("merge1s", C.merge1s([bar(0), bar(60), bar(120)], s1).length, 2 + 120);
  eq("merge1s trop court", C.merge1s([bar(0)], [bar(1)]).length, 1);
  // bus d'événements
  const B = C.bus(), seen = []; const off = B.on("bar", (b) => seen.push(b)); B.emit("bar", 1); off(); B.emit("bar", 2); eq("bus", seen, [1]);
} catch (e) { errors.push("btCore : " + e.message); }

// Fuck Model v1.2 / v4.0 (fmCore, fonctions pures extraites d'index.html)
try {
  const src = /\/\* fmCore:start[^\n]*\n([\s\S]*?)\/\* fmCore:end \*\//.exec(html)[1], F = new Function(src + "; return fmCore;")();
  const sk = (t) => String(Math.floor(t / 86400)), day = (d, rows) => rows.map((r, i) => [d * 86400 + 60 * i, ...r]);
  const bars = [...day(0, [[100, 110, 95, 100], [100, 105, 90, 100]]),
    ...day(1, [[100, 101, 99, 100], [100, 111, 100, 110.5], [110.5, 119, 110, 118], [118, 118, 108, 109], [109, 111, 89, 89.5], [89.5, 90, 80, 81]]),
    ...day(2, [[130, 131, 129, 130]])];
  const sum = (o) => F.v12(bars, sk, o).trades.map((x) => [x.status, x.entry, x.exit, x.pnl.toFixed(2)].join("/")).join(" ");
  const eq = (name, got, want) => { if (got !== want) errors.push(`fmCore.${name} : ${got} au lieu de ${want}`); };
  // 1 trade par niveau : buy stop PDH 110 -> TP 118,5 ; sell stop PDL 90 -> TP 81,5 ; gap au-delà du TP le lendemain = TP loupé
  eq("v12", sum({}), "TP/110/118.5/164.24 TP/90/81.5/164.24 TP (loupé)/130/130/0.00");
  // un niveau pris (TP ou SL) n'est jamais repris : la remontée au-dessus du PDH après le TP ne redéclenche rien
  // (option rearm gardée pour les tests du moteur)
  // réarmement : retour sous le PDH, 2e buy stop stoppé dans la même bougie (baissière : O -> H -> L), puis le sell stop dans la foulée
  eq("v12 réarmement", sum({ rearm: true }), "TP/110/118.5/164.24 SL/110/90/-405.76 TP/90/81.5/164.24 TP (loupé)/130/130/0.00");
  eq("v12 prudent", sum({ rearm: true, path: "prudent" }), "TP/110/118.5/164.24 SL/110/90/-405.76 TP/89.5/81/164.24 TP (loupé)/130/130/0.00");
  const s12 = F.stats(F.v12(bars, sk, { rearm: true }).trades); if (s12.n !== 3 || s12.wins !== 2 || s12.loupe !== 1 || s12.maxRun !== 1) errors.push("fmCore.stats : " + JSON.stringify(s12));
  if (Math.abs(F.beWr(F.D12) - 71.186) > 0.01) errors.push("fmCore.beWr : " + F.beWr(F.D12));
  // v4.0 : gap haussier 100 -> 106 qui traverse 3 Daily High intacts, sortie à la clôture de la 1re bougie m1 (107)
  const w = [...day(7, [[100, 105, 95, 100]]), ...day(8, [[100, 104, 96, 100]]), ...day(9, [[100, 103, 97, 100]]), ...day(12, [[106, 108, 105.5, 107], [107, 107, 90, 91]])];
  eq("v40", F.v40(w, sk, {}).trades.map((x) => x.lvl + ":" + x.pts).join(","), "103:4,104:3,105:2");
  eq("v40 entrée à l'ouverture", F.v40(w, sk, { entry: "open", slip: 2 }).trades.map((x) => x.entry + ":" + x.pts).join(","), "106.5:0.5,106.5:0.5,106.5:0.5");
  // 2 mois max : un Daily High de plus de 60 jours, même intact et traversé, est ignoré
  const old = [...day(1, [[100, 105.5, 95, 100]]), ...w.filter((b) => b[0] >= 7 * 86400)];
  eq("v40 2 mois max", F.v40(old.map((b) => [b[0] < 2 * 86400 ? b[0] : b[0] + 60 * 86400, ...b.slice(1)]), sk, {}).trades.map((x) => x.lvl).join(","), "103,104,105");
  eq("v40 dans les 2 mois", F.v40(old, sk, {}).trades.map((x) => x.lvl).join(","), "103,104,105,105.5");
  eq("v40 sans niveau traversé", String(F.v40([...day(9, [[100, 103, 97, 100]]), ...day(12, [[100.5, 101, 100, 100.5]])], sk, {}).trades.length), "0");
} catch (e) { errors.push("fmCore : " + e.message); }

// v1.66 · Phase 1 salle blanche : retour arrière déterministe (btRewind + vrai code du compte btAcc / btPro + btCore), règles du challenge (btRules), période de session (btSes)
const grab = (k) => { const m = new RegExp(`\\/\\* ${k}:start[\\s\\S]*?\\*\\/\\r?\\n([\\s\\S]*?)\\/\\* ${k}:end \\*\\/`).exec(html); if (!m) throw new Error(`marqueurs ${k}:start / ${k}:end introuvables`); return m[1]; };
const NYP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const nyT = (d, h, m) => { const [Y, M, Dd] = d.split("-").map(Number), want = Date.UTC(Y, M - 1, Dd, h, m); let g = want; for (let i = 0; i < 3; i++) { const o = {}; NYP.formatToParts(new Date(g)).forEach((x) => (o[x.type] = x.value)); g += want - Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute); } return Math.floor(g / 1000); };
try {
  const core = new Function(grab("btCore") + "; return btCore;")(), RW = new Function(grab("btRewind") + "; return btRewind;")(), accSrc = grab("btAcc"), proSrc = grab("btPro");
  const T0 = nyT("2026-01-05", 9, 0); // 9:00 New York, bougies m1 ; la séance change à 18:00 (clé de séance = jour de NY à +6 h)
  const bars = Array.from({ length: 720 }, (_, i) => { const t = T0 + i * 60, p = (k) => 20000 + 30 * Math.sin(k / 17) + 9 * Math.sin(k / 5) + 0.04 * k, o = p(i - 1), c = p(i); return [t, +o.toFixed(2), +(Math.max(o, c) + 1.5).toFixed(2), +(Math.min(o, c) - 1.5).toFixed(2), +c.toFixed(2), 1]; });
  const sk = (t) => { const o = {}; NYP.formatToParts(new Date((t + 6 * 3600) * 1000)).forEach((x) => (o[x.type] = x.value)); return `${o.year}-${o.month}-${o.day}`; };
  const fresh = () => ({ cfg: { type: "prop", size: 50000, target: 3000, mll: 2000, dll: 1000, cons: 50, payDays: 5, payMin: 150 }, bal: 50000, mll: 48000, eodHigh: 50000, day: null, rpDay: 0, dllHit: false, blown: false, pos: null, orders: [], trades: [], seq: 1 });
  // un « moteur » = le code du compte de index.html (fill, processBar, newDay, proTrack…) exécuté tel quel avec un environnement minimal
  const engine = (beOn) => {
    const ctx = { A: fresh(), S: { raw: bars, cur: 0 }, P: { beOn, beR: 1 }, TICK: 0.25, btCore: core, curSes: null, msg: () => {}, saveAcc: () => {}, sessionKey: sk, slipT: () => 0, curTags: () => [],
      CTR: { NQ: { pv: 20, und: "NQ", fee: 2.8, name: "NQZ26" }, MNQ: { pv: 2, und: "NQ", fee: 0.74, name: "MNQZ26" } }, rnd: (p) => Math.round(p / 0.25) * 0.25,
      isProp: () => ctx.A.cfg.type === "prop", last: () => ctx.S.raw[ctx.S.cur][4], feeOf: (c) => ctx.CTR[c].fee, dom: { oBr: { value: "1" }, oSl: { value: "24" }, oTp: { value: "60" } }, $: (id) => ctx.dom[id] || { value: "" } };
    const api = new Function("ctx", `with (ctx) {\n${accSrc}\n${proSrc}\nreturn { fill, processBar, flatten, syncBrackets, M: () => markers, setM: (v) => { markers = v; } }; }`)(ctx);
    const J = { evs: [], seq: 0 };
    return { ctx, api, J, start(i) { ctx.S.cur = i; RW.start(J, ctx.A, 0, bars[i][0], 0, "origine"); }, commit(t, src) { return RW.commit(J, ctx.A, api.M().length, t, src, 0); } };
  };
  // actions de l'utilisateur, faites après la bougie i (comme dans l'app : on regarde la bougie, puis on agit)
  const pend = (E, type, qty, px) => { const A = E.ctx.A; A.orders.push({ id: A.seq++, ctr: "NQ", type, qty, px: E.ctx.rnd(px), at: bars[E.ctx.S.cur][0] }); };
  const mv = (E, br, d) => { const o = E.ctx.A.orders.find((x) => x.bracket === br); if (o && E.ctx.A.pos) o.px = E.ctx.rnd(o.px + d * Math.sign(E.ctx.A.pos.qty)); }; // glisser le SL / TP (d > 0 = vers le gain)
  const SCRIPT = {
    30: (E) => { E.api.fill("NQ", 2, E.ctx.last() + 0.25, bars[30][0], "Market"); E.api.syncBrackets(); },
    32: (E) => mv(E, "TP", -3),
    120: (E) => pend(E, "Limit", 1, E.ctx.last() - 6),
    180: (E) => pend(E, "Stop", -1, E.ctx.last() - 12),
    260: (E) => { E.ctx.A.orders = E.ctx.A.orders.filter((o) => o.bracket || o.type !== "Stop"); },
    330: (E) => { E.api.fill("NQ", -1, E.ctx.last() - 0.25, bars[330][0], "Market"); E.api.syncBrackets(); },
    331: (E) => mv(E, "SL", -2),
    470: (E) => pend(E, "Limit", 2, E.ctx.last() - 4),
    528: (E) => { if (!E.ctx.A.pos) { E.api.fill("MNQ", 3, E.ctx.last() + 0.25, bars[528][0], "Market"); E.api.syncBrackets(); } },
    529: (E) => { mv(E, "SL", -25); mv(E, "TP", 25); },
    640: (E) => { if (E.ctx.A.pos) E.api.flatten("Flatten"); },
  };
  const run = (E, from, to, skipLast) => { for (let i = from + 1; i <= to; i++) { E.ctx.S.cur = i; E.api.processBar(bars[i]); E.commit(bars[i][0], "bar"); if (SCRIPT[i] && !(skipLast && i === to)) { SCRIPT[i](E); E.commit(bars[i][0], "user"); } } };
  const rewind = (E, i0) => { const t = bars[i0][0], r = RW.back(E.J, t, E.ctx.A); if (!r) return null; E.ctx.A = r.acc; E.api.setM(E.api.M().slice(0, r.nM)); const be = E.ctx.P.beOn; E.ctx.P.beOn = false;
    try { RW.resim(bars, r.from, t, (b, i) => { E.ctx.S.cur = i; E.api.processBar(b); E.commit(b[0], "bar"); }); } finally { E.ctx.P.beOn = be; } E.ctx.S.cur = i0; return r; };
  const state = (E) => JSON.stringify({ a: (({ bal, mll, eodHigh, day, rpDay, dllHit, blown, pos, orders, trades, seq }) => ({ bal, mll, eodHigh, day, rpDay, dllHit, blown, pos, orders, trades, seq }))(E.ctx.A), m: E.api.M() });
  const S0 = 10, I1 = 700, direct = engine(true); direct.start(S0); run(direct, S0, I1);
  const D = JSON.parse(state(direct)).a;
  if (!(D.trades.length >= 3 && D.trades.some((t) => t.be) && direct.J.evs.some((e) => e.type === "seance") && direct.J.evs.some((e) => e.src === "user"))) errors.push("btRewind : scénario de test trop pauvre " + JSON.stringify({ n: D.trades.length, be: D.trades.map((t) => t.be), types: [...new Set(direct.J.evs.map((e) => e.type))] }));
  for (const i0 of [S0, 11, 30, 31, 32, 90, 151, 200, 330, 331, 515, 529, 535, 540, 541, 650, I1]) {
    const E = engine(true); E.start(S0); run(E, S0, I1);
    const ref = engine(true); ref.start(S0); run(ref, S0, i0, true); // replay direct jusqu'à t0 (sans l'action faite sur la bougie t0)
    if (!rewind(E, i0)) { errors.push(`btRewind : retour à la bougie ${i0} refusé`); continue; }
    if (state(E) !== state(ref)) errors.push(`btRewind : revenir à t0 (bougie ${i0}) ≠ replay direct jusqu'à t0`);
    if (E.J.evs.some((e) => e.t > bars[i0][0] || (e.t === bars[i0][0] && e.src === "user"))) errors.push(`btRewind : événements après t0 (bougie ${i0}) non supprimés`);
    if (SCRIPT[i0]) { SCRIPT[i0](E); E.commit(bars[i0][0], "user"); } // l'utilisateur refait son action sur t0, puis rejoue jusqu'à t1
    run(E, i0, I1);
    if (state(E) !== state(direct)) errors.push(`btRewind : rejouer jusqu'à t1, revenir à t0 (bougie ${i0}), rejouer jusqu'à t1 ≠ replay direct ` + JSON.stringify({ got: JSON.parse(state(E)).a.bal, want: D.bal }));
  }
  // breakeven auto activé après coup : la reprise ne l'invente pas (il aurait été un événement du journal)
  for (const i0 of [35, 37, 40, 300, 532, 536]) {
    const E2 = engine(false); E2.start(S0); run(E2, S0, I1); E2.ctx.P.beOn = true; rewind(E2, i0);
    const R2 = engine(false); R2.start(S0); run(R2, S0, i0, true);
    if (state(E2) !== state(R2)) { errors.push(`btRewind : la reprise (bougie ${i0}) a appliqué un breakeven qui n'avait pas eu lieu`); break; }
  }
  // avant le début du journal : refusé ; aperçu de ce qui sera annulé ; plafond du stockage
  const E3 = engine(true); E3.start(100); run(E3, 100, 400);
  if (RW.back(E3.J, bars[50][0], E3.ctx.A) !== null || RW.pick(E3.J.evs, bars[99][0]) !== -1) errors.push("btRewind : retour avant le début du journal accepté");
  const k3 = RW.pick(E3.J.evs, bars[130][0]), d3 = RW.diff(E3.ctx.A, RW.restore(E3.J.evs, k3, E3.ctx.A));
  if (!(d3.n > 0 && d3.trades.length === E3.ctx.A.trades.length - RW.restore(E3.J.evs, k3, E3.ctx.A).trades.length)) errors.push("btRewind.diff : " + JSON.stringify({ n: d3.n, t: d3.trades.length }));
  const J4 = JSON.parse(JSON.stringify(E3.J)), n4 = J4.evs.length; RW.cap(J4, 5);
  if (!(J4.evs.length === 5 && J4.evs[0].src === "origin" && RW.cfgAt(J4.evs, 0) && n4 > 5)) errors.push("btRewind.cap : " + JSON.stringify({ n: J4.evs.length, src: J4.evs[0] && J4.evs[0].src }));
} catch (e) { errors.push("btRewind : " + e.message); }

try {
  const rules = new Function(grab("btRules") + "; return btRules;")(), near = (a, b) => Math.abs(a - b) < 1e-9;
  const cfg = { type: "prop", size: 50000, target: 3000, mll: 2000, dll: 1000, cons: 50 };
  const acc = { cfg, bal: 51500, mll: 48500, rpDay: -200, dllHit: false, blown: false, trades: [{ day: "a", pnl: 1000 }, { day: "b", pnl: 700 }, { day: "c", pnl: -200 }] };
  const R = rules(acc, -300, "c"), by = (id) => R.rows.find((r) => r.id === id);
  // équité 51 200, cumul 1 200, jour −500 ; meilleur jour 1 000 = 83 % du cumul (> 50 %) : il manque 800 $ de profit
  if (!(R.prop && near(R.eq, 51200) && near(by("target").value, 1200) && near(by("target").margin, 1800) && near(by("target").prog, 0.4) && by("target").st === "run")) errors.push("btRules objectif : " + JSON.stringify(by("target")));
  if (!(near(by("dll").value, -500) && near(by("dll").margin, 500) && near(by("dll").prog, 0.5) && by("dll").st === "run")) errors.push("btRules DLL : " + JSON.stringify(by("dll")));
  if (!(near(by("mll").margin, 2700) && by("mll").prog === 0 && by("mll").st === "run")) errors.push("btRules MLL : " + JSON.stringify(by("mll")));
  if (!(by("cons").st === "warn" && near(by("cons").value, 1000 / 1200 * 100) && near(by("cons").need, 800) && near(by("cons").margin, 600 - 1000) && by("cons").prog === 1 && !R.pass)) errors.push("btRules consistance : " + JSON.stringify(by("cons")));
  const R2 = rules({ ...acc, bal: 49000, mll: 48500, rpDay: -900 }, -150, "c"), m2 = R2.rows.find((r) => r.id === "mll"), d2 = R2.rows.find((r) => r.id === "dll");
  if (!(near(m2.margin, 350) && near(m2.prog, 1650 / 2000) && m2.st === "warn" && d2.st === "ko" && near(d2.margin, -50))) errors.push("btRules MLL / DLL proches : " + JSON.stringify({ m2, d2 }));
  const R3 = rules({ cfg, bal: 53400, mll: 50000, rpDay: 0, trades: [{ day: "a", pnl: 1200 }, { day: "b", pnl: 1100 }, { day: "c", pnl: 1100 }] }, 0, "d");
  if (!(R3.pass && R3.rows.every((r) => r.st !== "ko") && R3.rows.find((r) => r.id === "cons").st === "ok" && near(R3.rows.find((r) => r.id === "cons").margin, 1700 - 1200))) errors.push("btRules réussite : " + JSON.stringify(R3));
  if (rules({ ...acc, blown: true }, 0, "c").rows.find((r) => r.id === "mll").st !== "ko") errors.push("btRules : compte cramé non signalé");
  const C = rules({ ...acc, cfg: { ...cfg, type: "classic" } }, 0, "c"); if (C.prop || C.rows.length) errors.push("btRules : compte classique avec des règles");
} catch (e) { errors.push("btRules : " + e.message); }

try {
  const SS = new Function(grab("btSes") + "; return btSes;")(), eq = (n, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) errors.push(`btSes.${n} : ${JSON.stringify(a)} au lieu de ${JSON.stringify(b)}`); };
  eq("+1 jour", SS.addPeriod("2026-01-05", "d"), "2026-01-06"); eq("+1 semaine", SS.addPeriod("2026-01-05", "w"), "2026-01-12"); eq("+1 mois", SS.addPeriod("2026-12-15", "m"), "2027-01-15");
  eq("+1 mois fin de mois", SS.addPeriod("2026-01-31", "m"), "2026-02-28"); eq("+1 mois bissextile", SS.addPeriod("2028-01-31", "m"), "2028-02-29"); eq("date invalide", SS.addPeriod("x", "d"), null);
  eq("fin automatique", SS.period({ start: "2026-01-05", auto: true, end: "2026-01-09" }), { ok: true, start: "2026-01-05", end: null });
  eq("fin datée", SS.period({ start: "2026-01-05", end: "2026-02-05" }), { ok: true, start: "2026-01-05", end: "2026-02-05" });
  eq("fin avant le départ", SS.period({ start: "2026-01-05", end: "2026-01-02" }).ok, false);
  eq("départ hors des données", SS.period({ start: "2023-01-05", min: "2023-07-03", max: "2026-11-18", auto: true }).ok, false);
  const days = SS.weekdays("2026-01-01", "2026-01-31");
  eq("jours ouvrés", [days.length, days[0], days[1], days[days.length - 1]], [22, "2026-01-01", "2026-01-02", "2026-01-30"]);
  eq("tirage borne basse", SS.pickDay(days, "2026-01-10", "2026-01-20", () => 0), "2026-01-12"); eq("tirage borne haute", SS.pickDay(days, "2026-01-10", "2026-01-20", () => 0.9999999), "2026-01-20");
  eq("tirage sans jour", SS.pickDay(days, "2026-02-01", null, Math.random), null);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), drawn = new Set();
  for (let i = 0; i < 300; i++) { const d = SS.pickDay(days, "2026-01-08", "2026-01-23", rnd); drawn.add(d); if (!(d >= "2026-01-08" && d <= "2026-01-23" && days.includes(d))) { errors.push("btSes.pickDay hors bornes : " + d); break; } }
  if (drawn.size !== 12) errors.push("btSes.pickDay : tous les jours des bornes devraient sortir (" + drawn.size + " / 12)");
  eq("fin de session (17:00 NY)", [SS.endT("2026-01-06", nyT) === nyT("2026-01-06", 17, 0), SS.over(nyT("2026-01-06", 16, 59), "2026-01-06", nyT), SS.over(nyT("2026-01-06", 18, 0), "2026-01-06", nyT), SS.over(nyT("2026-03-01", 9, 0), null, nyT), SS.endT(null, nyT)], [true, false, true, false, null]);
} catch (e) { errors.push("btSes : " + e.message); }

// v1.67 · Phase 1b salle blanche (pages du Backtesteur) : actifs des CSV, coûts par défaut, corbeille, trades backtest, chiffres d'une stratégie, temps passé, presets, routage
try {
  const N = new Function(grab("btNav") + "; return btNav;")(), eq = (n, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) errors.push(`btNav.${n} : ${JSON.stringify(a)} au lieu de ${JSON.stringify(b)}`); };
  const day = (t) => new Date(t * 1000).toISOString().slice(0, 10), U = { MNQ: "NQ", MES: "ES" }, und = (k) => U[k] || k, ORD = ["NQ", "ES", "MNQ", "MES"];
  // 1. actifs : seulement ceux qui ont des bougies m1 ; micro sans fichier = bougies du sous-jacent ; autres symboles signalés à part
  const t0 = Date.UTC(2023, 6, 3, 13) / 1000, t1 = Date.UTC(2026, 10, 18, 21) / 1000, s1 = [t1 - 4 * 86400, t1];
  const A1 = N.assets({ syms: { NQ: { m1: [t0, t1], s1: null }, ES: { m1: [t0 + 86400, t1], s1 }, MES: { m1: null, s1 }, YM: { m1: [t0, t1] }, CL: { m1: null, s1 } } }, ORD, und, day);
  eq("assets", A1.list.map((a) => [a.sym, a.min, a.max, a.via]), [["NQ", "2023-07-03", "2026-11-18", null], ["ES", "2023-07-04", "2026-11-18", null], ["MNQ", "2023-07-03", "2026-11-18", "NQ"], ["MES", "2023-07-04", "2026-11-18", "ES"]]);
  eq("assets 1 s", [A1.list[1].s1, A1.list[3].s1, A1.list[0].s1], [{ min: "2026-11-14", max: "2026-11-18" }, { min: "2026-11-14", max: "2026-11-18" }, null]);
  eq("assets autres symboles", A1.other, ["YM"]); eq("assets vides", [N.assets(null, ORD, und, day).list, N.assets({ syms: { ES: { s1 } } }, ORD, und, day).list], [[], []]);
  // 2. coûts : lignes proposées (actifs des CSV, frais par défaut, 1 tick), enregistrées (nettoyées), coûts de la session (désactivés = prix brut)
  const def = (k) => ({ NQ: 2.8, ES: 2.8, MNQ: 0.74, MES: 0.74 })[k];
  eq("costRows proposées", N.costRows(null, ["NQ", "MES"], def), [{ sym: "NQ", spread: 1, fee: 2.8 }, { sym: "MES", spread: 1, fee: 0.74 }]);
  eq("costRows enregistrées", N.costRows({ rows: [{ sym: "NQ", spread: 2, fee: 4 }, { sym: "ES", spread: -1, fee: "" }, null, { spread: 1 }] }, ["NQ"], def), [{ sym: "NQ", spread: 2, fee: 4 }, { sym: "ES", spread: 0, fee: 2.8 }]);
  const R1 = [{ sym: "NQ", spread: 2, fee: 4 }, { sym: "MNQ", spread: 1, fee: 1.5 }];
  eq("costCfg", N.costCfg(R1, ["NQ", "ES", "MNQ"], { slip: 2.6, def }), { fees: { NQ: 4, ES: 2.8, MNQ: 1.5 }, spreads: { NQ: 2, ES: 1, MNQ: 1 }, slip: 3, feeBig: 4, feeMic: 1.5 });
  eq("costCfg prix brut", N.costCfg(R1, ["ES"], { fee: false, spread: false, def }), { fees: { ES: 0 }, spreads: { ES: 0 }, slip: 0, feeBig: 0, feeMic: 0 });
  eq("costCfg micro absent", N.costCfg(R1, ["ES"], { def }).feeMic, 0.74);
  eq("slippage", [N.slipOf("0"), N.slipOf("2"), N.slipOf("fix", 3.4), N.slipOf("fix", -2), N.slipLvl(1), N.slipLvl(4)], [0, 2, 3, 0, { lvl: "1", n: 1 }, { lvl: "fix", n: 4 }]);
  // 3. corbeille : supprimer = déplacer (date gardée), restaurer à sa place, purger ; clés exactes de la session (x1 ≠ x12), copie de clés, pages
  const L0 = [{ id: "x3", name: "c", created: "2026-11-03" }, { id: "x1", name: "a", created: "2026-11-01" }], d1 = N.trash.del(L0, [], "x3", "2026-11-19T10:00:00Z");
  eq("trash.del", [d1.list.map((r) => r.id), d1.bin.map((r) => [r.id, r.deletedAt])], [["x1"], [["x3", "2026-11-19T10:00:00Z"]]]);
  const r1 = N.trash.restore([{ id: "x4", created: "2026-11-04" }, ...d1.list], d1.bin, "x3");
  eq("trash.restore", [r1.list.map((r) => r.id), r1.bin.length, "deletedAt" in r1.list[1]], [["x4", "x3", "x1"], 0, false]);
  eq("trash.del inconnu", N.trash.del(L0, [], "zz", ""), null); eq("trash.purge", N.trash.purge(d1.bin, "x3"), []);
  const K = ["bt-ses", "bt-ses-x1", "bt-ses-x1-ev", "bt-ses-x12", "bt-ses-x12-ev", "bt-draw-ses-x1-NQ", "bt-draw-ses-x1-NQ-f", "bt-draw2-ses-x1-ES", "bt-draw-ses-x12-NQ", "bt-ses-cur", "bt-acc"];
  eq("trash.keys", N.trash.keys("x1", K), ["bt-ses-x1", "bt-ses-x1-ev", "bt-draw-ses-x1-NQ", "bt-draw-ses-x1-NQ-f", "bt-draw2-ses-x1-ES"]);
  eq("trash.rekey", N.trash.keys("x1", K).map((k) => N.trash.rekey(k, "x1", "y9")), ["bt-ses-y9", "bt-ses-y9-ev", "bt-draw-ses-y9-NQ", "bt-draw-ses-y9-NQ-f", "bt-draw2-ses-y9-ES"]);
  const B25 = Array.from({ length: 25 }, (_, i) => ({ id: "b" + i, deletedAt: "2026-11-" + String(i + 1).padStart(2, "0") })), pg2 = N.trash.page(B25, 9, 20);
  eq("trash.page", [pg2.page, pg2.pages, pg2.total, pg2.rows.length, pg2.rows[0].id, N.trash.page(B25, 0, 20).rows[0].id, N.trash.page([], 3, 20).pages], [1, 2, 25, 5, "b4", "b24", 1]);
  // 4. trades backtest : doublons (copie d'un compte) gardés une fois dans la 1re source, $ / % / R, filtres, tri
  const CT = { NQ: { pv: 20 }, MNQ: { pv: 2 } }, tr = (id, side, entry, exit, tIn, pnl, r0, extra) => ({ id, ctr: "NQ", side, qty: 1, entry, exit, tIn, tOut: tIn + 600, pnl, r0, tags: [], ...(extra || {}) });
  const ta = tr(1, "Long", 100, 110, 1e9, 197.2, 10), tb = tr(2, "Short", 120, 125, 1e9 + 3600, -102.8, 5, { tags: ["FVG"], note: "trop tôt" }), tc = tr(3, "Long", 130, 130.25, 1e9 + 7200, 2.2, null);
  const SRC = [{ type: "ses", id: "x1", name: "Session A", strat: "SB AM", start: 50000, trades: [ta, tb] }, { type: "base", id: "base", name: "Base", strat: "", start: 100000, trades: [tc, { ...ta, id: 9 }] },
    { type: "snap", id: "s1", name: "Snap", strat: "NWOG", start: 50000, trades: [{ ...tc, id: 7 }, { tOut: null }] }, { type: "rec", id: "j1", name: "Rec", start: 50000, trades: [{ ...tb, id: undefined, pnl: -102.8 }] }];
  const T = N.collect(SRC, CT);
  eq("collect doublons", T.map((t) => t.key), ["ses:x1:1", "ses:x1:2", "base:base:3"]);
  eq("collect $ % R", [T[0].R, T[0].pct, T[1].R, T[2].R, T[2].pct], [197.2 / 200, 197.2 / 50000, -102.8 / 100, null, 2.2 / 100000]);
  eq("outcome", T.map((t) => N.outcome(t)), ["w", "l", "w"]); eq("outcome sans stop", N.outcome({ R: null, pnl: 0.5 }), "be"); eq("outcome breakeven R", N.outcome({ R: 0.08, pnl: 16 }), "be");
  const f = (o) => N.filter(T, { dayOf: day, ...o }).map((t) => t.key.split(":")[2]);
  eq("filter", [f({}), f({ src: [] }), f({ src: ["base:base"] }), f({ side: "Short" }), f({ res: "w" }), f({ strat: ["sb am"] }), f({ q: "TROP" }), f({ q: "fvg" }), f({ from: day(1e9 + 7800), to: day(1e9 + 7800) })],
    [["1", "2", "3"], [], ["3"], ["2"], ["1", "3"], ["1", "2"], ["2"], ["2"], ["1", "2", "3"]]);
  eq("sort", [N.sort(T, "pnl", "desc").map((t) => t.pnl), N.sort(T, "R", "asc").map((t) => t.R === null ? null : +t.R.toFixed(3)), N.sort(T, "date", "asc").map((t) => t.tIn - 1e9)], [[197.2, 2.2, -102.8], [null, -1.028, 0.986], [0, 3600, 7200]]);
  // 5. chiffres d'une stratégie : win rate hors breakeven, R:R moyen, drawdown max du P&L cumulé
  const tz = (pnl, k, R) => ({ pnl, tIn: k, tOut: k + 1, R: R === undefined ? pnl / 100 : R, side: pnl > 0 ? "Long" : "Short" });
  const S5 = N.stats([tz(300, 1), tz(-100, 2), tz(-200, 3), tz(5, 4), tz(400, 5), tz(-100, 6)]);
  eq("stats", [S5.n, S5.wins, S5.losses, S5.be, S5.wr, S5.pnl, S5.avgW, S5.avgL, +S5.rr.toFixed(4), S5.mdd, S5.curve, S5.buys, S5.sells], [6, 2, 3, 1, 0.4, 305, 350, 400 / 3, 2.625, 300, [0, 300, 200, 0, 5, 405, 305], 3, 3]);
  eq("stats vides", [N.stats([]).wr, N.stats([]).rr, N.stats([tz(50, 1)]).rr, N.stats([tz(-50, 1)]).mdd], [null, null, Infinity, 50]);
  // 6. stratégies : fiches + noms tapés dans les sessions (reliés par le nom, alias après renommage, noms retirés)
  const ST = N.strategies({ list: [{ id: "st1", name: "SB AM", alias: ["Silver Bullet"], rules: ["1st FVG"] }], hide: ["vieux modèle"] }, [{ name: "silver  bullet", n: 2 }, { name: "NWOG", n: 1 }, { name: "Vieux modèle", n: 3 }, { name: "  ", n: 1 }, { name: "nwog", n: 1 }]);
  eq("strategies", ST.map((s) => [s.id, s.name, s.saved, s.n, s.names]), [["st1", "SB AM", true, 2, ["sb am", "silver bullet"]], ["n" + N.hash("nwog"), "NWOG", false, 2, ["nwog"]]]);
  eq("linked", [N.linked(ST[0], "Silver Bullet"), N.linked(ST[0], "SB  AM"), N.linked(ST[0], ""), N.linked(ST[1], "SB AM")], [true, true, false, false]);
  eq("uniqueName", [N.uniqueName("A (copie)", ["a (copie)", "A (copie) 2"]), N.uniqueName("B", ["A"]), N.uniqueName("", [])], ["A (copie) 3", "B", "Stratégie"]);
  // 7. progression : semaine depuis le lundi, mois depuis le 1er (jours de New York) ; trades d'avant le suivi seulement dans « Tout »
  eq("since", [N.since("week", "2026-11-19"), N.since("week", "2026-11-16"), N.since("week", "2026-11-22"), N.since("month", "2026-11-19"), N.since("all", "2026-11-19")], ["2026-11-16", "2026-11-16", "2026-11-16", "2026-11-01", null]);
  const log = { d: {} }; N.addTime(log, "2026-11-10", "base", 600, 1200); N.addTime(log, "2026-11-17", "x1", 300, 3600); N.addTime(log, "2026-11-17", "x1", 60, 0); N.addTime(log, "2026-11-18", "base", 0, 60);
  const TT = [{ ...T[0] }, { ...T[1] }, { ...T[2] }];
  eq("markTrades", [N.markTrades(log, [ta], "2026-11-17"), N.markTrades(log, [ta, tb], "2026-11-18"), N.markTrades(log, [{ ...ta, id: 99 }], "2026-11-19")], [1, 1, 0]);
  const pw = N.progress(log, TT, "week", "2026-11-19"), pm = N.progress(log, TT, "month", "2026-11-19"), pa = N.progress(log, TT, "all", "2026-11-19");
  eq("progress", [[pw.real, pw.market, pw.days, pw.n, pw.buys, pw.sells], [pm.real, pm.market, pm.days, pm.n], [pa.real, pa.n, pa.wr]], [[360, 3660, 1, 2, 1, 1], [960, 4860, 2, 2], [960, 3, 2 / 3]]);
  eq("marketStep", [N.marketStep(null, 60), N.marketStep(60, 120), N.marketStep(60, 61), N.marketStep(60, 86400), N.marketStep(120, 60)], [0, 60, 1, 60, 0]);
  // v1.68 (livraison B) · TDB-01 / 02 : filtre d'activité, jours d'entraînement (au moins 5 min), série, objectif, win rate dans le temps, trades par actif
  const ck = (c) => (c === "base" ? "backtest" : c === "x1" ? "challenge" : null), TK = TT.map((t, i) => ({ ...t, kind: i === 1 ? "challenge" : "backtest" }));
  const pk = N.progress(log, TK, "all", "2026-11-19", { kind: "challenge", ctxKind: ck }), pb = N.progress(log, TK, "all", "2026-11-19", { kind: "backtest", ctxKind: ck });
  eq("progress activité", [[pk.real, pk.market, pk.days, pk.n], [pb.real, pb.market, pb.days, pb.n]], [[360, 3600, 1, 1], [600, 1260, 1, 2]]);
  eq("kindOf", [N.kindOf("challenge"), N.kindOf("free"), N.kindOf(undefined), N.kindOf(null)], ["challenge", "backtest", "backtest", "backtest"]);
  eq("dayAdd", [N.dayAdd("2026-11-30", 1), N.dayAdd("2026-03-01", -1), N.dayAdd("2026-11-08", 7)], ["2026-12-01", "2026-02-28", "2026-11-15"]);
  eq("daily", N.daily(log, "2026-11-16", "2026-11-19").map((x) => [x.day.slice(8), x.real, x.market]), [["16", 0, 0], ["17", 360, 3600], ["18", 0, 60], ["19", 0, 0]]);
  const lg = { d: {} }; ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-16", "2026-11-17", "2026-11-18"].forEach((d) => N.addTime(lg, d, "base", 400, 0)); N.addTime(lg, "2026-11-13", "base", 120, 0); N.addTime(lg, "2026-11-19", "x1", 900, 0);
  const sk = (today, o) => { const r = N.streak(lg, today, o); return [r.cur, r.best, r.today]; };
  eq("streak", [sk("2026-11-19"), sk("2026-11-20"), sk("2026-11-21"), sk("2026-11-18"), sk("2026-11-19", { kind: "backtest", ctxKind: ck })], [[4, 4, true], [4, 4, false], [0, 4, false], [3, 3, true], [3, 3, false]]);
  const gd = N.goal(lg, { mode: "day", h: 0.5 }, "2026-11-19"), gw = N.goal(lg, { mode: "week", h: 1 }, "2026-11-19"), g0 = N.goal(lg, null, "2026-11-19");
  eq("goal", [[gd.mode, gd.done, gd.target, +gd.pct.toFixed(3)], [gw.mode, gw.from, gw.done, gw.target, +gw.pct.toFixed(3)], [g0.mode, g0.target, g0.pct]], [["day", 900, 1800, 0.5], ["week", "2026-11-16", 2100, 3600, 0.583], ["day", 0, 0]]);
  eq("goal sans effet sur la série", [N.streak(lg, "2026-11-19").cur], [4]);
  const W3 = [{ ...TK[0], tk: "a" }, { ...TK[1], tk: "b" }, { ...TK[2], tk: "c" }, { ...TK[0], tk: "d" }];
  eq("wrSeries", N.wrSeries(W3, { a: "2026-11-17", b: "2026-11-17", c: "2026-11-18" }, null, "2026-11-19").map((x) => [x.day.slice(8), x.n, x.w, x.l, x.wr, x.cum]), [["17", 2, 1, 1, 0.5, 0.5], ["18", 1, 1, 0, 1, 2 / 3]]);
  eq("wrSeries période", N.wrSeries(W3, { a: "2026-11-17", c: "2026-11-18" }, "2026-11-18", "2026-11-19").map((x) => x.day), ["2026-11-18"]);
  const BA = N.byAsset([{ ...TK[0], ctr: "ES" }, TK[1], TK[2], { ...TK[2], ctr: "YM" }, { ...TK[0], ctr: "MNQ" }], ["NQ", "ES", "MNQ", "MES"]);
  eq("byAsset", BA.map((x) => [x.ctr, x.n, x.wins, x.losses, x.wr]), [["NQ", 2, 1, 1, 0.5], ["ES", 1, 1, 0, 1], ["MNQ", 1, 1, 0, 1], ["YM", 1, 1, 0, 1]]);
  // STR-01 : trades d'une stratégie (nom de la session ou ajout à la main), checklist des règles
  const sA = N.strategies({ list: [{ id: "st1", name: "SB AM", manual: [T[2].tk] }] }, [])[0];
  eq("stratTrades", N.stratTrades(T, sA).map((t) => [t.key, t.via]), [["ses:x1:1", "nom"], ["ses:x1:2", "nom"], ["base:base:3", "ajout"]]);
  eq("checks", [N.checks({ checks: { r1: true, r3: true, rx: true } }, [{ id: "r1" }, { id: "r2" }, { id: "r3" }]), N.checks({}, []), N.checks(null, [{ id: "r1" }])], [{ done: 2, total: 3 }, { done: 0, total: 0 }, { done: 0, total: 1 }]);
  eq("rulesBy", N.rulesBy([{ id: "a", cat: "sortie", text: "TP" }, { id: "b", cat: "entree", text: "FVG" }, { id: "c", cat: "zz", text: "?" }, { id: "d", cat: "entree", text: "MSS" }]).map((g) => [g.k, g.rules.map((r) => r.id)]), [["entree", ["b", "d"]], ["sortie", ["a"]], ["autre", ["c"]]]);
  // JRN-08 : groupes de tags, tags libres, recherche, ordre
  const TG = [{ id: "g1", name: "Setups", color: "#2962ff", tags: [{ name: "FVG" }, { name: "OB", color: "#ff9800" }] }, { id: "g2", name: "Erreurs", color: "#ef5350", tags: [{ name: "Trop tôt" }, { name: "fvg" }] }];
  const TM = N.tagMap(TG); eq("tagMap", [TM.get("fvg"), TM.get("ob").color, TM.get("trop tôt").group, TM.has("x")], [{ name: "FVG", color: "#2962ff", group: "g1" }, "#ff9800", "g2", false]);
  eq("tagsFree", N.tagsFree(["fvg", "News ", "news", "A+", "OB"], TG), ["A+", "News"]);
  eq("tagFind", [N.tagFind(TG, "err").map((g) => [g.id, g.tags.length]), N.tagFind(TG, "fv").map((g) => [g.id, g.tags.map((t) => t.name)]), N.tagFind(TG, "").length, N.tagFind(TG, "zz")], [[["g2", 2]], [["g1", ["FVG"]], ["g2", ["fvg"]]], 2, []]);
  eq("move", [N.move([1, 2, 3], 0, 1), N.move([1, 2, 3], 2, -1), N.move([1, 2, 3], 0, -1), N.move([1, 2, 3], 2, 1)], [[2, 1, 3], [1, 3, 2], [1, 2, 3], [1, 2, 3]]);
  // JRN-07 : modèles (champs remplacés, ajout à la note), checklists posées sur un trade, liste filtrée
  eq("tplFill", N.tplFill("{contrat} {sens} {date} {session} {strategie} {resultat} {autre}", { contrat: "NQZ26", sens: "Long", date: "17/11/2026 09:31", session: "S1", strategie: "SB", resultat: "+$100.00" }), "NQZ26 Long 17/11/2026 09:31 S1 SB +$100.00 {autre}");
  eq("noteApply", [N.noteApply("", "B"), N.noteApply("A  \n", "B"), N.noteApply("A", ""), N.noteApply(null, null)], ["B", "A\n\nB", "A", ""]);
  const LA = N.listAdd([{ id: "c1", name: "X", items: [{ t: "a", ok: true }] }], { id: "c2", name: "Contrôle", items: ["DLL ok", " ", "Taille ok"] });
  eq("listAdd", [LA.map((x) => [x.id, x.items.length]), N.listAdd(LA, { id: "c2", items: ["z"] }).length, N.listAdd(null, null)], [[["c1", 1], ["c2", 2]], 2, []]);
  eq("listCount", [N.listCount(LA), N.listCount(null)], [{ done: 1, total: 3 }, { done: 0, total: 0 }]);
  const TP = [{ id: "b1", name: "Review", type: "note", content: "Plan respecté", fav: false }, { id: "b2", name: "Contrôle prop", type: "checklist", items: ["DLL"], fav: true }, { id: "u1", name: "Ma note", type: "note", content: "x", fav: false }];
  eq("tplList", [N.tplList(TP, {}).map((t) => t.id), N.tplList(TP, { q: "dll" }).map((t) => t.id), N.tplList(TP, { fav: true }).map((t) => t.id), N.tplList(TP, { type: "note" }).map((t) => t.id), N.tplList(TP, { q: "PLAN" }).map((t) => t.id)], [["b2", "u1", "b1"], ["b2"], ["b2"], ["u1", "b1"], ["b1"]]);
  // 8. presets de session : sans le nom ni la date de départ ; appliqués sur le brouillon
  const pv = N.presetOf({ kind: "prop", name: "X", from: "2026-01-05", size: 100000, rules: { target: 6000 }, assets: ["NQ"], fee: false, slipLvl: "fix", slipN: 3, err: "!" });
  eq("presetOf", pv, { kind: "prop", size: 100000, rules: { target: 6000 }, assets: ["NQ"], fee: false, slipLvl: "fix", slipN: 3 });
  const dr = N.presetApply({ kind: "bt", name: "Ma session", from: "2026-11-17", assets: ["ES"], fee: true }, pv); pv.rules.target = 1;
  eq("presetApply", [dr.kind, dr.name, dr.from, dr.assets, dr.fee, dr.rules.target], ["prop", "Ma session", "2026-11-17", ["NQ"], false, 6000]);
  // 9. routage
  eq("route", ["", "sessions", "trades", "analytique", "strategies", "strategies/st1", "parametres", "parametres/spreads", "parametres/zz", "chart", "zz"].map((p) => N.path(N.route(p))), ["", "sessions", "trades", "analytique", "strategies", "strategies/st1", "parametres/backtesting", "parametres/spreads", "parametres/backtesting", "chart", ""]);
  eq("route v1.68", ["strategies/st1/regles", "strategies/st1/docs", "strategies/st1/trades", "strategies/st1/zz", "parametres/journal", "parametres/modeles"].map((p) => N.path(N.route(p))), ["strategies/st1/regles", "strategies/st1/docs", "strategies/st1/trades", "strategies/st1", "parametres/journal", "parametres/modeles"]);
} catch (e) { errors.push("btNav : " + e.message); }

// v1.67.1 : heures à droite de la dernière bougie (btFut) — créneaux des bougies à venir, marché CME fermé sauté, aucune donnée
try {
  const F = new Function(grab("btFut") + "; return btFut;")(), eq = (n, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) errors.push(`btFut.${n} : ${JSON.stringify(a)} au lieu de ${JSON.stringify(b)}`); };
  const at = (d0) => (n, h, m) => `+${n}j ${h}:${String(m).padStart(2, "0")}`; // heure absolue lisible pour les tests de reopen
  eq("reopen CME", [[1, 10, 0], [1, 17, 30], [5, 16, 59], [5, 17, 0], [6, 12, 0], [0, 10, 0], [0, 18, 0], [4, 17, 0]].map(([wd, h, mi]) => F.reopen({ wd, h, mi }, false, at())), [null, "+0j 18:00", null, "+2j 18:00", "+1j 18:00", "+0j 18:00", null, "+0j 18:00"]);
  eq("reopen RTH", [[1, 9, 0], [1, 9, 30], [1, 16, 14], [1, 16, 15], [5, 16, 20], [6, 10, 0], [0, 20, 0], [3, 12, 0]].map(([wd, h, mi]) => F.reopen({ wd, h, mi }, true, at())), ["+0j 9:30", null, null, "+1j 9:30", "+3j 9:30", "+2j 9:30", "+1j 9:30", null]);
  // calendrier réel (heure de New York) construit comme futCal : m1, H4 aligné sur 18:00, séances quotidiennes ; marché fermé sauté d'un coup
  const nyo = (t) => { const o = {}; NYP.formatToParts(new Date(t * 1000)).forEach((x) => (o[x.type] = x.value)); const d = `${o.year}-${o.month}-${o.day}`; return { d, wd: new Date(d + "T12:00:00Z").getUTCDay(), h: +o.hour, mi: +o.minute }; };
  const addD = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const reo = (rth) => (t) => { const o = nyo(t), r = F.reopen(o, rth, (n, h, mi) => nyT(addD(o.d, n), h, mi)); return r == null ? t : r; };
  const cal = (s, bk, rth) => { const R = reo(rth), open = (b) => R(b) < b + s; return { open, next: (b) => { let nb = bk(b + s); if (nb <= b) nb = bk(b + 2 * s); if (!open(nb)) nb = bk(R(nb)); return nb; } }; };
  const lbl = (t) => { const o = nyo(t); return `${o.d} ${String(o.h).padStart(2, "0")}:${String(o.mi).padStart(2, "0")}`; };
  const m1 = cal(60, (t) => Math.floor(t / 60) * 60, false);
  eq("slots m1 vendredi soir", F.slots(nyT("2026-11-20", 16, 58), 3, m1.next, m1.open).map(lbl), ["2026-11-20 16:59", "2026-11-22 18:00", "2026-11-22 18:01"]);
  eq("slots m1 pause de 17:00", F.slots(nyT("2026-11-18", 16, 59), 2, m1.next, m1.open).map(lbl), ["2026-11-18 18:00", "2026-11-18 18:01"]);
  const h4b = (t) => { const o = nyo(t), loc = Date.UTC(+o.d.slice(0, 4), +o.d.slice(5, 7) - 1, +o.d.slice(8, 10), o.h, o.mi) / 1000, off = loc - t, a = (18 * 3600) % 14400; return Math.floor((loc - a) / 14400) * 14400 + a - off; };
  const h4 = cal(14400, h4b, false);
  eq("slots H4 (alignées sur 18:00, week-end sauté)", F.slots(nyT("2026-11-20", 10, 0), 4, h4.next, h4.open).map(lbl), ["2026-11-20 14:00", "2026-11-22 18:00", "2026-11-22 22:00", "2026-11-23 02:00"]);
  const m5r = cal(300, (t) => Math.floor(t / 300) * 300, true);
  eq("slots m5 RTH", F.slots(nyT("2026-11-20", 16, 5), 3, m5r.next, m5r.open).map(lbl), ["2026-11-20 16:10", "2026-11-23 09:30", "2026-11-23 09:35"]);
  const s1 = cal(1, (t) => t, false), t0 = Date.now();
  eq("slots 1 s (week-end sauté sans tout parcourir)", F.slots(nyT("2026-11-20", 16, 59) + 58, 3, s1.next, s1.open).map((t) => lbl(t) + ":" + String(t % 60).padStart(2, "0")), ["2026-11-20 16:59:59", "2026-11-22 18:00:00", "2026-11-22 18:00:01"]);
  if (Date.now() - t0 > 500) errors.push("btFut.slots 1 s : trop lent");
  eq("slots : rien après la fin du calendrier", F.slots(10, 5, (b) => (b < 30 ? b + 10 : b), () => true), [20, 30]);
  eq("step", [F.step([60, 120, 180], []), F.step([60, 120, 180], [60]), F.step([60, 120, 180], [60, 120]), F.step([60, 120, 180], [120]), F.step([60], [60, 120])], [{ op: "same", k: 0 }, { op: "shift", k: 1 }, { op: "shift", k: 2 }, { op: "rebuild", k: 0 }, { op: "rebuild", k: 0 }]);
  eq("pairs (heures strictement croissantes, après la dernière bougie)", F.pairs([1, 2, 3, 4], (s) => [0, 10, 20, 20, 30][s], 5), [[1, 10], [2, 20], [4, 30]]);
} catch (e) { errors.push("btFut : " + e.message); }

const invoked =new Set([...read("desktop/preload.js").matchAll(/ipcRenderer\.invoke\("([^"]+)"/g)].map((m) => m[1]));
const handled = new Set([...read("desktop/main.js").matchAll(/ipcMain\.handle\("([^"]+)"/g)].map((m) => m[1]));
for (const c of invoked) if (!handled.has(c)) errors.push(`IPC : preload appelle "${c}" sans ipcMain.handle dans main.js`);
for (const c of handled) if (!invoked.has(c)) errors.push(`IPC : main.js gère "${c}" mais preload.js ne l'expose pas`);

if (errors.length) { console.error("✗ " + errors.join("\n✗ ")); process.exit(1); }
console.log(`✓ syntaxe OK, ${invoked.size} canaux IPC alignés`);
