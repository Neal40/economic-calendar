// Dessins Excalidraw (Laboratoire › Excalidraw) : un fichier .excalidraw par tableau dans Bureau\Inner Circle Trader\Excalidraw\
// (format standard : s'ouvre aussi sur excalidraw.com). Exports d'images dans Excalidraw\Exports\, tableaux supprimés déplacés dans Excalidraw\_supprimés\ (jamais effacés).
const fs = require("fs"), path = require("path");
const EXT = ".excalidraw";
// nom de fichier sûr (Windows / Mac) : pas de \ / : * ? " < > |, pas de .. ni de nom réservé, 80 caractères max
function safeName(n) {
  let s = String(n == null ? "" : n).normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").slice(0, 80).trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = "_" + s;
  return s || "Sans titre";
}
function make(dir) {
  const ensure = (d) => { fs.mkdirSync(d, { recursive: true }); return d; };
  const file = (name) => path.join(dir, safeName(name) + EXT);
  const free = (base, d = dir, ext = EXT) => { let n = safeName(base), i = 2; while (fs.existsSync(path.join(d, n + ext))) n = safeName(base) + " (" + i++ + ")"; return n; };
  return {
    dir,
    list() { ensure(dir); return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.toLowerCase().endsWith(EXT)).map((e) => { const st = fs.statSync(path.join(dir, e.name)); return { name: e.name.slice(0, -EXT.length), at: st.mtimeMs, size: st.size }; }).sort((a, b) => a.name.localeCompare(b.name, "fr")); },
    read(name) { const f = file(name); return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null; },
    write(name, json) { ensure(dir); if (typeof json !== "string" || json.length > 200e6) throw new Error("contenu invalide"); JSON.parse(json); const f = file(name), tmp = f + ".tmp"; fs.writeFileSync(tmp, json); fs.renameSync(tmp, f); return safeName(name); },
    create(name) { ensure(dir); const n = free(name); fs.writeFileSync(file(n), JSON.stringify({ type: "excalidraw", version: 2, source: "Inner Circle Trader", elements: [], appState: { theme: "dark" }, files: {} })); return n; },
    rename(from, to) { const a = file(from); if (!fs.existsSync(a)) throw new Error("tableau introuvable"); const t = safeName(to); if (t === safeName(from)) return t; const n = free(t); fs.renameSync(a, file(n)); return n; },
    duplicate(from, to) { const a = file(from); if (!fs.existsSync(a)) throw new Error("tableau introuvable"); const n = free(to); fs.copyFileSync(a, file(n)); return n; },
    remove(name) { const a = file(name); if (!fs.existsSync(a)) return false; const bin = ensure(path.join(dir, "_supprimés")); const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"); fs.renameSync(a, path.join(bin, safeName(name) + " " + stamp + EXT)); return true; },
    exportImage(name, ext, b64) { if (!/^(png|svg)$/.test(ext)) throw new Error("format invalide"); const d = ensure(path.join(dir, "Exports")); const n = free(name, d, "." + ext); const f = path.join(d, n + "." + ext); fs.writeFileSync(f, Buffer.from(String(b64), "base64")); return f; },
  };
}
module.exports = { make, safeName, EXT };
