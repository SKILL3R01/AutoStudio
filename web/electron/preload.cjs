// Exposes a tiny, read-only bridge to the web app (contextIsolation stays on).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('autostudio', {
  hardware: () => ipcRenderer.invoke('autostudio:hardware'),
  suggest: (q, lang) => ipcRenderer.invoke('autostudio:suggest', String(q), String(lang ?? '')),
  fetchMedia: (url) => ipcRenderer.invoke('autostudio:fetch-media', String(url)),
  flushDns: () => ipcRenderer.invoke('autostudio:flush-dns'),
  voice: {
    status: () => ipcRenderer.invoke('autostudio:voice-status'),
    install: () => ipcRenderer.invoke('autostudio:voice-install'),
    cancelInstall: () => ipcRenderer.invoke('autostudio:voice-cancel-install'),
    generate: (o) => ipcRenderer.invoke('autostudio:voice-generate', o),
    convert: (o) => ipcRenderer.invoke('autostudio:voice-convert', o),
    separate: (o) => ipcRenderer.invoke('autostudio:voice-separate', o),
    cancel: () => ipcRenderer.invoke('autostudio:voice-cancel'),
    uninstall: () => ipcRenderer.invoke('autostudio:voice-uninstall'),
    logs: () => ipcRenderer.invoke('autostudio:voice-logs'),
    onProgress: (cb) => {
      const h = (_e, p) => cb(p);
      ipcRenderer.on('autostudio:voice-progress', h);
      return () => ipcRenderer.removeListener('autostudio:voice-progress', h);
    },
  },
  updates: {
    check: () => ipcRenderer.invoke('autostudio:update-check'),
    download: () => ipcRenderer.invoke('autostudio:update-download'),
    install: () => ipcRenderer.invoke('autostudio:update-install'),
    onProgress: (cb) => {
      const h = (_e, p) => cb(p);
      ipcRenderer.on('autostudio:update-progress', h);
      return () => ipcRenderer.removeListener('autostudio:update-progress', h);
    },
  },
  google: {
    signIn: (opts) => ipcRenderer.invoke('autostudio:google-signin', opts),
    token: () => ipcRenderer.invoke('autostudio:google-token'),
    status: () => ipcRenderer.invoke('autostudio:google-status'),
    signOut: () => ipcRenderer.invoke('autostudio:google-signout'),
  },
});
