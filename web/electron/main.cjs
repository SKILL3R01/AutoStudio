// AutoStudio desktop shell: serves the built web app (dist/) over a secure custom scheme so that
// ES modules, workers, WebGPU, WebCodecs and IndexedDB behave exactly like on https.
const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell, session } = require('electron');
const os = require('node:os');
const { registerGoogle } = require('./google.cjs');
const { registerUpdater } = require('./updater.cjs');
const { registerVoice } = require('./voice.cjs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const ORIGIN = `${SCHEME}://autostudio`;
const DIST = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

app.commandLine.appendSwitch('enable-unsafe-webgpu');

if (!app.requestSingleInstanceLock()) app.quit();

// `autostudio://engine?url=https://….trycloudflare.com` links (printed by the Colab notebook) open the app and connect it.
if (process.defaultApp) app.setAsDefaultProtocolClient('autostudio', process.execPath, [path.resolve(process.argv[1] ?? '.')]);
else app.setAsDefaultProtocolClient('autostudio');

/** The engine URL inside an autostudio:// link, if it is a plain https URL. */
function engineFromArgs(argv) {
  const link = argv.find((a) => a.startsWith('autostudio://'));
  if (!link) return null;
  try {
    const u = new URL(new URL(link).searchParams.get('url') ?? '');
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

function connectEngine(win, engine) {
  if (!engine || !win) return;
  const go = () => void win.webContents.executeJavaScript(`location.hash = 'engine=' + encodeURIComponent(${JSON.stringify(engine)})`);
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', go);
  else go();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0a0b0f',
    title: 'AutoStudio',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  // Links to other sites (Colab, Flow, docs) open in the default browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(ORIGIN) && !url.startsWith('blob:')) void shell.openExternal(url);
    return { action: url.startsWith('blob:') ? 'allow' : 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
  void win.loadURL(`${ORIGIN}/index.html`);
  return win;
}

// Hardware summary for the performance profile (RAM, CPU, GPU).
ipcMain.handle('autostudio:hardware', async () => {
  const gpu = await app.getGPUInfo('basic').catch(() => ({}));
  const dev = (gpu.gpuDevice ?? []).find((d) => d.active) ?? (gpu.gpuDevice ?? [])[0];
  const cpus = os.cpus();
  return {
    ramGB: Math.round(os.totalmem() / 1024 ** 3),
    cores: cpus.length,
    cpu: cpus[0]?.model?.trim() ?? '',
    gpu: dev ? [dev.vendorString, dev.deviceString].filter(Boolean).join(' ') || `vendor 0x${(dev.vendorId ?? 0).toString(16)}` : '',
    platform: process.platform,
  };
});

registerGoogle();
registerUpdater();
registerVoice();

app.whenReady().then(() => {
  // Resolve names over secure DNS when the OS resolver lags behind (new trycloudflare tunnels appear within seconds).
  try {
    app.configureHostResolver({ secureDnsMode: 'automatic', secureDnsServers: ['https://cloudflare-dns.com/dns-query', 'https://dns.google/dns-query'] });
  } catch {
    /* older Electron — keep the system resolver */
  }
  protocol.handle(SCHEME, (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // Ask the browser for persistent storage so projects are not evicted.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(['persistent-storage', 'clipboard-sanitized-write', 'fullscreen', 'media'].includes(permission)));
  Menu.setApplicationMenu(null);
  const win = createWindow();
  connectEngine(win, engineFromArgs(process.argv));
  app.on('second-instance', (_e, argv) => {
    if (win.isMinimized()) win.restore();
    win.focus();
    connectEngine(win, engineFromArgs(argv));
  });
});

app.on('window-all-closed', () => app.quit());
