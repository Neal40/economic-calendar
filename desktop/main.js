const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
function createWindow() {
  const win = new BrowserWindow({
    width: 1320, height: 1000, minWidth: 900, minHeight: 600,
    backgroundColor: "#c4c7cf", title: "Economic Calendar",
    icon: path.join(__dirname, "app", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  win.loadFile(path.join(__dirname, "app", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
