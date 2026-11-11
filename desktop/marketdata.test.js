// node --test : lecture des CSV de bougies (doublons, heure de New York)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { create, parseCsv, parseNY, mergeRows } = require("./marketdata");

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
    assert.deepStrictEqual((await S.read("MNQ", t, t + 120, "m1")).map((r) => r[4]), [9, 9, 9]);                                       // MNQ sans fichier : synchro du NQ
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
