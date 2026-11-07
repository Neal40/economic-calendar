// node --test : sauvegardes quotidiennes + migration du dossier userData
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { run, migrate, KEEP } = require("./backup");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "bk-"));
const put = (p, s = "x") => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

test("run : copie les données perso, ignore les caches, une seule fois par jour", () => {
  const t = tmp();
  try {
    const ud = path.join(t, "ud"), data = path.join(t, "data"), root = path.join(t, "backups");
    put(path.join(ud, "journal-db.json"), "{}"); put(path.join(ud, "notion-token.bin"));
    put(path.join(ud, "Local Storage", "leveldb", "000003.log")); put(path.join(ud, "IndexedDB", "x.leveldb", "CURRENT"));
    put(path.join(ud, "Cache", "big")); put(path.join(ud, "Partitions", "topstepx", "Cookies"));
    put(path.join(data, "NQ_1s_2026-11.csv"), "abc"); put(path.join(data, "NQ_m1_2026.csv"));
    const now = new Date("2026-11-07T15:00:00Z");
    const r = run({ userData: ud, dataDir: data, root, now });
    const a = path.join(root, "2026-11-07", "appdata");
    assert.ok(r.made);
    for (const f of ["journal-db.json", "notion-token.bin", "Local Storage/leveldb/000003.log", "IndexedDB/x.leveldb/CURRENT"]) assert.ok(fs.existsSync(path.join(a, f)), f);
    assert.ok(!fs.existsSync(path.join(a, "Cache")) && !fs.existsSync(path.join(a, "Partitions")));
    assert.ok(fs.existsSync(path.join(root, "bougies-1s", "NQ_1s_2026-11.csv")));
    assert.ok(!fs.existsSync(path.join(root, "bougies-1s", "NQ_m1_2026.csv")));
    const r2 = run({ userData: ud, dataDir: data, root, now });
    assert.strictEqual(r2.made, false); assert.strictEqual(r2.mirrored, 0);
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
});

test(`run : garde les ${KEEP} derniers jours`, () => {
  const t = tmp();
  try {
    const ud = path.join(t, "ud"), root = path.join(t, "backups"); put(path.join(ud, "app-data.json"));
    for (let i = 1; i <= KEEP + 3; i++) fs.mkdirSync(path.join(root, `2026-10-${String(i).padStart(2, "0")}`), { recursive: true });
    run({ userData: ud, root, now: new Date("2026-11-07T15:00:00Z") });
    const left = fs.readdirSync(root).filter((n) => /^\d{4}/.test(n)).sort();
    assert.strictEqual(left.length, KEEP); assert.strictEqual(left[left.length - 1], "2026-11-07");
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
});

test("migrate : déplace l'ancien dossier, garde l'ancien si le nouveau est vide", () => {
  const t = tmp();
  try {
    const o = path.join(t, "Economic Calendar"), n = path.join(t, "Inner Circle Trader");
    put(path.join(o, "journal-db.json"), "{}");
    assert.strictEqual(migrate(o, n), n);
    assert.ok(fs.existsSync(path.join(n, "journal-db.json")) && !fs.existsSync(o));
    assert.strictEqual(migrate(o, n), n); // déjà migré
    put(path.join(o, "journal-db.json"), "{}"); fs.rmSync(n, { recursive: true }); fs.mkdirSync(n); // nouveau dossier vide
    assert.strictEqual(migrate(o, n), o);
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
});
