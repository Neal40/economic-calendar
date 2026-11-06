const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  journalGet: () => ipcRenderer.invoke("journal:get"),
  journalSync: (interactive) => ipcRenderer.invoke("journal:sync", interactive),
  journalLogout: () => ipcRenderer.invoke("journal:logout"),
});
