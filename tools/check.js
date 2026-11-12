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

const invoked =new Set([...read("desktop/preload.js").matchAll(/ipcRenderer\.invoke\("([^"]+)"/g)].map((m) => m[1]));
const handled = new Set([...read("desktop/main.js").matchAll(/ipcMain\.handle\("([^"]+)"/g)].map((m) => m[1]));
for (const c of invoked) if (!handled.has(c)) errors.push(`IPC : preload appelle "${c}" sans ipcMain.handle dans main.js`);
for (const c of handled) if (!invoked.has(c)) errors.push(`IPC : main.js gère "${c}" mais preload.js ne l'expose pas`);

if (errors.length) { console.error("✗ " + errors.join("\n✗ ")); process.exit(1); }
console.log(`✓ syntaxe OK, ${invoked.size} canaux IPC alignés`);
