// node --test : lecture des CSV de bougies (doublons, heure de New York)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { create, csvDirsOf, parseCsv, parseNY, mergeRows, csvEdges } = require("./marketdata");

test("parseNY : date sans fuseau = heure de New York (hiver et été)", () => {
  assert.strictEqual(parseNY("2026-11-06 09:30:00"), Date.parse("2026-11-06T14:30:00Z") / 1000); // EST, UTC-5
  assert.strictEqual(parseNY("2026-07-06 09:30"), Date.parse("2026-07-06T13:30:00Z") / 1000);    // EDT, UTC-4
  assert.strictEqual(parseNY("2026-11-06T14:30:00Z"), Date.parse("2026-11-06T14:30:00Z") / 1000); // fuseau explicite gardé
});

test("parseCsv : colonne ts, tri et doublons retirés", () => {
  const rows = parseCsv("time_ny,ts,open,high,low,close,volume\nx,120,1,2,0,1,5\nx,60,1,2,0,1,5\nx,120,1,2,0,1,5\n");
  assert.deepStrictEqual(rows.map((r) => r[0]), [60, 120]);
});

test("read : ignore les bougies en double laissées par une synchro interrompue", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "md-"));
  try {
    const t = Date.parse("2026-11-06T14:30:00Z") / 1000, line = (s) => `x,${s},1,2,0,1,5`;
    fs.writeFileSync(path.join(dir, "NQ_m1_2026.csv"), ["time_ny,ts,open,high,low,close,volume", line(t), line(t + 60), line(t + 60), line(t + 120), ""].join("\n"));
    const got = (await create(dir).read("NQ", t, t + 120, "m1")).map((r) => r[0]);
    assert.deepStrictEqual(got, [t, t + 60, t + 120]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("mergeRows : data_csv gagne sur une même heure, la synchro comble les trous", () => {
  const got = mergeRows([[60, 1], [180, 1]], [[0, 2], [60, 2], [120, 2], [240, 2]]);
  assert.deepStrictEqual(got, [[0, 2], [60, 1], [120, 2], [180, 1], [240, 2]]);
  assert.deepStrictEqual(mergeRows(null, [[0, 2]]), [[0, 2]]);
  assert.deepStrictEqual(mergeRows([[0, 1]], []), [[0, 1]]);
});

test("dossier data_csv : un fichier par unité, trous du m1 comblés par la synchro, micros repliés sur NQ, 3M / 6M / 12M recalculés depuis le D", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "md-")), csv = path.join(dir, "data_csv"); fs.mkdirSync(csv);
  try {
    const H = "time_ny,ts,open,high,low,close,volume", t = Date.parse("2026-11-06T14:30:00Z") / 1000, line = (s, c = 1) => `x,${s},1,2,0,${c},5`;
    fs.writeFileSync(path.join(dir, "NQ_m1_2026.csv"), [H, line(t, 9), line(t + 60, 9), line(t + 120, 9), ""].join("\n"));          // synchro : 3 minutes
    fs.writeFileSync(path.join(csv, "NQ_m1.csv"), [H, line(t), line(t + 120), ""].join("\r\n"));                                    // data_csv : trou à t + 60
    fs.writeFileSync(path.join(csv, "NQ_5s.csv"), [H, line(t + 10), line(t + 5), line(t + 5), line(t), ""].join("\n"));               // pas trié + doublon
    fs.writeFileSync(path.join(csv, "NQ_D.csv"), [H, ...["2026-03-02", "2026-03-03", "2026-04-01", "2026-07-01"].map((d, i) => `${d} 09:30:00,${parseNY(d + " 09:30:00")},${10 + i},${20 + i},${5 + i},${15 + i},100`), ""].join("\n"));
    const S = create(dir, { csvDirs: [path.join(dir, "absent"), csv] });
    assert.strictEqual(S.csvDir(), csv);
    assert.deepStrictEqual((await S.read("NQ", t, t + 120, "m1")).map((r) => [r[0] - t, r[4]]), [[0, 1], [60, 9], [120, 1]]);
    assert.deepStrictEqual((await S.read("MNQ", t, t + 120, "m1")).map((r) => r[4]), [1, 9, 1]);                                       // MNQ sans fichier : bougies du NQ (data_csv + synchro), v1.67.1
    assert.deepStrictEqual((await S.readTf("NQ", "5s", 0, 2e9)).map((r) => r[0] - t), [0, 5, 10]);
    assert.deepStrictEqual((await S.readTf("NQ", "5s", t + 5, t + 5)).length, 1);
    assert.deepStrictEqual((await S.readTf("NQ", "3M", 0, 2e9)).map((r) => r.slice(1)), [[10, 21, 5, 16, 200], [12, 22, 7, 17, 100], [13, 23, 8, 18, 100]]);
    assert.deepStrictEqual((await S.readTf("NQ", "6M", 0, 2e9)).map((r) => r[5]), [300, 100]);
    assert.deepStrictEqual((await S.readTf("MNQ", "12M", 0, 2e9)).map((r) => r.slice(1)), [[10, 23, 5, 18, 400]]);                    // micro -> NQ
    assert.strictEqual(await S.readTf("NQ", "m15", 0, 2e9), null);
    assert.deepStrictEqual(await S.span("NQ", "5s"), [t, t + 10]);
    assert.deepStrictEqual(S.status().csv.syms.NQ.sort(), ["5s", "D", "m1"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("v1.67 assets / csvEdges : actifs des dossiers data_csv et data avec leurs bornes, sans lire les fichiers en entier", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "md-")), csv = path.join(dir, "data_csv"); fs.mkdirSync(csv);
  try {
    const H = "time_ny,ts,open,high,low,close,volume", t = Date.parse("2026-11-06T14:30:00Z") / 1000, line = (s) => `x,${s},1,2,0,1,5`;
    // data_csv : NQ m1 (gros fichier : la fin est lue à part), ES 1 s ; un fichier d'une autre unité n'est pas un actif de replay
    const big = [H]; for (let i = 0; i < 6000; i++) big.push(line(t + i * 60)); big.push("");
    fs.writeFileSync(path.join(csv, "NQ_m1.csv"), big.join("\r\n"));
    fs.writeFileSync(path.join(csv, "ES_1s.csv"), [H, line(t), line(t + 1), ""].join("\n"));
    fs.writeFileSync(path.join(csv, "YM_D.csv"), [H, line(t), ""].join("\n"));
    // data (synchro) : NQ un fichier par an, ES m1 avec des heures en texte de New York ; fichiers vides ou sans colonne ts ignorés
    fs.writeFileSync(path.join(dir, "NQ_m1_2025.csv"), [H, line(t - 400 * 86400), line(t - 300 * 86400), ""].join("\n"));
    fs.writeFileSync(path.join(dir, "ES_m1_2026.csv"), ["time,open,high,low,close", "2026-11-05 09:30:00,1,2,0,1", "2026-11-05 09:31:00,1,2,0,1", ""].join("\n"));
    fs.writeFileSync(path.join(dir, "ES_1s_2026-11.csv"), "");
    fs.writeFileSync(path.join(dir, "MES_m1_2026.csv"), "date,open\n2026-11-05,1\n");
    const S = create(dir, { csvDirs: [csv] }), a = await S.assets();
    assert.strictEqual(a.csvDir, csv);
    assert.deepStrictEqual(Object.keys(a.syms).sort(), ["ES", "NQ"]);
    assert.deepStrictEqual(a.syms.NQ.m1, [t - 400 * 86400, t + 5999 * 60]);
    assert.deepStrictEqual(a.syms.NQ.src.sort(), ["data", "data_csv"]);
    assert.strictEqual(a.syms.NQ.s1, null);
    assert.deepStrictEqual(a.syms.ES.s1, [t, t + 1]);
    assert.deepStrictEqual(a.syms.ES.m1, [parseNY("2026-11-05 09:30:00"), parseNY("2026-11-05 09:31:00")]);
    assert.deepStrictEqual(await csvEdges(path.join(csv, "NQ_m1.csv"), 4096), [t, t + 5999 * 60]); // lecture par petits blocs : même résultat
    assert.strictEqual(await csvEdges(path.join(dir, "absent.csv")), null);
    assert.deepStrictEqual(await create(path.join(dir, "vide")).assets().then((x) => x.syms), {});
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("v1.67.1 micros : leurs propres bougies dans le data_csv d'un sous-dossier du dossier ICT ; sous-jacent seulement si le fichier du micro manque", async () => {
  const ict = fs.mkdtempSync(path.join(os.tmpdir(), "ict-"));
  try {
    const H = "time_ny,ts,open,high,low,close,volume", t = Date.parse("2026-11-06T14:30:00Z") / 1000, line = (s, c) => `x,${s},1,2,0,${c},5`;
    const csv = path.join(ict, "economic-calendar-main", "data_csv"), data = path.join(ict, "data");
    [csv, data, path.join(ict, "inner_circle_trader_main"), path.join(ict, "backups")].forEach((d) => fs.mkdirSync(d, { recursive: true }));
    const put = (f, rows) => fs.writeFileSync(path.join(csv, f), [H, ...rows, ""].join("\n"));
    put("NQ_m1.csv", [line(t, 1), line(t + 60, 1), line(t + 120, 1)]);
    put("MNQ_m1.csv", [line(t, 2), line(t + 120, 2)]);                          // pas de bougie MNQ à t + 60
    put("MNQ_1s.csv", [line(t, 22), line(t + 1, 22)]);
    put("ES_m1.csv", [line(t, 3)]); put("ES_1s.csv", [line(t, 33)]); put("ES_m5.csv", [line(t, 7)]);
    put("MES_m1.csv", [line(t, 4)]);                                            // MES : ni 1 s ni m5
    put("NQ_m5.csv", [line(t, 5)]); put("MNQ_m5.csv", [line(t, 6)]);
    fs.writeFileSync(path.join(data, "NQ_m1_2026.csv"), [H, line(t + 60, 9), line(t + 180, 9), ""].join("\n")); // synchro du NQ
    const dirs = csvDirsOf(ict, ["extra"]);
    assert.deepStrictEqual(dirs, [path.join(ict, "data_csv"), path.join(ict, "backups", "data_csv"), path.join(ict, "data", "data_csv"), csv, path.join(ict, "inner_circle_trader_main", "data_csv"), "extra"]);
    const S = create(data, { csvDirs: dirs });
    assert.strictEqual(S.csvDir(), csv);                                        // trouvé comme data_csv d'un sous-dossier
    const a = await S.assets();
    assert.deepStrictEqual(Object.keys(a.syms).sort(), ["ES", "MES", "MNQ", "NQ"]);
    assert.deepStrictEqual(a.syms.MNQ.m1, [t, t + 120]); assert.deepStrictEqual(a.syms.MNQ.src, ["data_csv"]); assert.deepStrictEqual(a.syms.MNQ.s1, [t, t + 1]);
    assert.strictEqual(a.syms.MES.s1, null);
    const px = async (sym, res, f = t, to = t + 180) => (await S.read(sym, f, to, res)).map((r) => [r[0] - t, r[4]]);
    assert.deepStrictEqual(await px("MNQ", "m1"), [[0, 2], [120, 2]]);          // seulement les bougies du MNQ : aucun trou comblé par le NQ
    assert.deepStrictEqual(await px("NQ", "m1"), [[0, 1], [60, 1], [120, 1], [180, 9]]);
    assert.deepStrictEqual(await px("MNQ", "1s", t, t + 1), [[0, 22], [1, 22]]);
    assert.deepStrictEqual(await px("MES", "m1"), [[0, 4]]);
    assert.deepStrictEqual(await px("MES", "1s", t, t + 1), [[0, 33]]);         // MES sans 1 s : bougies 1 s de l'ES
    assert.deepStrictEqual((await S.readTf("MNQ", "m5", 0, 2e9)).map((r) => r[4]), [6]);
    assert.deepStrictEqual((await S.readTf("MES", "m5", 0, 2e9)).map((r) => r[4]), [7]); // MES sans m5 : m5 de l'ES
  } finally { fs.rmSync(ict, { recursive: true, force: true }); }
});
