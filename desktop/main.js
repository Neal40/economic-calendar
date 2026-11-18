const { app, BrowserWindow, shell, ipcMain, session, net, safeStorage, Notification, dialog } = require("electron");
const marketdata = require("./marketdata");
const copierLib = require("./copier");
const path = require("path");
const fs = require("fs");
const topstepx = require("./topstepx");
const notion = require("./notion");
const backup = require("./backup");
const propsync = require("./propsync");
const marche = require("./marche");
const updater = require("./updater");
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
  // TopstepX se connecte maintenant via login.topstep.com (même identifiant que le dashboard Topstep) : garder le titre « Connexion TopstepX »
  loginWin.on("page-title-updated", (e) => e.preventDefault());
  // après la connexion, toujours revenir sur TopstepX (jamais rester sur le dashboard Topstep, où l'app ne trouve pas la session TopstepX)
  loginWin.webContents.on("did-navigate", (e, u) => { if (tsxLeftToTopstep(u)) loginWin.loadURL("https://www.topstepx.com/trade"); });
  loginWin.loadURL("https://www.topstepx.com/trade");
  return loginWin;
}
/* page Topstep hors connexion (dashboard.topstep.com, www.topstep.com…) : pas TopstepX -> on renvoie sur topstepx.com */
function tsxLeftToTopstep(u) { try { const h = new URL(u).hostname; const pth = new URL(u).pathname; return /(^|\.)topstep\.com$/i.test(h) && !/^login\./i.test(h) && !/forgot|reset|register|verify/i.test(pth); } catch (e) { return false; } }
let tsxLoginClosed = false; // fenêtre de connexion fermée par l'utilisateur pendant l'attente
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
  tsxLoginClosed = false; w.show(); w.focus();             // user signs in to TopstepX in this window
  const until = Date.now() + 10 * 60 * 1000;
  while (Date.now() < until && !w.isDestroyed()) {
    await new Promise((r) => setTimeout(r, 1500));
    if (!w.isVisible()) { tsxLoginClosed = true; return null; } // fenêtre fermée : on arrête d'attendre, le bouton « Synchro TopstepX » la rouvre
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
      if (!token) return { ok: false, reason: "login", closed: interactive && tsxLoginClosed, db: readDb() };
      let data;
      const old = loadDb(), known = [...(old.comptes || []).map((c) => ({ id: c["ID TopstepX"], compte: c })), ...readExtra().map((id) => ({ id }))];
      try { data = await topstepx.sync(token, sfetch, known); }
      catch (e) {
        if (e.code !== "AUTH") throw e;
        setChromeToken(null);
        const w = tsxWindow(false); await w.webContents.executeJavaScript('localStorage.removeItem("token")', true).catch(() => {});
        if (!interactive) return { ok: false, reason: "login", db: readDb() };
        w.loadURL("https://www.topstepx.com/login"); token = await getToken(true);
        if (!token) return { ok: false, reason: "login", closed: tsxLoginClosed, db: readDb() };
        data = await topstepx.sync(token, sfetch, known);
      }
      delete data.keepIds;
      if (!data.comptes.length && (old.comptes || []).length) throw new Error("TopstepX n'a renvoyé aucun compte — base locale conservée");
      data = topstepx.mergeDb(old, data); // la synchro ajoute / met à jour, elle ne supprime jamais rien
      try { await topstepx.excursions(token, sfetch, data.trades); } catch (e) { /* bougies 1 s indisponibles : réessai à la prochaine synchro */ } // plus haut / plus bas pendant chaque trade (MAE / MFE)
      writeDb(data); exportFiles(data);
      return { ok: true, db: data };
    } catch (e) { return { ok: false, reason: String(e.message || e), db: readDb() }; }
    finally { syncing = null; }
  })();
  return syncing;
}

ipcMain.handle("journal:get", () => loadDb());
ipcMain.handle("tsx:bars", async (e, sym, from, to, res) => { try { const t = await getToken(false); if (!t) return { ok: false, reason: "login" }; return { ok: true, data: await topstepx.bars(t, sfetch, sym, from, to, res === "1S" ? "1S" : "1") }; } catch (err) { return { ok: false, reason: String(err.message || err) }; } });
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

