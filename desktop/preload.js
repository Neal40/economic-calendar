const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  journalGet: () => ipcRenderer.invoke("journal:get"),
  journalSync: (interactive) => ipcRenderer.invoke("journal:sync", interactive),
  journalLogout: () => ipcRenderer.invoke("journal:logout"),
  notionStatus: () => ipcRenderer.invoke("notion:status"),
  notionSetToken: (t) => ipcRenderer.invoke("notion:setToken", t),
  notionDb: (id) => ipcRenderer.invoke("notion:db", id),
  notionBlocks: (id) => ipcRenderer.invoke("notion:blocks", id),
});
