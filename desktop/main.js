const { app, BrowserWindow, shell, ipcMain, session, net, safeStorage, Notification, dialog } = require("electron");
const marketdata = require("./marketdata");
const copierLib = require("./copier");
const path = require("path");
const fs = require("fs");
const topstepx = require("./topstepx");
const notion = require("./notion");
const backup = require("./backup");
const propsync = require("./propsync");
app.setPath("userData", backup.migrate(path.join(app.getPath("appData"), "Economic Calendar"), path.join(app.getPath("appData"), "Inner Circle Trader")));
const ICT = () => path.join(app.getPath("desktop"), "Inner Circle Trader"); // dossier de travail : data/ + backups/

const PART = "persist:topstepx";              // TopstepX login session (kept between launches)
const DB = () => path.join(app.getPath("userData"), "journal-db.json");
let win = null, loginWin = null, syncing = null;

/* ---------- local database (comptes + trades) ---------- */
function readDb() { try { return JSON.parse(fs.readFileSync(DB(), "utf8")); } catch (e) { return { comptes: [], trades: [], syncedAt: null }; } }
/* comptes.json / trades.json (format de l'export Stats TopstepX) : lus et fusionnés dans la base, puis réécrits à chaque synchro.
   Dossier : Bureau\Inner Circle Trader\data (hors du dépôt git, couvert par les sauvegardes quotidiennes). */
const JDIR = () => path.join(ICT(), "data");
function readFiles() {
  const rd = (k) => { try { const v = JSON.parse(fs.readFileSync(path.join(JDIR(), k + ".json"), "utf8")); const a = Array.isArray(v) ? v : v && (v[k] || v.rows || v.data || v.results); return Array.isArray(a) ? a.filter((r) => r && r["ID TopstepX"] != null) : []; } catch (e) { return []; } };
  return { comptes: rd("comptes"), trades: rd("trades").filter((t) => t.ID != null) };
}
function exportFiles(d) {
  try { const dir = JDIR(); fs.mkdirSync(dir, { recursive: true });
    for (const k of ["comptes", "trades"]) { const f = path.join(dir, k + ".json"); fs.writeFileSync(f + ".tmp", JSON.stringify(d[k] || [], null, 2)); fs.renameSync(f + ".tmp", f); } } catch (e) { console.error("export comptes/trades", e.message); }
}
// base locale + fichiers : rien de ce qui est dans l'un ou l'autre n'est perdu (la base est prioritaire sur les fichiers)
function loadDb() { const db = readDb(), m = topstepx.mergeDb(readFiles(), { comptes: [], trades: [], ...db });
  if (m.comptes.length > (db.comptes || []).length || m.trades.length > (db.trades || []).length) { writeDb(m); exportFiles(m); } return m; }
function writeDb(d) { try { if (fs.existsSync(DB())) fs.copyFileSync(DB(), DB().replace(/\.json$/, ".backup.json")); } catch (e) {} const tmp = DB() + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(d)); fs.renameSync(tmp, DB()); }

/* ---------- TopstepX session token ---------- */
function tsxWindow(show) {
  if (loginWin && !loginWin.isDestroyed()) { if (show) loginWin.show(); return loginWin; }
  loginWin = new BrowserWindow({ width: 1100, height: 800, show, title: "Connexion TopstepX", autoHideMenuBar: true, parent: process.platform === "darwin" ? undefined : win || undefined, // Mac : une fenêtre enfant est toujours affichée avec sa fenêtre parente (fenêtre noire en trop)
    webPreferences: { partition: PART, contextIsolation: true, sandbox: true } });
  loginWin.on("close", (e) => { if (!app.isQuitting) { e.preventDefault(); loginWin.hide(); } });
  loginWin.loadURL("https://www.topstepx.com/trade");
  return loginWin;
}
async function readToken(w) {
  try { await new Promise((ok) => (w.webContents.isLoading() ? w.webContents.once("did-stop-loading", ok) : ok())); } catch (e) {}
  try { return await w.webContents.executeJavaScript('localStorage.getItem("token")', true); } catch (e) { return null; }
}
/* Jeton TopstepX envoyé depuis Chrome (favori « → ICT » sur topstepx.com) : chiffré avec safeStorage, jamais loggué ni renvoyé au renderer */
const TSXFILE = () => path.join(app.getPath("userData"), "tsx-token.bin");
function getChromeToken() { try { const b = fs.readFileSync(TSXFILE()); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString("utf8"); } catch (e) { return null; } }
function setChromeToken(t) { try { if (!t) { fs.rmSync(TSXFILE(), { force: true }); return; } fs.writeFileSync(TSXFILE(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t) : Buffer.from(t, "utf8")); } catch (e) { /* ignore */ } }
async function getToken(interactive) {
  const ct = getChromeToken(); if (ct) return ct;
  let w = tsxWindow(false), t = await readToken(w);
  if (t || !interactive) return t;
  w.show(); w.focus();                                      // user signs in to TopstepX in this window
  const until = Date.now() + 10 * 60 * 1000;
  while (Date.now() < until && !w.isDestroyed()) {
    await new Promise((r) => setTimeout(r, 1500));
    t = await readToken(w);
    if (t && !/\/login/i.test(w.webContents.getURL())) { w.hide(); return t; }
  }
  return null;
}
const sfetch = (url, opts) => session.fromPartition(PART).fetch(url, opts);