/* ---------- Marché (page forexfactory.com/market/<instrument>) : bougies via mds-api, reste de la page via fenêtre cachée ---------- */
const mcache = new Map(); // slug -> { at, r } : la page n'est relue qu'au plus toutes les 2 min
ipcMain.handle("marche:page", async (e, slug, force) => { slug = marche.slugOf(slug) || "eurusd"; const c = mcache.get(slug);
  if (!force && c && Date.now() - c.at < 120000) return c.r; const r = await marche.page(BrowserWindow, slug); if (r.ok) mcache.set(slug, { at: Date.now(), r }); return r; });
ipcMain.handle("marche:bars", async (e, inst, interval, n, to) => { try { return { ok: true, data: await marche.bars(net.fetch, inst, interval, n, to) }; } catch (err) { return { ok: false, reason: String(err.message || err) }; } });

/* ---------- Graphique (page façon TradingView) : bougies de tout contrat TopstepX (chartapi, résolution au choix) + vrai site tradingview.com intégré ---------- */
const GR_RES = /^\d{1,4}[SDWM]?$/; // résolutions TradingView : 1S, 5S, 1, 5, 60, 240, 1D, 1W, 1M…
ipcMain.handle("gr:bars", async (e, sym, res, from, to, countback) => {
  try {
    sym = String(sym || "").toUpperCase(); res = String(res || "1");
    if (!/^[A-Z0-9]{1,6}$/.test(sym) || !GR_RES.test(res)) return { ok: false, reason: "paramètres invalides" };
    const t = await getToken(false); if (!t) return { ok: false, reason: "login" };
    const n = Math.max(1, Math.min(25000, Math.floor(+countback) || 500)), f = Math.max(0, Math.floor(+from) || 0), tt = Math.floor(+to) || Math.floor(Date.now() / 1000);
    const r = await sfetch(`https://chartapi.topstepx.com/History?Symbol=${encodeURIComponent("/" + sym)}&Resolution=${encodeURIComponent(res)}&Countback=${n}&From=${f}&To=${tt}`, { headers: { Authorization: "Bearer " + t, Accept: "application/json" } });
    if (r.status === 401 || r.status === 403) return { ok: false, reason: "login" };
    if (!r.ok) return { ok: false, reason: "HTTP " + r.status };
    const j = await r.json(), T = (j && j.t) || [];
    return { ok: true, data: T.map((x, i) => [x, +j.o[i], +j.h[i], +j.l[i], +j.c[i], j.v ? +j.v[i] || 0 : 0]).sort((a, b) => a[0] - b[0]) };
  } catch (err) { return { ok: false, reason: String(err.message || err) }; }
});
// TradingView.com dans une vue de la fenêtre (session « persist:tradingview » : la connexion reste), placée par la page Graphique sur sa zone
let tvView = null, tvHost = null;
const TV_HOME = "https://www.tradingview.com/chart/";
const tvHostOf = (u) => { try { return new URL(u).hostname; } catch (e) { return ""; } };
const tvOk = (u) => /(^|\.)tradingview\.com$/i.test(tvHostOf(u));
const TV_AUTH = /(^|\.)(accounts\.google\.com|appleid\.apple\.com|facebook\.com|x\.com|twitter\.com|linkedin\.com|login\.yahoo\.com|login\.microsoftonline\.com|login\.live\.com)$/i;
const tvPrefs = () => ({ partition: "persist:tradingview", contextIsolation: true, sandbox: true, nodeIntegration: false });
function tvEnsure(sender) {
  const { WebContentsView } = require("electron");
  if (!tvView || tvView.webContents.isDestroyed()) {
    tvView = new WebContentsView({ webPreferences: tvPrefs() }); tvView.setBackgroundColor("#131722");
    const wc = tvView.webContents; wc.setUserAgent(wc.getUserAgent().replace(/\s?(Electron|Inner Circle Trader|economic-calendar)\/\S+/gi, ""));
    wc.setWindowOpenHandler(({ url }) => {
      if (tvOk(url)) { wc.loadURL(url); return { action: "deny" }; }
      if (TV_AUTH.test(tvHostOf(url))) return { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, webPreferences: tvPrefs() } };
      if (/^https?:/i.test(url)) shell.openExternal(url); return { action: "deny" };
    });
    wc.on("will-navigate", (ev, url) => { if (!tvOk(url) && !TV_AUTH.test(tvHostOf(url))) { ev.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
    wc.loadURL(TV_HOME);
  }
  const w = BrowserWindow.fromWebContents(sender) || win; if (!w || w.isDestroyed()) return null;
  if (tvHost !== w) {
    try { if (tvHost && !tvHost.isDestroyed()) tvHost.contentView.removeChildView(tvView); } catch (e) { /* fenêtre fermée */ }
    w.contentView.addChildView(tvView); tvHost = w;
    w.webContents.on("did-start-loading", () => { try { if (tvView && tvHost === w) tvView.setVisible(false); } catch (e) { /* */ } });
    w.once("closed", () => { if (tvHost === w) tvHost = null; });
  }
  return tvView;
}
ipcMain.handle("tv:show", (e, r) => { try { const v = tvEnsure(e.sender); if (!v || !r) return false; const z = e.sender.getZoomFactor ? e.sender.getZoomFactor() : 1;
  v.setBounds({ x: Math.round(r.x * z), y: Math.round(r.y * z), width: Math.max(0, Math.round(r.w * z)), height: Math.max(0, Math.round(r.h * z)) }); v.setVisible(true); return true; } catch (err) { return false; } });
ipcMain.handle("tv:hide", () => { try { if (tvView && !tvView.webContents.isDestroyed()) tvView.setVisible(false); } catch (e) { /* */ } return true; });
ipcMain.handle("tv:nav", (e, what) => {
  try { if (!tvView || tvView.webContents.isDestroyed()) return false; const wc = tvView.webContents, h = wc.navigationHistory || wc;
    if (what === "back" && h.canGoBack()) h.goBack(); else if (what === "fwd" && h.canGoForward()) h.goForward(); else if (what === "reload") wc.reload(); else if (what === "home") wc.loadURL(TV_HOME);
    else if (what === "window") { const bw = new BrowserWindow({ width: 1440, height: 900, autoHideMenuBar: true, title: "TradingView", backgroundColor: "#131722", webPreferences: tvPrefs() }); bw.webContents.setUserAgent(wc.getUserAgent());
      bw.webContents.setWindowOpenHandler(({ url }) => { if (tvOk(url) || TV_AUTH.test(tvHostOf(url))) return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: tvPrefs() } }; if (/^https?:/i.test(url)) shell.openExternal(url); return { action: "deny" }; }); bw.loadURL(wc.getURL() || TV_HOME); }
    return true; } catch (err) { return false; }
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
/* Excalidraw : dessins dans Bureau\Inner Circle Trader\Excalidraw\ (un .excalidraw par tableau), exports dans Excalidraw\Exports\ */
const exd = () => require("./excalidraw").make(path.join(ICT(), "Excalidraw"));
const exdTry = (fn) => { try { return { ok: true, data: fn(exd()) }; } catch (err) { return { ok: false, reason: String(err.message || err) }; } };
ipcMain.handle("excali:list", () => exdTry((x) => ({ dir: x.dir, list: x.list() })));
ipcMain.handle("excali:read", (e, n) => exdTry((x) => x.read(n)));
ipcMain.handle("excali:write", (e, n, json) => exdTry((x) => x.write(n, json)));
ipcMain.handle("excali:create", (e, n) => exdTry((x) => x.create(n)));
ipcMain.handle("excali:rename", (e, a, b) => exdTry((x) => x.rename(a, b)));
ipcMain.handle("excali:duplicate", (e, a, b) => exdTry((x) => x.duplicate(a, b)));
ipcMain.handle("excali:remove", (e, n) => exdTry((x) => x.remove(n)));
ipcMain.handle("excali:export", (e, n, ext, b64) => exdTry((x) => { const f = x.exportImage(n, ext, b64); shell.showItemInFolder(f); return f; }));
ipcMain.handle("excali:openDir", () => { const x = exd(); fs.mkdirSync(x.dir, { recursive: true }); return shell.openPath(x.dir); });
// post X en brouillon dans Chrome (où l'utilisateur est connecté) : texte prérempli, image mise dans le presse-papiers puis collée dans le post (Ctrl+V envoyé à l'onglet X sous Windows)
ipcMain.handle("excali:openX", (e, text, b64) => {
  if (b64 && /^[A-Za-z0-9+/=]+$/.test(b64)) try { const { clipboard, nativeImage } = require("electron"); clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(b64, "base64"))); } catch (err) { /* ignore */ }
  const url = "https://x.com/intent/post?text=" + encodeURIComponent(String(text || "").slice(0, 2000));
  const { spawn } = require("child_process");
  try {
    if (process.platform === "darwin") spawn("open", ["-a", "Google Chrome", url], { detached: true, stdio: "ignore" }).on("error", () => shell.openExternal(url)).unref();
    else if (process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "", "chrome", url], { detached: true, stdio: "ignore", windowsHide: true }).on("exit", (c) => { if (c) shell.openExternal(url); }).unref();
      if (b64) { const { CHROME_PASTE_PS, psEncoded } = require("./excalidraw"); spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-EncodedCommand", psEncoded(CHROME_PASTE_PS)], { detached: true, stdio: "ignore", windowsHide: true }).unref(); }
    }
    else shell.openExternal(url);
  } catch (err) { shell.openExternal(url); }
  return { ok: true };
});
// post X en brouillon avec l'image déjà ajoutée : fenêtre x.com dans l'app (session persist:x, connexion gardée ; rien n'est publié sans l'utilisateur)
let xWin = null;
ipcMain.handle("excali:postX", async (e, text, b64) => {
  try {
    const { clipboard, nativeImage } = require("electron"), { xAttachScript, X_PROBE } = require("./excalidraw");
    if (!/^[A-Za-z0-9+/=]+$/.test(String(b64 || "")) || b64.length > 40e6) return { ok: false, reason: "image invalide" };
    const img = nativeImage.createFromBuffer(Buffer.from(b64, "base64")); clipboard.writeImage(img);
    const url = "https://x.com/intent/post?text=" + encodeURIComponent(String(text || "").slice(0, 2000));
    if (xWin && !xWin.isDestroyed()) xWin.close();
    const w = xWin = new BrowserWindow({ width: 820, height: 860, parent: win || undefined, title: "X — brouillon (Inner Circle Trader)", autoHideMenuBar: true, backgroundColor: "#000000",
      webPreferences: { partition: "persist:x", contextIsolation: true, sandbox: true, nodeIntegration: false } });
    w.webContents.setWindowOpenHandler(({ url: u }) => { if (/^https?:/i.test(u)) shell.openExternal(u); return { action: "deny" }; });
    let done = false, relaunched = false; const script = xAttachScript(b64);
    // après une connexion, X renvoie sur l'accueil : on rouvre la rédaction une fois
    const back = (ev, u) => { if (!done && !relaunched && /x\.com\/home/.test(u)) { relaunched = true; w.loadURL(url); } };
    w.webContents.on("did-navigate", back); w.webContents.on("did-navigate-in-page", back);
    // dès que la zone de texte est prête : vrai collage (comme Ctrl+V) de l'image dans le post ; si X ne l'a pas prise au bout de 3 s, ajout par le champ fichier
    const run = (js) => w.webContents.executeJavaScript(js, true), wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now(), tick = async () => {
      if (done || w.isDestroyed()) return;
      try {
        const r = await run(X_PROBE);
        if (r === "attached") { done = true; return; }
        if (r === "ready") {
          done = true; clipboard.writeImage(img); w.focus(); w.webContents.focus(); await wait(250); w.webContents.paste();
          await wait(3000); if (!w.isDestroyed() && (await run(X_PROBE)) !== "attached") await run(script);
          return;
        }
      } catch (err) { /* page en chargement */ }
      if (Date.now() - t0 < 10 * 60e3) setTimeout(tick, 1000);
    };
    w.webContents.on("did-finish-load", () => setTimeout(tick, 800));
    w.on("closed", () => { if (xWin === w) xWin = null; });
    await w.loadURL(url);
    return { ok: true };
  } catch (err) { return { ok: false, reason: String(err.message || err) }; }
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

// Backtesteur › ⋯ › Ouvrir une nouvelle fenêtre : même page, même préchargement, vue choisie par le hash
ipcMain.handle("app:newWindow", (e, view) => {
  const w = new BrowserWindow({ width: 1400, height: 900, minWidth: 900, minHeight: 600, backgroundColor: "#060607", title: "Inner Circle Trader",
    icon: path.join(__dirname, "app", "icon.png"), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.js") } });
  w.loadFile(path.join(__dirname, "app", "index.html"), { hash: /^[a-z]+$/.test(view || "") ? view : "backtest" });
  w.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  return true;
});

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
const updExe = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
const updNotify = (body) => { try { new Notification({ title: "Inner Circle Trader", body }).show(); } catch (e) { /* ignore */ } };
const updQuit = () => setTimeout(() => { app.isQuitting = true; app.quit(); setTimeout(() => app.exit(0), 5000); }, 800);
let updBusy = false; // installation lancée (maj auto ou bouton du Profil) : une seule à la fois
function updInstallWin(upd) { // script cmd détaché : attend la fermeture, remplace l'exe par upd, relance l'app
  if (updBusy) return false; updBusy = true;
  const bat = path.join(app.getPath("temp"), "ec-update.cmd");
  fs.writeFileSync(bat, updater.winScript(upd, updExe()));
  updNotify("Mise à jour reçue : redémarrage de l'app…");
  require("child_process").spawn("cmd.exe", ["/c", bat], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  updQuit(); return true;
}
function updWatch() {
  if (process.platform !== "win32" || !app.isPackaged) return;
  const exe = updExe(), dir = path.dirname(exe);
  // lancée depuis le fichier de mise à jour lui-même : ne jamais s'auto-« installer » (boucle de relance infinie)
  if (/\.update\.exe$/i.test(exe)) return;
  try { fs.rmSync(path.join(dir, "Inner Circle Trader.update.exe.part"), { force: true }); } catch (e) { /* téléchargement interrompu par une fermeture */ }
  const same = (p) => path.resolve(p).toLowerCase() === path.resolve(exe).toLowerCase();
  let lastSize = -1, warned = false, upd = "";
  setInterval(() => {
    if (updBusy) return;
    upd = ["Inner Circle Trader.update.exe", "EconomicCalendar.update.exe"].map((n) => path.join(dir, n)).find((p) => !same(p) && fs.existsSync(p)) || "";
    let st; try { st = fs.statSync(upd); } catch (e) { lastSize = -1; warned = false; return; }
    if (st.size < 1e7 || st.size !== lastSize) { lastSize = st.size; return; } // attendre que le fichier soit entièrement copié
    if (copier && !copier.dry) { if (!warned) updNotify("Mise à jour prête : arrête le Trade copier (mode réel) pour l'installer."); warned = true; return; } // une seule notification
    updInstallWin(upd);
  }, 3000);
}

/* ---------- Version de l'app + mise à jour depuis GitHub (Paramètres › Profil › Application) : l'utilisateur la lance lui-même, la maj auto ci-dessus reste active ---------- */
const BUILD = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "app", "build.json"), "utf8")) || {}; } catch (e) { return {}; } })(); // écrit par prepare.js (n° de build GitHub Actions)
const updCurrent = () => ({ version: app.getVersion(), run: Math.max(0, Math.floor(+BUILD.run) || 0) });
function updCanInstall() {
  if (!app.isPackaged) return { ok: false, reason: "dev" };
  if (process.platform === "win32") return /\.update\.exe$/i.test(updExe()) ? { ok: false, reason: "updexe" } : { ok: true };
  if (process.platform === "darwin") {
    const b = updater.macBundle(process.execPath); if (!b) return { ok: false, reason: "bundle" };
    try { fs.accessSync(path.dirname(b), fs.constants.W_OK); return { ok: true }; } catch (e) { return { ok: false, reason: "perm" }; }
  }
  return { ok: false, reason: "platform" };
}
let updLast = null, updAt = 0, updDl = false;
async function updCheck(force) { // GitHub limite à 60 requêtes / heure : résultat gardé 10 min
  if (!force && updLast && updLast.ok && Date.now() - updAt < 10 * 60 * 1000) return updLast;
  const r = await updater.check(net.fetch, process.platform, updCurrent());
  if (r.ok) { updLast = r; updAt = Date.now(); }
  return r;
}
const updPublic = (r) => { if (!r || !r.ok) return r; const { dl, ...o } = r; return o; };
const updSend = (p) => { try { if (win && !win.isDestroyed()) win.webContents.send("app:updProgress", p); } catch (e) { /* fenêtre fermée */ } };
const liveCopier = () => !!(copier && !copier.dry);
ipcMain.handle("app:info", () => ({ lastUpd: process.platform === "darwin" ? updater.macSwapResult(MAC_UPDLOG()) : null, version: app.getVersion(), run: updCurrent().run, sha: String(BUILD.sha || "").slice(0, 7), platform: process.platform, packaged: app.isPackaged, install: updCanInstall(), downloading: updDl }));
ipcMain.handle("app:updCheck", async (e, force) => updPublic(await updCheck(!!force)));
ipcMain.handle("app:updInstall", async () => {
  if (updDl || updBusy) return { ok: false, reason: "busy" };
  const can = updCanInstall(); if (!can.ok) return can;
  if (liveCopier()) return { ok: false, reason: "copier" };
  updDl = true;
  try {
    const fresh = await updCheck(true); // GitHub injoignable / limité : dernier résultat de moins de 30 min (le fichier reste vérifié par taille + SHA-256)
    const r = fresh.ok ? fresh : updLast && updLast.ok && Date.now() - updAt < 30 * 60 * 1000 ? updLast : fresh;
    if (!r.ok) return r;
    if (!r.available) return { ok: false, reason: "uptodate" };
    if (!r.ready || !r.dl) return { ok: false, reason: "publishing" };
    const prog = (p) => updSend({ phase: "download", got: p.got, total: p.total });
    if (process.platform === "win32") {
      // même fichier que la maj auto : s'il ne peut pas être installé tout de suite, la surveillance l'installera plus tard
      const dest = path.join(path.dirname(updExe()), "Inner Circle Trader.update.exe");
      await updater.download(net.fetch, r.dl, dest, prog);
      if (liveCopier()) return { ok: false, reason: "copier-wait" };
      updSend({ phase: "install" }); updInstallWin(dest);
      return { ok: true };
    }
    if (macStaged && macStaged.version === ((r.latest && r.latest.version) || "")) { updSend({ phase: "install" }); if (macAutoSwap(true)) { updQuit(); return { ok: true }; } return { ok: false, reason: "busy" }; }
    macStaged = null; // version préparée plus ancienne : remplacée par celle-ci
    const bundle = updater.macBundle(process.execPath), zip = path.join(app.getPath("temp"), "Inner-Circle-Trader-mac.zip");
    await updater.download(net.fetch, r.dl, zip, prog);
    updSend({ phase: "install" });
    const { execFile, spawn } = require("child_process");
    const run = (cmd, args) => new Promise((ok, ko) => execFile(cmd, args, { maxBuffer: 1 << 20 }, (err) => (err ? ko(err) : ok())));
    let st; try { st = await updater.macStage(run, zip, bundle); } finally { fs.rmSync(zip, { force: true }); }
    if (liveCopier()) { fs.rmSync(st.stage, { recursive: true, force: true }); return { ok: false, reason: "copier" }; }
    updBusy = true;
    spawn("/bin/sh", updater.macSwapArgs(bundle, st.stage, st.app, process.pid, MAC_UPDLOG(), true), { detached: true, stdio: "ignore" }).unref();
    updQuit(); return { ok: true };
  } catch (err) { return { ok: false, reason: err.code === "SHA" ? "publishing" : String(err.message || err) }; }
  finally { updDl = false; }
});

