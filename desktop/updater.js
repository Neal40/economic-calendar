// Mise à jour de l'app depuis les releases GitHub (Paramètres › Profil › Application).
// La maj auto reste active (main.js surveille « Inner Circle Trader.update.exe » posé à côté de l'exe) ;
// ce module ajoute la lecture de la dernière release et le bouton « Mettre à jour » que l'utilisateur lance lui-même.
//  - Windows : release « latest », asset Inner.Circle.Trader.exe -> « Inner Circle Trader.update.exe » à côté de l'exe,
//    puis le même script que la maj auto (l'app se ferme, l'exe est remplacé, l'app se relance).
//  - Mac : release « latest-mac », asset Inner-Circle-Trader-mac.zip -> décompressé à côté de l'app (même volume),
//    puis l'ancienne app est remplacée après sa fermeture et la nouvelle est relancée.
// Les workflows écrivent dans le corps de la release : <!-- ict-build {"v":"1.53.0","run":245,"sha":"…","size":…,"sha256":"…"} -->
// (run = n° du build : une nouvelle build sans changement de version est aussi proposée ; size / sha256 = vérification du fichier).
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { pipeline } = require("stream/promises"), { Readable, Transform } = require("stream");

const REPO = "Neal40/economic-calendar";
const TARGETS = {
  win32: { tag: "latest", asset: "Inner.Circle.Trader.exe", label: "Windows" },
  darwin: { tag: "latest-mac", asset: "Inner-Circle-Trader-mac.zip", label: "macOS" },
};
const releasePage = (tag) => `https://github.com/${REPO}/releases/tag/${tag}`;