async function doSync(interactive) {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      let token = await getToken(interactive);
      if (!token) return { ok: false, reason: "login", db: readDb() };
      let data;
      const old = loadDb(), known = [...(old.comptes || []).map((c) => ({ id: c["ID TopstepX"], compte: c })), ...readExtra().map((id) => ({ id }))];
      try { data = await topstepx.sync(token, sfetch, known); }
      catch (e) {
        if (e.code !== "AUTH") throw e;
        setChromeToken(null);
        const w = tsxWindow(false); await w.webContents.executeJavaScript('localStorage.removeItem("token")', true).catch(() => {});
        if (!interactive) return { ok: false, reason: "login", db: readDb() };
        w.loadURL("https://www.topstepx.com/login"); token = await getToken(true);
        if (!token) return { ok: false, reason: "login", db: readDb() };
        data = await topstepx.sync(token, sfetch, known);
      }
      delete data.keepIds;
      if (!data.comptes.length && (old.comptes || []).length) throw new Error("TopstepX n'a renvoyé aucun compte — base locale conservée");
      data = topstepx.mergeDb(old, data); // la synchro ajoute / met à jour, elle ne supprime jamais rien
      writeDb(data); exportFiles(data);
      return { ok: true, db: data };
    } catch (e) { return { ok: false, reason: String(e.message || e), db: readDb() }; }
    finally { syncing = null; }
  })();
  return syncing;
}

ipcMain.handle("journal:get", () => loadDb());
ipcMain.handle("tsx:bars", async (e, sym, from, to) => { try { const t = await getToken(false); if (!t) return { ok: false, reason: "login" }; return { ok: true, data: await topstepx.bars(t, sfetch, sym, from, to) }; } catch (err) { return { ok: false, reason: String(err.message || err) }; } });
/* ids of accounts to recover by hand (accounts that vanished from TopstepX before being synced) */
const XFILE = () => path.join(app.getPath("userData"), "tsx-extra-ids.json");
function readExtra() { try { return JSON.parse(fs.readFileSync(XFILE(), "utf8")) || []; } catch (e) { return []; } }
ipcMain.handle("journal:addIds", async (e, ids) => {
  const L = new Set(readExtra().map(String)); (ids || []).map((x) => String(x).replace(/\D/g, "")).filter((x) => x.length >= 5).forEach((x) => L.add(x));
  fs.writeFileSync(XFILE(), JSON.stringify([...L])); return doSync(true);
});
ipcMain.handle("journal:sync", (e, interactive) => doSync(!!interactive));
/* import manuel de comptes.json / trades.json : fusionné dans la base locale (rien d'existant n'est remplacé ni supprimé) */
ipcMain.handle("journal:import", async (e, kind, rows) => {
  if (!["comptes", "trades"].includes(kind) || !Array.isArray(rows)) return { ok: false, reason: "format" };
  rows = rows.filter((r) => r && typeof r === "object" && r["ID TopstepX"] != null && (kind === "comptes" || r.ID != null));
  if (!rows.length) return { ok: false, reason: "aucune ligne avec « ID TopstepX »" + (kind === "trades" ? " et « ID »" : "") };
  if (syncing) await syncing.catch(() => {});
  const cur = loadDb(), before = { c: (cur.comptes || []).length, t: (cur.trades || []).length };
  const db = topstepx.mergeDb({ comptes: kind === "comptes" ? rows : [], trades: kind === "trades" ? rows : [] }, { syncedAt: cur.syncedAt || null, ...cur, comptes: cur.comptes || [], trades: cur.trades || [] });
  writeDb(db); exportFiles(db);
  return { ok: true, db, added: { comptes: db.comptes.length - before.c, trades: db.trades.length - before.t } };
});
ipcMain.handle("journal:logout", async () => {
  setChromeToken(null);
  await session.fromPartition(PART).clearStorageData();
  if (loginWin && !loginWin.isDestroyed()) loginWin.loadURL("https://www.topstepx.com/login");
  return true;
});