/* ---------- Mac : maj automatique (comme sur Windows) ----------
   Vérifie GitHub 2 min après le lancement puis toutes les 30 min, télécharge et prépare la nouvelle version en arrière-plan (taille + SHA-256 vérifiés),
   puis l'installe quand l'app est fermée (sans la relancer) ou, si l'ordinateur reste inactif 10 min, en relançant l'app. Jamais pendant le Trade copier en réel. */
const MAC_UPDLOG = () => path.join(app.getPath("logs"), "mise-a-jour.log"); // ~/Library/Logs/Inner Circle Trader/mise-a-jour.log
/* résultat de la dernière mise à jour Mac (écrit par le script de remplacement) : affiché une fois au lancement s'il a échoué */
function macUpdReport() {
  const r = updater.macSwapResult(MAC_UPDLOG()); if (!r) return null;
  const seen = path.join(app.getPath("userData"), "maj-vue.txt"); let last = ""; try { last = fs.readFileSync(seen, "utf8"); } catch (e) { /* jamais */ }
  if (last !== r.at) { try { fs.writeFileSync(seen, r.at); } catch (e) { /* ignore */ }
    if (!r.ok) updNotify(r.step === "ancienne-app" ? "Mise à jour bloquée : macOS a refusé de remplacer l'app. Ouvre Réglages Système › Confidentialité et sécurité › Gestion des apps et autorise Inner Circle Trader." : "Mise à jour : la nouvelle version n'a pas pu être copiée (ancienne version gardée)."); }
  return r;
}
let macStaged = null; // { stage, app, bundle, version } : nouvelle version prête à côté de l'app
async function macAutoPrep() {
  if (process.platform !== "darwin" || !app.isPackaged || macStaged || updDl || updBusy) return;
  if (!updCanInstall().ok) return;
  let r; try { r = await updCheck(false); } catch (e) { return; }
  if (!r || !r.ok || !r.available || !r.ready || !r.dl) return;
  const bundle = updater.macBundle(process.execPath), zip = path.join(app.getPath("temp"), "Inner-Circle-Trader-mac-auto.zip");
  updDl = true;
  try {
    await updater.download(net.fetch, r.dl, zip, () => {});
    const { execFile } = require("child_process");
    const run = (cmd, args) => new Promise((ok, ko) => execFile(cmd, args, { maxBuffer: 1 << 20 }, (err) => (err ? ko(err) : ok())));
    let st; try { st = await updater.macStage(run, zip, bundle); } finally { fs.rmSync(zip, { force: true }); }
    macStaged = { ...st, bundle, version: (r.latest && r.latest.version) || "" };
    updNotify(`Mise à jour ${macStaged.version} prête : elle s'installe quand tu fermes l'app (ou toute seule si le Mac reste inactif 10 min).`);
  } catch (e) { /* réessai au prochain passage */ }
  finally { updDl = false; }
}
function macAutoSwap(relaunch) { // lance le remplacement détaché ; l'app doit quitter juste après
  if (!macStaged || updBusy || liveCopier()) return false;
  updBusy = true; const s = macStaged;
  require("child_process").spawn("/bin/sh", updater.macSwapArgs(s.bundle, s.stage, s.app, process.pid, MAC_UPDLOG(), relaunch), { detached: true, stdio: "ignore" }).unref();
  return true;
}
function macAutoUpdate() {
  if (process.platform !== "darwin" || !app.isPackaged) return;
  try { macUpdReport(); } catch (e) { /* ignore */ }
  setTimeout(macAutoPrep, 2 * 60 * 1000); setInterval(macAutoPrep, 30 * 60 * 1000);
  const { powerMonitor } = require("electron");
  setInterval(() => { try { if (macStaged && !updBusy && !updDl && powerMonitor.getSystemIdleTime() >= 600 && macAutoSwap(true)) { updNotify("Installation de la mise à jour…"); updQuit(); } } catch (e) { /* ignore */ } }, 60 * 1000);
  app.on("before-quit", () => { if (macStaged && !updBusy) macAutoSwap(false); });
}

