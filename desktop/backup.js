// Sauvegardes des données perso (lancé au démarrage, avant l'ouverture de la fenêtre).
const fs = require("fs"), path = require("path");
const KEEP = 14; // jours de sauvegarde gardés
const dayNY = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

// Dossier userData après le renommage « Economic Calendar » -> « Inner Circle Trader » : déplacé une fois, jamais perdu.
function migrate(oldDir, newDir) {
  const has = (d) => fs.existsSync(path.join(d, "journal-db.json")) || fs.existsSync(path.join(d, "Local Storage"));
  if (!fs.existsSync(oldDir)) return newDir;
  if (!fs.existsSync(newDir)) { try { fs.renameSync(oldDir, newDir); return newDir; } catch (e) { return oldDir; } }
  return has(newDir) || !has(oldDir) ? newDir : oldDir; // nouveau dossier vide (créé par Windows/Chromium) : on garde l'ancien
}

// Une sauvegarde par jour : userData (journal, abonnements/factures, tokens chiffrés, Local Storage, IndexedDB)
// + copie miroir des bougies 1 s (TopstepX ne les garde que quelques jours). Les caches Chromium et la session TopstepX sont ignorés.
function run({ userData, dataDir, root, now = new Date() }) {
  const dest = path.join(root, dayNY(now)), tmp = dest + ".tmp";
  let made = false;
  if (!fs.existsSync(dest)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const n of fs.readdirSync(userData))
      if (/\.(json|bin)$/i.test(n) || n === "Local Storage" || n === "IndexedDB") fs.cpSync(path.join(userData, n), path.join(tmp, "appdata", n), { recursive: true });
    fs.mkdirSync(tmp, { recursive: true });
    fs.renameSync(tmp, dest); made = true; // dossier complet ou rien
  }
  const removed = fs.readdirSync(root).filter((n) => /^\d{4}-\d\d-\d\d$/.test(n)).sort().slice(0, -KEEP);
  removed.forEach((n) => fs.rmSync(path.join(root, n), { recursive: true, force: true }));
  let mirrored = 0;
  if (dataDir && fs.existsSync(dataDir)) for (const n of fs.readdirSync(dataDir)) {
    if (!/_1s_.*\.csv$|^data-state\.json$/.test(n)) continue;
    const src = path.join(dataDir, n), dst = path.join(root, "bougies-1s", n);
    if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size) continue;
    fs.cpSync(src, dst); mirrored++;
  }
  return { dest, made, removed, mirrored };
}

module.exports = { run, migrate, KEEP };