function parseVer(s) { const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(s || "")); return m ? m.slice(1, 4).map(Number) : null; }
function cmpVer(a, b) {
  const x = parseVer(a), y = parseVer(b); if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
function parseMeta(body) {
  const m = /<!--\s*ict-build\s+(\{[\s\S]*?\})\s*-->/.exec(String(body || "")); if (!m) return null;
  try { const j = JSON.parse(m[1]); return j && typeof j === "object" ? j : null; } catch (e) { return null; }
}
function parseRelease(rel, assetName) {
  if (!rel || typeof rel !== "object") return null;
  const meta = parseMeta(rel.body) || {}, pv = parseVer(meta.v) || parseVer(rel.name);
  const a = (Array.isArray(rel.assets) ? rel.assets : []).find((x) => x && x.name === assetName);
  return {
    version: pv ? pv.join(".") : null, run: Math.max(0, Math.floor(+meta.run) || 0), sha: /^[0-9a-f]{7,40}$/i.test(meta.sha || "") ? meta.sha : "",
    size: Math.max(0, +meta.size || 0), sha256: /^[0-9a-f]{64}$/i.test(meta.sha256 || "") ? meta.sha256.toLowerCase() : "",
    asset: a && /^https:\/\//.test(a.browser_download_url || "") ? { url: a.browser_download_url, size: +a.size || 0, updatedAt: a.updated_at || null } : null,
  };
}
// plus récente = version plus haute, ou même version avec un n° de build plus grand (build locale : run 0 -> version seule)
function isNewer(latest, current) {
  const c = cmpVer(latest && latest.version, current && current.version); if (c) return c > 0;
  return !!(latest.run && current.run && latest.run > current.run);
}

/* état de la dernière release pour la plateforme ; current = { version, run } de l'app en cours ; fetch = net.fetch (Electron) */
async function check(fetch, platform, current) {
  const t = TARGETS[platform]; if (!t) return { ok: false, reason: "platform" };
  let r;
  try { r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${t.tag}`, { headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } }); }
  catch (e) { return { ok: false, reason: "offline" }; }
  if (r.status === 403 || r.status === 429) return { ok: false, reason: "rate" };
  if (!r.ok) return { ok: false, reason: "HTTP " + r.status };
  let rel = null; try { rel = parseRelease(await r.json(), t.asset); } catch (e) { /* JSON illisible */ }
  if (!rel || !rel.version) return { ok: false, reason: "release" };
  // ready = l'exe de la release correspond à ses métadonnées (sinon : GitHub Actions est en train de remplacer le fichier)
  const ready = !!(rel.asset && (!rel.size || rel.size === rel.asset.size));
  return {
    ok: true, platform: t.label, current, page: releasePage(t.tag), available: isNewer(rel, current), ready,
    latest: { version: rel.version, run: rel.run, sha: rel.sha.slice(0, 7), size: rel.asset ? rel.asset.size : rel.size, publishedAt: rel.asset ? rel.asset.updatedAt : null },
    dl: ready ? { url: rel.asset.url, size: rel.asset.size, sha256: rel.sha256 } : null,
  };
}

/* télécharge dl.url vers dest (en passant par dest + ".part"), vérifie la taille et le SHA-256, puis renomme ; onProgress({ got, total }) */
async function download(fetch, dl, dest, onProgress) {
  const part = dest + ".part", fail = (m, code) => { fs.rmSync(part, { force: true }); return Object.assign(new Error(m), { code }); };
  fs.rmSync(part, { force: true });
  const r = await fetch(dl.url);
  if (!r.ok || !r.body) throw Object.assign(new Error("téléchargement impossible (HTTP " + r.status + ")"), { code: "HTTP" });
  const total = dl.size || +r.headers.get("content-length") || 0, hash = crypto.createHash("sha256");
  let got = 0, last = 0;
  const meter = new Transform({ transform(chunk, enc, cb) {
    hash.update(chunk); got += chunk.length; const now = Date.now();
    if (onProgress && now - last >= 200) { last = now; try { onProgress({ got, total }); } catch (e) { /* fenêtre fermée */ } }
    cb(null, chunk);
  } });
  try { await pipeline(typeof r.body.getReader === "function" ? Readable.fromWeb(r.body) : r.body, meter, fs.createWriteStream(part)); }
  catch (e) { throw fail("téléchargement interrompu : " + (e.message || e), "NET"); }
  if (onProgress) try { onProgress({ got, total }); } catch (e) { /* ignore */ }
  if (dl.size && got !== dl.size) throw fail(`fichier incomplet (${got} / ${dl.size} octets)`, "SIZE");
  const sha256 = hash.digest("hex");
  if (dl.sha256 && sha256 !== dl.sha256) throw fail("le fichier téléchargé ne correspond pas à la release", "SHA");
  fs.rmSync(dest, { force: true }); fs.renameSync(part, dest);
  return { path: dest, size: got, sha256 };
}

/* Windows : script cmd lancé après la fermeture de l'app — remplace l'exe par la mise à jour puis relance l'app.
   Exe encore bloqué après ~2 min : la mise à jour est supprimée (pas de boucle de relance) et l'ancienne version est relancée. */
function winScript(upd, exe) {
  const q = (x) => '"' + x + '"';
  return ["@echo off", "set n=0", ":retry", "ping -n 2 127.0.0.1 >nul", `move /Y ${q(upd)} ${q(exe)} >nul 2>&1`, "if not errorlevel 1 goto ok",
    "set /a n+=1", "if %n% lss 120 goto retry", `del /F /Q ${q(upd)} >nul 2>&1`, ":ok", `start "" ${q(exe)}`, '(goto) 2>nul & del "%~f0"', ""].join("\r\n");
}

/* Mac : bundle .app de l'app en cours (…/Inner Circle Trader.app/Contents/MacOS/Inner Circle Trader) */
function macBundle(execPath) { const b = path.posix.resolve(String(execPath || "/"), "..", "..", ".."); return /\.app$/i.test(b) ? b : null; }
const MAC_STAGE = ".ict-update"; // dossier caché à côté de l'app : même volume -> remplacement par simple renommage
/* Mac : décompresse le zip de la release à côté de l'app et vérifie la nouvelle app ; run(cmd, args) = execFile en promesse */
async function macStage(run, zip, bundle) {
  const parent = path.dirname(bundle), stage = path.join(parent, MAC_STAGE);
  fs.accessSync(parent, fs.constants.W_OK); // dossier non modifiable (app lancée depuis le .dmg, App Translocation, compte standard…)
  fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage);
  try {
    await run("ditto", ["-x", "-k", zip, stage]);
    const name = fs.readdirSync(stage).find((n) => /\.app$/i.test(n)), app = name ? path.join(stage, name) : "";
    if (!app || !fs.existsSync(path.join(app, "Contents", "Info.plist"))) throw new Error("archive Mac invalide (aucune app dedans)");
    await Promise.resolve(run("xattr", ["-cr", app])).catch(() => {}); // pas de quarantaine sur la nouvelle app
    return { stage, app };
  } catch (e) { fs.rmSync(stage, { recursive: true, force: true }); throw e; }
}
/* Mac : lancé après la fermeture de l'app ($1 = app, $2 = dossier de préparation, $3 = nouvelle app, $4 = PID de l'app) :
   attend la fin du PID, remplace l'app (retour à l'ancienne si le remplacement échoue), la relance, puis nettoie */
const MAC_SWAP = 'n=0; while kill -0 "$4" 2>/dev/null && [ $n -lt 300 ]; do sleep 0.2; n=$((n+1)); done; ' +
  'if mv "$1" "$2/old.app"; then mv "$3" "$1" || mv "$2/old.app" "$1"; fi; open "$1"; sleep 2; rm -rf "$2"';

module.exports = { REPO, TARGETS, parseVer, cmpVer, parseMeta, parseRelease, isNewer, check, download, winScript, macBundle, macStage, MAC_STAGE, MAC_SWAP };
