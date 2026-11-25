/* node desktop/secret.test.js — chiffrement des secrets (desktop/secret.js) sans Electron */
const assert = require("assert");
const { make } = require("./secret");
// faux trousseau macOS
const kc = {}; const run = (a) => { if (a[0] === "find-generic-password") { if (!kc.v) throw new Error("absent"); return kc.v + "\n"; } if (a[0] === "add-generic-password") { kc.v = a[a.indexOf("-w") + 1]; return ""; } throw new Error("?"); };
const fakeSS = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from("SS:" + s), decryptString: (b) => { const t = b.toString(); if (!t.startsWith("SS:")) throw new Error("bad"); return t.slice(3); } };
const mac = make({ safeStorage: fakeSS, platform: "darwin", run });
const b = mac.seal("secret-notion"); assert(mac._isNew(b)); assert(!b.toString("utf8").includes("secret-notion"));
assert.strictEqual(mac.open(b).s, "secret-notion"); assert.strictEqual(mac.open(b).old, false);
const legacy = fakeSS.encryptString("ancien"); const r = mac.open(legacy); assert.strictEqual(r.s, "ancien"); assert.strictEqual(r.old, true);
// même clé relue après redémarrage
const mac2 = make({ safeStorage: fakeSS, platform: "darwin", run }); assert.strictEqual(mac2.open(b).s, "secret-notion");
// trousseau en panne → safeStorage
const broken = make({ safeStorage: fakeSS, platform: "darwin", run: () => { throw new Error("x"); } }); assert.strictEqual(broken.seal("a").toString(), "SS:a"); assert.strictEqual(broken.macReady(), false);
// Windows = safeStorage comme avant
const win = make({ safeStorage: fakeSS, platform: "win32", run }); assert.strictEqual(win.seal("x").toString(), "SS:x"); assert.strictEqual(win.open(Buffer.from("SS:x")).old, false);
// données modifiées → erreur
const t = Buffer.from(b); t[t.length - 1] ^= 1; assert.throws(() => mac.open(t));
console.log("✓ secret.js OK");
