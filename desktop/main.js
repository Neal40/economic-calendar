const { app, BrowserWindow, shell, ipcMain, session, net } = require("electron");
const path = require("path");
const fs = require("fs");
const topstepx = require("./topstepx");

const PART = "persist:topstepx";              // TopstepX login session (kept between launches)
const DB = () => path.join(app.getPath("userData"), "journal-db.json");
let win = null, loginWin = null, syncing = null;

/* ---------- local database (comptes + trades) ---------- */
function readDb() { try { return JSON.parse(fs.readFileSync(DB(), "utf8")); } catch (e) { return { comptes: [], trades: [], syncedAt: null }; } }
function writeDb(d) { const tmp = DB() + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(d)); fs.renameSync(tmp, DB()); }

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
      try { data = await topstepx.sync(token, sfetch); }
      catch (e) {
        if (e.code !== "AUTH") throw e;
        const w = tsxWindow(false); await w.webContents.executeJavaScript('localStorage.removeItem("token")', true).catch(() => {});
        if (!interactive) return { ok: false, reason: "login", db: readDb() };
        w.loadURL("https://www.topstepx.com/login"); token = await getToken(true);
        if (!token) return { ok: false, reason: "login", db: readDb() };
        data = await topstepx.sync(token, sfetch);
      }
      writeDb(data);
      return { ok: true, db: data };
    } catch (e) { return { ok: false, reason: String(e.message || e), db: readDb() }; }
    finally { syncing = null; }
  })();
  return syncing;
}

ipcMain.handle("journal:get", () => readDb());
ipcMain.handle("journal:sync", (e, interactive) => doSync(!!interactive));
ipcMain.handle("journal:logout", async () => {
  await session.fromPartition(PART).clearStorageData();
  if (loginWin && !loginWin.isDestroyed()) loginWin.loadURL("https://www.topstepx.com/login");
  return true;
});

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
app.whenReady().then(createWindow);
app.on("before-quit", () => { app.isQuitting = true; });
app.on("window-all-closed", () => app.quit());
