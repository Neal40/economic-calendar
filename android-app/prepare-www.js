// Copie le site (index.html + manifeste + icônes) dans www/ pour Capacitor. Aucune donnée de compte : seulement les fichiers publics du dépôt.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), www = path.join(__dirname, "www");
fs.rmSync(www, { recursive: true, force: true }); fs.mkdirSync(path.join(www, "pwa"), { recursive: true });
fs.copyFileSync(path.join(root, "index.html"), path.join(www, "index.html"));
fs.copyFileSync(path.join(root, "manifest.webmanifest"), path.join(www, "manifest.webmanifest"));
for (const f of fs.readdirSync(path.join(root, "pwa"))) fs.copyFileSync(path.join(root, "pwa", f), path.join(www, "pwa", f));
console.log("www prêt :", fs.readdirSync(www).join(", "));
