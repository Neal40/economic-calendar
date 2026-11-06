const { app, BrowserWindow, shell, ipcMain, session, net, safeStorage, Notification, dialog } = require("electron");
const marketdata = require("./marketdata");
const path = require("path");
const fs = require("fs");
const topstepx = require("./topstepx");
const notion = require("./notion");

const PART = "persist:topstepx";              // TopstepX login session (kept between launches)
const DB = () => path.join(app.getPath("userData"), "journal-db.json");
let win = null, loginWin = null, syncing = null;

/* ---------- local database (comptes + trades) ---------- */
function readDb() { try { return JSON.parse(fs.readFileSync(DB(), "utf8")); } catch (e) { return { comptes: [], trades: [], syncedAt: null }; } }
function writeDb(d) { try { if (fs.existsSync(DB())) fs.copyFileSync(DB(), DB().replace(/\.json$/, ".backup.json")); } catch (e) {} const tmp = DB() + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(d)); fs.renameSync(tmp, DB()); }

/* ---------- TopstepX session token ---------- */
function tsxWindow(show) {
  if (loginWin && !loginWin.isDestroyed()) { if (show) loginWin.show(); return loginWin; }
  loginWin = new BrowserWindow({ width: 1100, height: 800, show, title: "Connexion TopstepX", autoHideMenuBar: true, parent: win || undefined,
    webPreferences: { partition: PART, contextIsolation: true, sandbox: true } });
  loginWin.on("close", (e) => { if (!app.isQuitting) { e.preventDefault(); loginWin.hide(); } });
  loginWin.loadURL("https://www.topstepx.com/trade");
  return loginWin;
}
async function readToken(w) {
  try { await new Promise((ok) => (w.webContents.isLoading() ? w.webContents.once("did-stop-loading", ok) : ok())); } catch (e) {}
  try { return await w.webContents.executeJavaScript('localStorage.getItem("token")', true); } catch (e) { return null; }
}
async function getToken(interactive) {
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
      const old = readDb() || {}, known = [...(old.comptes || []).map((c) => ({ id: c["ID TopstepX"], compte: c })), ...readExtra().map((id) => ({ id }))];
      try { data = await topstepx.sync(token, sfetch, known); }
      catch (e) {
        if (e.code !== "AUTH") throw e;
        const w = tsxWindow(false); await w.webContents.executeJavaScript('localStorage.removeItem("token")', true).catch(() => {});
        if (!interactive) return { ok: false, reason: "login", db: readDb() };
        w.loadURL("https://www.topstepx.com/login"); token = await getToken(true);
        if (!token) return { ok: false, reason: "login", db: readDb() };
        data = await topstepx.sync(token, sfetch, known);
      }
      if (data.keepIds && data.keepIds.length) data.trades.push(...(old.trades || []).filter((t) => data.keepIds.includes(String(t["ID TopstepX"]))));
      delete data.keepIds;
      if (!data.comptes.length && (old.comptes || []).length) throw new Error("TopstepX n'a renvoyé aucun compte — base locale conservée");
      writeDb(data);
      return { ok: true, db: data };
    } catch (e) { return { ok: false, reason: String(e.message || e), db: readDb() }; }
    finally { syncing = null; }
  })();
  return syncing;
}

ipcMain.handle("journal:get", () => readDb());
ipcMain.handle("tsx:bars", async (e, sym, from, to) => { try { const t = await getToken(false); if (!t) return { ok: false, reason: "login" }; return { ok: true, data: await topstepx.bars(t, sfetch, sym, from, to) }; } catch (err) { return { ok: false, reason: String(err.message || err) }; } });
/* ids of accounts to recover by hand (accounts that vanished from TopstepX before being synced) */
const XFILE = () => path.join(app.getPath("userData"), "tsx-extra-ids.json");
function readExtra() { try { return JSON.parse(fs.readFileSync(XFILE(), "utf8")) || []; } catch (e) { return []; } }
ipcMain.handle("journal:addIds", async (e, ids) => {
  const L = new Set(readExtra().map(String)); (ids || []).map((x) => String(x).replace(/\D/g, "")).filter((x) => x.length >= 5).forEach((x) => L.add(x));
  fs.writeFileSync(XFILE(), JSON.stringify([...L])); return doSync(true);
});
ipcMain.handle("journal:sync", (e, interactive) => doSync(!!interactive));
ipcMain.handle("journal:logout", async () => {
  await session.fromPartition(PART).clearStorageData();
  if (loginWin && !loginWin.isDestroyed()) loginWin.loadURL("https://www.topstepx.com/login");
  return true;
});

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

/* ---------- app data (abonnements + factures) : app-data.json ---------- */
const STORE = () => path.join(app.getPath("userData"), "app-data.json");
ipcMain.handle("store:get", () => { let data = null; try { data = JSON.parse(fs.readFileSync(STORE(), "utf8")); } catch (e) {} return { data, path: STORE() }; });
ipcMain.handle("store:set", (e, d) => { try { const tmp = STORE() + ".tmp"; fs.writeFileSync(tmp, JSON.stringify({ ...d, savedAt: new Date().toISOString() }, null, 1)); fs.renameSync(tmp, STORE()); return true; } catch (err) { return false; } });

/* ---------- main window ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 1000, minWidth: 900, minHeight: 600,
    backgroundColor: "#060607", title: "Economic Calendar",
    icon: path.join(__dirname, "app", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.js") }
  });
  win.loadFile(path.join(__dirname, "app", "index.html"));
  win.on("closed", () => { app.isQuitting = true; app.quit(); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

/* ---------- Market data (backtester): m1 + 1s bars -> CSV, auto-sync every evening at 23:01 ---------- */
let mdStore = null;
const md = () => (mdStore = mdStore || marketdata.create(require("path").join(app.getPath("documents"), "EconomicCalendar", "data")));
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
ipcMain.handle("data:status", () => { try { return { ok: true, data: md().status() }; } catch (e) { return { ok: false, reason: String(e.message || e) }; } });
ipcMain.handle("data:sync", () => mdSync(true));
ipcMain.handle("data:read", (e, sym, from, to, res) => { try { return { ok: true, data: md().read(sym, from, to, res) }; } catch (err) { return { ok: false, reason: String(err.message || err) }; } });
ipcMain.handle("data:openDir", () => shell.openPath(md().dir));
ipcMain.handle("data:import", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Importer un CSV de bougies", filters: [{ name: "CSV", extensions: ["csv", "txt"] }], properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, reason: "cancel" };
  try { return { ok: true, name: require("path").basename(r.filePaths[0]), data: marketdata.parseCsv(require("fs").readFileSync(r.filePaths[0], "utf8")) }; } catch (e) { return { ok: false, reason: String(e.message || e) }; }
});

app.whenReady().then(() => { createWindow(); mdSchedule(); setTimeout(() => { const st = md().status(); const last = st.lastSync ? new Date(st.lastSync) : null; if (!last || Date.now() - last > 20 * 3600 * 1000) mdSync(false); }, 90 * 1000); });
app.on("before-quit", () => { app.isQuitting = true; });
app.on("window-all-closed", () => app.quit());
