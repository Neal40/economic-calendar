const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const { spawnSync } = require("child_process");
const u = require("./updater");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ict-upd-"));
const meta = (o) => `**Inner Circle Trader v${o.v}** — texte\n<!-- ict-build ${JSON.stringify(o)} -->`;
const rel = (name, body, assets) => ({ name, body, html_url: "https://github.com/x", assets: assets || [] });
const exe = (size, at) => ({ name: "Inner.Circle.Trader.exe", size, updated_at: at || "2026-11-13T10:49:43Z", browser_download_url: "https://github.com/Neal40/economic-calendar/releases/download/latest/Inner.Circle.Trader.exe" });

test("cmpVer / parseVer", () => {
  assert.deepStrictEqual(u.parseVer("Inner Circle Trader v1.52.1 (Windows)"), [1, 52, 1]);
  assert.strictEqual(u.parseVer("v1.5"), null);
  assert.strictEqual(u.cmpVer("1.53.0", "1.52.9"), 1);
  assert.strictEqual(u.cmpVer("1.9.0", "1.10.0"), -1);
  assert.strictEqual(u.cmpVer("1.52.1", "v1.52.1"), 0);
});

test("parseMeta / parseRelease : version, n° de build, fichier", () => {
  assert.deepStrictEqual(u.parseMeta(meta({ v: "1.53.0", run: 245 })), { v: "1.53.0", run: 245 });
  assert.strictEqual(u.parseMeta("<!-- ict-build {pas du json} -->"), null);
  assert.strictEqual(u.parseMeta("rien"), null);
  const sha256 = "a".repeat(64);
  const r = u.parseRelease(rel("Inner Circle Trader v1.53.0 (Windows)", meta({ v: "1.53.0", run: 245, sha: "0123456789abcdef", size: 1000, sha256 }), [exe(1000)]), "Inner.Circle.Trader.exe");
  assert.strictEqual(r.version, "1.53.0"); assert.strictEqual(r.run, 245); assert.strictEqual(r.sha256, sha256); assert.strictEqual(r.asset.size, 1000);
  // ancienne release sans métadonnées : version lue dans le nom
  const old = u.parseRelease(rel("Inner Circle Trader v1.52.1 (Windows)", "texte", [exe(5)]), "Inner.Circle.Trader.exe");
  assert.strictEqual(old.version, "1.52.1"); assert.strictEqual(old.run, 0); assert.strictEqual(old.sha256, "");
  assert.strictEqual(u.parseRelease(rel("v1.0.0", "", [exe(5)]), "Autre.exe").asset, null);
});

test("isNewer : version, puis n° de build (même version)", () => {
  assert.strictEqual(u.isNewer({ version: "1.53.0", run: 1 }, { version: "1.52.1", run: 9 }), true);
  assert.strictEqual(u.isNewer({ version: "1.52.1", run: 250 }, { version: "1.52.1", run: 245 }), true);
  assert.strictEqual(u.isNewer({ version: "1.52.1", run: 245 }, { version: "1.52.1", run: 245 }), false);
  assert.strictEqual(u.isNewer({ version: "1.52.1", run: 250 }, { version: "1.52.1", run: 0 }), false); // build locale : version seule
  assert.strictEqual(u.isNewer({ version: "1.52.0", run: 300 }, { version: "1.52.1", run: 245 }), false);
});

test("check : mise à jour dispo, publication en cours, erreurs", async () => {
  const fake = (status, json) => async (url, opts) => { assert.match(url, /\/repos\/Neal40\/economic-calendar\/releases\/tags\/latest$/); assert.ok(opts.headers.accept); return { ok: status < 400, status, json: async () => json }; };
  const body = meta({ v: "1.53.0", run: 12, sha: "abcdef1234567", size: 1000, sha256: "b".repeat(64) });
  const a = await u.check(fake(200, rel("Inner Circle Trader v1.53.0 (Windows)", body, [exe(1000)])), "win32", { version: "1.52.1", run: 11 });
  assert.ok(a.ok && a.available && a.ready); assert.strictEqual(a.latest.version, "1.53.0"); assert.strictEqual(a.latest.sha, "abcdef1");
  assert.deepStrictEqual(a.dl, { url: exe(1).browser_download_url, size: 1000, sha256: "b".repeat(64) });
  const up = await u.check(fake(200, rel("Inner Circle Trader v1.53.0 (Windows)", body, [exe(1000)])), "win32", { version: "1.53.0", run: 12 });
  assert.ok(up.ok && !up.available);
  // le workflow a mis à jour le corps mais l'exe est encore l'ancien (taille différente) : pas de téléchargement
  const pub = await u.check(fake(200, rel("Inner Circle Trader v1.53.0 (Windows)", body, [exe(999)])), "win32", { version: "1.52.1", run: 11 });
  assert.ok(pub.ok && pub.available && !pub.ready && pub.dl === null);
  assert.strictEqual((await u.check(fake(403, {}), "win32", { version: "1.0.0" })).reason, "rate");
  assert.strictEqual((await u.check(fake(404, {}), "win32", { version: "1.0.0" })).reason, "HTTP 404");
  assert.strictEqual((await u.check(async () => { throw new Error("ENOTFOUND"); }, "win32", { version: "1.0.0" })).reason, "offline");
  assert.strictEqual((await u.check(fake(200, {}), "linux", { version: "1.0.0" })).reason, "platform");
  const mac = await u.check(async (url) => { assert.match(url, /tags\/latest-mac$/); return { ok: true, status: 200, json: async () => rel("Inner Circle Trader v1.53.0 (macOS)", "", [{ ...exe(7), name: "Inner-Circle-Trader-mac.zip" }]) }; }, "darwin", { version: "1.52.1" });
  assert.ok(mac.ok && mac.available && mac.ready && mac.platform === "macOS");
});

