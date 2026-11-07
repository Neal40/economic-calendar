// node --test : lecture des CSV de bougies (doublons, heure de New York)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { create, parseCsv, parseNY } = require("./marketdata");

test("parseNY : date sans fuseau = heure de New York (hiver et été)", () => {
  assert.strictEqual(parseNY("2026-11-06 09:30:00"), Date.parse("2026-11-06T14:30:00Z") / 1000); // EST, UTC-5
  assert.strictEqual(parseNY("2026-07-06 09:30"), Date.parse("2026-07-06T13:30:00Z") / 1000);    // EDT, UTC-4
  assert.strictEqual(parseNY("2026-11-06T14:30:00Z"), Date.parse("2026-11-06T14:30:00Z") / 1000); // fuseau explicite gardé
});

test("parseCsv : colonne ts, tri et doublons retirés", () => {
  const rows = parseCsv("time_ny,ts,open,high,low,close,volume\nx,120,1,2,0,1,5\nx,60,1,2,0,1,5\nx,120,1,2,0,1,5\n");
  assert.deepStrictEqual(rows.map((r) => r[0]), [60, 120]);
});

test("read : ignore les bougies en double laissées par une synchro interrompue", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "md-"));
  try {
    const t = Date.parse("2026-11-06T14:30:00Z") / 1000, line = (s) => `x,${s},1,2,0,1,5`;
    fs.writeFileSync(path.join(dir, "NQ_m1_2026.csv"), ["time_ny,ts,open,high,low,close,volume", line(t), line(t + 60), line(t + 60), line(t + 120), ""].join("\n"));
    const got = create(dir).read("NQ", t, t + 120, "m1").map((r) => r[0]);
    assert.deepStrictEqual(got, [t, t + 60, t + 120]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