app.whenReady().then(() => {
  if (!LOCK) return;
  try { backup.run({ userData: app.getPath("userData"), dataDir: md().dir, root: path.join(ICT(), "backups") }); } // avant la fenêtre : Local Storage / IndexedDB pas encore ouverts
  catch (e) { try { new Notification({ title: "Inner Circle Trader", body: "Sauvegarde impossible : " + (e.message || e) }).show(); } catch (x) { /* ignore */ } }
  createWindow(); { const u = pendingUrl || process.argv.find((x) => String(x).startsWith(PROTO + "://")); if (u) win.webContents.once("did-finish-load", () => handleProtoUrl(u)); } mdSchedule(); updWatch(); macAutoUpdate();
  if (process.platform === "darwin" && app.isPackaged) setTimeout(() => { const b = updater.macBundle(process.execPath); if (b && !updBusy && !updDl && !macStaged) try { fs.rmSync(path.join(path.dirname(b), updater.MAC_STAGE), { recursive: true, force: true }); } catch (e) { /* reste d'une mise à jour Mac interrompue */ } }, 60 * 1000);
  setTimeout(() => { const st = md().status(); const last = st.lastSync ? new Date(st.lastSync) : null; if (!last || Date.now() - last > 20 * 3600 * 1000) mdSync(false); }, 90 * 1000); });
app.on("before-quit", () => { app.isQuitting = true; });
app.on("window-all-closed", () => app.quit());