test("download : progression, taille et SHA-256 vérifiés, .part retiré", async () => {
  const dir = tmp(), data = crypto.randomBytes(300000), sha256 = crypto.createHash("sha256").update(data).digest("hex");
  const fetch = async () => new Response(data, { status: 200, headers: { "content-length": String(data.length) } });
  const dest = path.join(dir, "Inner Circle Trader.update.exe"), seen = [];
  fs.writeFileSync(dest, "ancien"); // mise à jour précédente laissée là : remplacée
  const r = await u.download(fetch, { url: "https://x/y", size: data.length, sha256 }, dest, (p) => seen.push(p));
  assert.strictEqual(r.sha256, sha256); assert.ok(fs.readFileSync(dest).equals(data)); assert.ok(!fs.existsSync(dest + ".part"));
  assert.deepStrictEqual(seen[seen.length - 1], { got: data.length, total: data.length });
  const dest2 = path.join(dir, "b.exe");
  await assert.rejects(u.download(fetch, { url: "https://x/y", size: data.length, sha256: "0".repeat(64) }, dest2), (e) => e.code === "SHA");
  await assert.rejects(u.download(fetch, { url: "https://x/y", size: data.length + 1, sha256: "" }, dest2), (e) => e.code === "SIZE");
  await assert.rejects(u.download(async () => new Response("x", { status: 404 }), { url: "https://x/y" }, dest2), (e) => e.code === "HTTP");
  assert.ok(!fs.existsSync(dest2) && !fs.existsSync(dest2 + ".part"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("winScript : remplace puis relance, l'ancienne version si l'exe reste bloqué", () => {
  const s = u.winScript("C:\\ICT\\Inner Circle Trader.update.exe", "C:\\ICT\\Inner Circle Trader.exe");
  assert.ok(s.includes('move /Y "C:\\ICT\\Inner Circle Trader.update.exe" "C:\\ICT\\Inner Circle Trader.exe"'));
  assert.ok(s.indexOf('del /F /Q "C:\\ICT\\Inner Circle Trader.update.exe"') < s.indexOf(":ok"));
  assert.ok(s.indexOf(':ok') < s.indexOf('start "" "C:\\ICT\\Inner Circle Trader.exe"'));
  assert.ok(s.split("\r\n").length > 10 && !/[^\r]\n/.test(s));
});

test("macBundle / macStage", async () => {
  assert.strictEqual(u.macBundle("/Applications/Inner Circle Trader.app/Contents/MacOS/Inner Circle Trader"), "/Applications/Inner Circle Trader.app");
  assert.strictEqual(u.macBundle("/usr/bin/electron"), null);
  const dir = tmp(), bundle = path.join(dir, "Inner Circle Trader.app"), calls = [];
  fs.mkdirSync(path.join(bundle, "Contents"), { recursive: true });
  const run = async (cmd, args) => { calls.push(cmd); if (cmd === "ditto") fs.mkdirSync(path.join(args[3], "Inner Circle Trader.app", "Contents"), { recursive: true }), fs.writeFileSync(path.join(args[3], "Inner Circle Trader.app", "Contents", "Info.plist"), "x"); };
  const st = await u.macStage(run, "/tmp/x.zip", bundle);
  assert.strictEqual(st.stage, path.join(dir, u.MAC_STAGE)); assert.ok(fs.existsSync(path.join(st.app, "Contents", "Info.plist"))); assert.deepStrictEqual(calls, ["ditto", "xattr"]);
  await assert.rejects(u.macStage(async () => {}, "/tmp/x.zip", bundle), /archive Mac invalide/);
  assert.ok(!fs.existsSync(path.join(dir, u.MAC_STAGE))); // préparation ratée : rien ne reste
  fs.rmSync(dir, { recursive: true, force: true });
});

test("MAC_SWAP : remplace l'app et la relance, ou garde l'ancienne", { skip: process.platform === "win32" }, () => {
  const dir = tmp(), bin = path.join(dir, "bin"), app = path.join(dir, "Inner Circle Trader.app"), stage = path.join(dir, u.MAC_STAGE), opened = path.join(dir, "opened");
  fs.mkdirSync(bin); fs.writeFileSync(path.join(bin, "open"), `#!/bin/sh\necho "$1" >> "${opened}"\n`, { mode: 0o755 });
  const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH };
  const mk = (p, v) => { fs.mkdirSync(p, { recursive: true }); fs.writeFileSync(path.join(p, "v"), v); };
  const dead = spawnSync(process.execPath, ["-e", "0"]).pid; // processus déjà terminé
  mk(app, "old"); mk(path.join(stage, "new.app"), "new");
  spawnSync("/bin/sh", ["-c", u.MAC_SWAP, "sh", app, stage, path.join(stage, "new.app"), String(dead)], { env });
  assert.strictEqual(fs.readFileSync(path.join(app, "v"), "utf8"), "new"); assert.ok(!fs.existsSync(stage));
  assert.strictEqual(fs.readFileSync(opened, "utf8").trim(), app);
  // nouvelle app absente : l'ancienne est remise en place et relancée
  fs.mkdirSync(stage);
  spawnSync("/bin/sh", ["-c", u.MAC_SWAP, "sh", app, stage, path.join(stage, "absent.app"), String(dead)], { env });
  assert.strictEqual(fs.readFileSync(path.join(app, "v"), "utf8"), "new"); assert.strictEqual(fs.readFileSync(opened, "utf8").trim().split("\n").length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
