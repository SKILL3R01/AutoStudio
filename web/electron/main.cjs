// AutoStudio desktop shell: serves the built web app (dist/) over a secure custom scheme so that
// ES modules, workers, WebGPU, WebCodecs and IndexedDB behave exactly like on https.
const { app, BrowserWindow, Menu, net, protocol, shell, session } = require('electron');
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
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
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

app.whenReady().then(() => {
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
  app.on('second-instance', () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });
});

app.on('window-all-closed', () => app.quit());
