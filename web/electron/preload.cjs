// Exposes a tiny, read-only bridge to the web app (contextIsolation stays on).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('autostudio', {
  hardware: () => ipcRenderer.invoke('autostudio:hardware'),
  suggest: (q, lang) => ipcRenderer.invoke('autostudio:suggest', String(q), String(lang ?? '')),
  fetchMedia: (url) => ipcRenderer.invoke('autostudio:fetch-media', String(url)),
  google: {
    signIn: (opts) => ipcRenderer.invoke('autostudio:google-signin', opts),
    token: () => ipcRenderer.invoke('autostudio:google-token'),
    status: () => ipcRenderer.invoke('autostudio:google-status'),
    signOut: () => ipcRenderer.invoke('autostudio:google-signout'),
  },
});
