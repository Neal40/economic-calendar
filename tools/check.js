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
  const src = /\/\* riskCalc:start[\s\S]*?\*\/\n([\s\S]*?)\/\* riskCalc:end \*\//.exec(html)[1], riskCalc = new Function(src + "; return riskCalc;")();
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
