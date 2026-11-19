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

const invoked =new Set([...read("desktop/preload.js").matchAll(/ipcRenderer\.invoke\("([^"]+)"/g)].map((m) => m[1]));
const handled = new Set([...read("desktop/main.js").matchAll(/ipcMain\.handle\("([^"]+)"/g)].map((m) => m[1]));
for (const c of invoked) if (!handled.has(c)) errors.push(`IPC : preload appelle "${c}" sans ipcMain.handle dans main.js`);
for (const c of handled) if (!invoked.has(c)) errors.push(`IPC : main.js gère "${c}" mais preload.js ne l'expose pas`);

if (errors.length) { console.error("✗ " + errors.join("\n✗ ")); process.exit(1); }
console.log(`✓ syntaxe OK, ${invoked.size} canaux IPC alignés`);
