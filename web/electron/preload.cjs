// Exposes a tiny, read-only bridge to the web app (contextIsolation stays on).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('autostudio', {
  hardware: () => ipcRenderer.invoke('autostudio:hardware'),
});