/* ---------- Coach IA du Profil (Skill IA) : API Claude, clé chiffrée avec safeStorage (jamais renvoyée au renderer) ---------- */
const AIFILE = () => path.join(app.getPath("userData"), "anthropic-key.bin"), AI_MODEL = "claude-sonnet-5-5";
const AI_SYSTEM = "Tu es un coach de performance pour un trader de futures (NQ / ES) en prop firm (Apex, Topstep, My Funded Futures). Tu analyses uniquement sa discipline, sa gestion du risque, sa constance et son process à partir des chiffres fournis. Tu ne donnes jamais de conseil d'investissement : pas de direction de marché, pas de niveau d'entrée, pas de trade à prendre. Tu t'appuies sur les chiffres du rapport, tu es direct et bienveillant, en français.";
function getAiKey() { try { const b = fs.readFileSync(AIFILE()); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString("utf8"); } catch (e) { return null; } }
ipcMain.handle("ai:status", async () => ({ ok: !!getAiKey(), model: AI_MODEL }));
ipcMain.handle("ai:setKey", async (e, k) => { k = String(k || "").trim();
  if (!k) { try { fs.unlinkSync(AIFILE()); } catch (x) {} return { ok: false, reason: "removed" }; }
  if (!/^sk-ant-[\w-]{20,}$/.test(k)) return { ok: false, reason: "format" };
  fs.writeFileSync(AIFILE(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(k) : Buffer.from(k, "utf8")); return { ok: true }; });
ipcMain.handle("ai:ask", async (e, prompt) => { const k = getAiKey(); if (!k) return { ok: false, reason: "clé API manquante" };
  try {
    const r = await net.fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": k, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 3000, system: AI_SYSTEM, messages: [{ role: "user", content: String(prompt || "").slice(0, 80000) }] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, reason: r.status === 401 ? "clé API refusée" : (j.error && j.error.message) || "HTTP " + r.status };
    return { ok: true, text: (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n"), model: j.model };
  } catch (err) { return { ok: false, reason: String(err.message || err) }; } });

/* ---------- Notion (Review) ---------- */
const NFILE = () => path.join(app.getPath("userData"), "notion-token.bin");
function getNotionToken() {
  try { const b = fs.readFileSync(NFILE()); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString("utf8"); } catch (e) { return null; }
}
function setNotionToken(t) {
  if (!t) { try { fs.unlinkSync(NFILE()); } catch (e) {} return; }
  fs.writeFileSync(NFILE(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t) : Buffer.from(t, "utf8"));
}
const nfetch = (url, opts) => net.fetch(url, opts);
const wrap = async (fn) => { const t = getNotionToken(); if (!t) return { ok: false, reason: "token" };
  try { return { ok: true, data: await fn(t) }; } catch (e) { return { ok: false, reason: e.status === 401 ? "token" : e.status === 404 ? "access" : e.status === 403 ? "write" : String(e.message || e) }; } };
ipcMain.handle("notion:status", async () => { const t = getNotionToken(); if (!t) return { ok: false, reason: "token" }; try { return await notion.check(t, nfetch); } catch (e) { return { ok: false, reason: e.status === 401 ? "token" : String(e.message || e) }; } });
ipcMain.handle("notion:setToken", async (e, t) => { t = String(t || "").trim(); if (!t) { setNotionToken(null); return { ok: false, reason: "token" }; }
  try { const r = await notion.check(t, nfetch); setNotionToken(t); return r; } catch (err) { return { ok: false, reason: err.status === 401 ? "token" : String(err.message || err) }; } });
ipcMain.handle("notion:db", (e, id) => wrap((t) => notion.queryDatabase(t, nfetch, id)));
ipcMain.handle("notion:changed", (e, items, since) => wrap((t) => notion.changedSince(t, nfetch, items, since)));
ipcMain.handle("notion:blocks", (e, id) => wrap((t) => notion.pageBlocks(t, nfetch, id)));
ipcMain.handle("notion:create", (e, db, props, tpl) => wrap((t) => notion.createPage(t, nfetch, db, props, tpl)));
ipcMain.handle("notion:update", (e, db, id, props) => wrap((t) => notion.updatePage(t, nfetch, db, id, props)));
ipcMain.handle("notion:archive", (e, id) => wrap((t) => notion.archivePage(t, nfetch, id)));
ipcMain.handle("notion:append", (e, parent, items) => wrap((t) => notion.appendBlocks(t, nfetch, parent, items)));
ipcMain.handle("notion:caption", (e, id, c) => wrap((t) => notion.setCaption(t, nfetch, id, c)));
ipcMain.handle("notion:delblock", (e, id) => wrap((t) => notion.deleteBlock(t, nfetch, id)));

/* ---------- News Forex Factory de la semaine (flux officiel, USD uniquement) : prévision / précédent pour le backtesteur ---------- */
ipcMain.handle("news:week", async () => {
  try { const r = await net.fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json"); if (!r.ok) return { ok: false, reason: "HTTP " + r.status }; return { ok: true, data: (await r.json()).filter((e) => e.country === "USD") }; }
  catch (e) { return { ok: false, reason: String(e.message || e) }; }
});

/* ---------- app data (abonnements + factures) : app-data.json ---------- */
const STORE = () => path.join(app.getPath("userData"), "app-data.json");
ipcMain.handle("store:get", () => { let data = null; try { data = JSON.parse(fs.readFileSync(STORE(), "utf8")); } catch (e) { if (fs.existsSync(STORE())) return null; } return { data, path: STORE() }; }); // fichier illisible : null -> l'app ne le réécrit pas
ipcMain.handle("store:set", (e, d) => { try {
  // moins de factures ou d'abonnements qu'avant : copie horodatée de l'ancien fichier (rien ne se perd, même une suppression par erreur)
  try { const old = JSON.parse(fs.readFileSync(STORE(), "utf8")); const n = (x, k) => ((x && x[k]) || []).length;
    if (n(d, "bills") < n(old, "bills") || n(d, "subs") < n(old, "subs")) fs.copyFileSync(STORE(), STORE().replace(/\.json$/, "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json")); } catch (err) { /* pas encore de fichier */ } const tmp = STORE() + ".tmp"; fs.writeFileSync(tmp, JSON.stringify({ ...d, savedAt: new Date().toISOString() }, null, 1)); fs.renameSync(tmp, STORE()); return true; } catch (err) { return false; } });

/* ---------- main window ---------- */
/* ---------- Connexion TopstepX via Chrome : lien innercircletrader://tsx?token=… envoyé par le favori « → ICT » ---------- */
const PROTO = "innercircletrader";
const LOCK = app.requestSingleInstanceLock(); // une seule app : le lien ouvert par Chrome arrive dans la fenêtre déjà ouverte
if (!LOCK) app.quit();
try { const exe = process.env.PORTABLE_EXECUTABLE_FILE; // exe portable Windows : enregistrer le vrai .exe, pas sa copie temporaire
  if (process.defaultApp) app.setAsDefaultProtocolClient(PROTO, process.execPath, [path.resolve(process.argv[1] || ".")]);
  else if (exe) app.setAsDefaultProtocolClient(PROTO, exe, []); else app.setAsDefaultProtocolClient(PROTO); } catch (e) { /* ignore */ }
let pendingUrl = null;
async function handleProtoUrl(u) {
  if (!app.isReady() || !win) { pendingUrl = u; return; }
  let url; try { url = new URL(u); } catch (e) { return; }
  if (url.protocol !== PROTO + ":" || url.hostname !== "tsx") return;
  const t = url.searchParams.get("token") || "";
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(t) || t.length > 8000) { try { new Notification({ title: "Inner Circle Trader", body: "Lien TopstepX invalide : reclique sur le favori depuis topstepx.com." }).show(); } catch (e) { /* ignore */ } return; }
  setChromeToken(t);
  if (win.isMinimized()) win.restore(); win.focus();
  const r = await doSync(false);
  try { win.webContents.send("tsx:pushed", r); } catch (e) { /* fenêtre fermée */ }
}
app.on("open-url", (e, u) => { e.preventDefault(); handleProtoUrl(u); });            // Mac
app.on("second-instance", (e, argv) => { const u = argv.find((a) => String(a).startsWith(PROTO + "://")); if (u) handleProtoUrl(u); else if (win) { if (win.isMinimized()) win.restore(); win.focus(); } }); // Windows
ipcMain.handle("tsx:openChrome", async (e, what) => {
  const url = what === "help" ? "https://neal40.github.io/economic-calendar/tsx-chrome.html" : "https://www.topstepx.com/trade";
  const { spawn } = require("child_process");
  try {
    if (process.platform === "darwin") { spawn("open", ["-a", "Google Chrome", url], { detached: true, stdio: "ignore" }).on("error", () => shell.openExternal(url)).unref(); }
    else if (process.platform === "win32") { spawn("cmd.exe", ["/c", "start", "", "chrome", url], { detached: true, stdio: "ignore", windowsHide: true }).on("exit", (c) => { if (c) shell.openExternal(url); }).unref(); }
    else await shell.openExternal(url);
    return { ok: true };
  } catch (err) { await shell.openExternal(url); return { ok: true }; }
});
ipcMain.handle("tsx:chromeLinked", () => !!getChromeToken());

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 1000, minWidth: 900, minHeight: 600,
    backgroundColor: "#060607", title: "Inner Circle Trader",
    icon: path.join(__dirname, "app", "icon.png"),
    autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.js") }
  });
  win.maximize(); win.show(); // toujours en plein écran (fenêtre agrandie) au lancement
  win.loadFile(path.join(__dirname, "app", "index.html"));
  win.on("closed", () => { app.isQuitting = true; app.quit(); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

/* ---------- Market data (backtester): m1 + 1s bars -> CSV, auto-sync every evening at 23:01 ---------- */
let mdStore = null;
// dossier « data_csv » (un CSV par symbole et par unité de temps, téléchargé à la main) : dans le dossier ICT, ou dans le dépôt posé dans le dossier ICT
const csvDirs = () => { const d = ICT(), out = [path.join(d, "data_csv")];
  try { fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).forEach((e) => out.push(path.join(d, e.name, "data_csv"))); } catch (e) { /* dossier ICT absent */ }
  if (!app.isPackaged) out.push(path.join(__dirname, "..", "data_csv"));
  return out; };
const md = () => (mdStore = mdStore || marketdata.create(path.join(ICT(), "data"), { csvDirs: csvDirs() }));
async function mdSync(interactive) {
  const token = await getToken(!!interactive);
  if (!token) return { ok: false, reason: "login" };
  const r = await md().sync(token, sfetch, (p) => { try { win && win.webContents.send("data:progress", p); } catch (e) { /* window closed */ } });
  try { win && win.webContents.send("data:done", r); } catch (e) { /* ignore */ }
  return r;
}
function mdSchedule() {
  const n = new Date(), t = new Date(n); t.setHours(23, 1, 0, 0); if (t <= n) t.setDate(t.getDate() + 1);
  setTimeout(async () => {
    const r = await mdSync(false);
    try { if (Notification.isSupported()) new Notification({ title: "Données de marché", body: r.ok ? `Bougies NQ/ES enregistrées (${Object.entries(r.summary).map(([k, v]) => k + " +" + v.m1 + " m1").join(", ")})` : r.reason === "login" ? "Connecte-toi à TopstepX pour la synchro des bougies de 23h01." : "Synchro des bougies impossible : " + r.reason }).show(); } catch (e) { /* ignore */ }
    mdSchedule();
  }, t - n);
}
// comptes prop firms (Topstep / Apex) : fichier écrit chaque mois par la tâche planifiée Claude dans Bureau/Inner Circle Trader/comptes/
/* synchronisation d'une prop firm (Topstep / Apex / My Funded Futures) : fenêtre de connexion gardée + récupération complète → comptes\comptes.json */
ipcMain.handle("propsync:run", async (e, firm) => propsync.run(String(firm || ""), { dir: path.join(ICT(), "comptes"), parent: win, onProgress: (p) => { try { if (win && !win.isDestroyed()) win.webContents.send("propsync:progress", p); } catch (x) { /* ignore */ } } }));
ipcMain.handle("comptes:read", () => { try { const f = path.join(ICT(), "comptes", "comptes.json"); if (!fs.existsSync(f)) return { ok: false, reason: "absent" }; return { ok: true, data: JSON.parse(fs.readFileSync(f, "utf8")), mtime: fs.statSync(f).mtimeMs }; } catch (e) { return { ok: false, reason: String(e.message || e) }; } });
ipcMain.handle("data:status", () => { try { return { ok: true, data: md().status() }; } catch (e) { return { ok: false, reason: String(e.message || e) }; } });
ipcMain.handle("data:sync", () => mdSync(true));
ipcMain.handle("data:read", async (e, sym, from, to, res) => { try { return { ok: true, data: await md().read(sym, from, to, res) }; } catch (err) { return { ok: false, reason: String(err.message || err) }; } });
ipcMain.handle("data:readTf", async (e, sym, tf, from, to) => { try { const d = await md().readTf(sym, tf, from, to); return d ? { ok: true, data: d, span: await md().span(sym, tf) } : { ok: false, reason: "missing" }; } catch (err) { return { ok: false, reason: String(err.message || err) }; } });
ipcMain.handle("data:openDir", () => shell.openPath(md().dir));
ipcMain.handle("data:import", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Importer un CSV de bougies", filters: [{ name: "CSV", extensions: ["csv", "txt"] }], properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, reason: "cancel" };
  try { const name = path.basename(r.filePaths[0]), text = fs.readFileSync(r.filePaths[0], "utf8");
    if (/^\s*tf,/i.test(text.slice(0, 20))) return { ok: true, name, allTf: md().importAllTf(text, name) };
    return { ok: true, name, data: marketdata.parseCsv(text) }; } catch (e) { return { ok: false, reason: String(e.message || e) }; }
});

/* ---------- Trade copier Tradovate (leader -> followers) ---------- */
let copier = null;
const CPFILE = () => path.join(app.getPath("userData"), "copier-config.bin");
const CPLOG = () => path.join(app.getPath("userData"), "copier.log");
function cpRead() {
  try { const b = fs.readFileSync(CPFILE()); return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString("utf8")); } catch (e) { return null; }
}
function cpWrite(cfg) {
  const txt = JSON.stringify(cfg);
  fs.writeFileSync(CPFILE(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(txt, "utf8"));
}
function cpLog(level, text) {
  const line = `${new Date().toLocaleTimeString("fr-FR")}  ${level.toUpperCase().padEnd(5)} ${text}`;
  try { fs.appendFileSync(CPLOG(), new Date().toISOString() + " " + level + " " + text + "\n"); } catch (e) { /* ignore */ }
  try { win && win.webContents.send("copier:log", { level, line }); } catch (e) { /* ignore */ }
}
ipcMain.handle("copier:getConfig", () => ({ ok: true, data: cpRead() }));
ipcMain.handle("copier:saveConfig", (e, cfg) => { try { const old = cpRead() || {}; cfg.device_id = old.device_id || cfg.device_id || copierLib.newDeviceId(); cpWrite(cfg); return { ok: true }; } catch (err) { return { ok: false, reason: String(err.message || err) }; } });
ipcMain.handle("copier:start", async () => {
  if (copier) return { ok: false, reason: "déjà lancé" };
  const cfg = cpRead(); if (!cfg) return { ok: false, reason: "config vide" };
  if (!cfg.device_id) { cfg.device_id = copierLib.newDeviceId(); cpWrite(cfg); }
  try {
    copier = new copierLib.Copier(cfg, cfg.device_id, cpLog);
    await copier.start(async (lines) => (await dialog.showMessageBox(win, { type: "warning", buttons: ["Aligner maintenant", "Annuler"], defaultId: 1, cancelId: 1, title: "Trade copier", message: "Écarts entre leader et followers au démarrage", detail: lines.join("\n") })).response === 0);
    return { ok: true };
  } catch (err) { cpLog("error", "Erreur : " + (err.message || err)); try { copier && (await copier.stop()); } catch (e) { /* ignore */ } copier = null; return { ok: false, reason: String(err.message || err) }; }
});
ipcMain.handle("copier:stop", async () => { if (copier) { await copier.stop(); copier = null; } return { ok: true }; });
ipcMain.handle("copier:status", () => ({ ok: true, running: !!copier, data: copier ? copier.snapshot() : null }));
app.on("before-quit", (e) => {
  if (!copier) return;
  e.preventDefault(); // attendre les ordres de clôture (flatten_followers_on_exit) avant de quitter
  const c = copier; copier = null;
  setTimeout(() => app.exit(0), 15000); // réseau bloqué : on quitte quand même
  c.stop().catch((err) => cpLog("error", "Arrêt : " + (err.message || err))).finally(() => app.quit());
});


/* ---------- Mise à jour automatique : dépose « Inner Circle Trader.update.exe » (ou l'ancien EconomicCalendar.update.exe) à côté de l'exe -> l'app se ferme, remplace l'exe et se relance ---------- */
function updWatch() {
  if (process.platform !== "win32" || !app.isPackaged) return;
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, dir = path.dirname(exe);
  // lancée depuis le fichier de mise à jour lui-même : ne jamais s'auto-« installer » (boucle de relance infinie)
  if (/\.update\.exe$/i.test(exe)) return;
  const same = (p) => path.resolve(p).toLowerCase() === path.resolve(exe).toLowerCase();
  let lastSize = -1, busy = false, upd = "";
  setInterval(() => {
    if (busy) return;
    upd = ["Inner Circle Trader.update.exe", "EconomicCalendar.update.exe"].map((n) => path.join(dir, n)).find((p) => !same(p) && fs.existsSync(p)) || "";
    let st; try { st = fs.statSync(upd); } catch (e) { lastSize = -1; return; }
    if (st.size < 1e7 || st.size !== lastSize) { lastSize = st.size; return; } // attendre que le fichier soit entièrement copié
    if (copier && !copier.dry) { if (lastSize !== -2) { try { new Notification({ title: "Inner Circle Trader", body: "Mise à jour prête : arrête le Trade copier (mode réel) pour l'installer." }).show(); } catch (e) { /* ignore */ } } lastSize = -2; return; }
    busy = true;
    const bat = path.join(app.getPath("temp"), "ec-update.cmd"), q = (x) => '"' + x + '"';
    fs.writeFileSync(bat, ["@echo off", "set n=0", ":retry", "ping -n 2 127.0.0.1 >nul", `move /Y ${q(upd)} ${q(exe)} >nul 2>&1`, "if not errorlevel 1 goto ok", "set /a n+=1", "if %n% lss 120 goto retry", "exit /b 1", ":ok", `start "" ${q(exe)}`, '(goto) 2>nul & del "%~f0"', ""].join("\r\n"));
    try { new Notification({ title: "Inner Circle Trader", body: "Mise à jour reçue : redémarrage de l'app…" }).show(); } catch (e) { /* ignore */ }
    require("child_process").spawn("cmd.exe", ["/c", bat], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    setTimeout(() => { app.isQuitting = true; app.quit(); setTimeout(() => app.exit(0), 5000); }, 800);
  }, 3000);
}

app.whenReady().then(() => {
  if (!LOCK) return;
  try { backup.run({ userData: app.getPath("userData"), dataDir: md().dir, root: path.join(ICT(), "backups") }); } // avant la fenêtre : Local Storage / IndexedDB pas encore ouverts
  catch (e) { try { new Notification({ title: "Inner Circle Trader", body: "Sauvegarde impossible : " + (e.message || e) }).show(); } catch (x) { /* ignore */ } }
  createWindow(); { const u = pendingUrl || process.argv.find((x) => String(x).startsWith(PROTO + "://")); if (u) win.webContents.once("did-finish-load", () => handleProtoUrl(u)); } mdSchedule(); updWatch(); setTimeout(() => { const st = md().status(); const last = st.lastSync ? new Date(st.lastSync) : null; if (!last || Date.now() - last > 20 * 3600 * 1000) mdSync(false); }, 90 * 1000); });
app.on("before-quit", () => { app.isQuitting = true; });
app.on("window-all-closed", () => app.quit());
