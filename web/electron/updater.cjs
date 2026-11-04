// In-app updates from GitHub Releases (no extra libraries):
// check the latest release → download the Setup exe → verify its SHA-256 (published by GitHub) → run it silently.
const { app, BrowserWindow, ipcMain, net, shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const REPO = 'SKILL3R01/AutoStudio';
const RELEASES = `https://github.com/${REPO}/releases`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;

/** The portable exe cannot replace itself — it only gets a link to the new version. */
const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_FILE;
/** For testing the download path: pretend to be an older version. */
const currentVersion = () => process.env.AUTOSTUDIO_UPDATE_TEST_VERSION || app.getVersion();

/** Compare dotted versions ("1.10.0" > "1.9.3"); pre-release suffixes are ignored. */
function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

let found = null; // { version, notes, page, asset: { name, url, size, sha256 } }
let downloaded = null; // path of the verified installer

async function check() {
  const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'AutoStudio-updater', Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  const rel = await r.json();
  const version = String(rel.tag_name ?? '').replace(/^v/, '');
  const current = currentVersion();
  const setup = (rel.assets ?? []).find((a) => /^AutoStudio-Setup-.*\.exe$/.test(a.name));
  const available = !!version && newer(version, current);
  found = available && setup
    ? { version, notes: String(rel.body ?? '').slice(0, 4000), page: rel.html_url ?? RELEASES, asset: { name: setup.name, url: setup.browser_download_url, size: setup.size, sha256: String(setup.digest ?? '').replace(/^sha256:/, '') } }
    : null;
  return { current, latest: version, available, portable: isPortable(), notes: found?.notes ?? '', page: rel.html_url ?? RELEASES, size: setup?.size ?? 0, downloaded: !!downloaded };
}

async function download(win) {
  if (!found) await check();
  if (!found) throw new Error('No newer version to download');
  const { url, name, size, sha256 } = found.asset;
  if (!url.startsWith(DOWNLOAD_PREFIX)) throw new Error('Refusing to download from an unexpected address');
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('The release has no checksum — download it from the Releases page instead');
  const dest = path.join(os.tmpdir(), name);
  const r = await net.fetch(url);
  if (!r.ok || !r.body) throw new Error(`Download failed (${r.status})`);
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(dest);
  const reader = r.body.getReader();
  let received = 0, lastSent = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      received += value.length;
      if (!out.write(value)) await new Promise((res) => out.once('drain', res));
      if (Date.now() - lastSent > 250) {
        lastSent = Date.now();
        win?.webContents.send('autostudio:update-progress', { received, total: size });
      }
    }
  } finally {
    await new Promise((res) => out.end(res));
  }
  if (hash.digest('hex') !== sha256) {
    fs.rmSync(dest, { force: true });
    throw new Error('The downloaded file does not match the published checksum — it was deleted. Try again.');
  }
  win?.webContents.send('autostudio:update-progress', { received: size, total: size });
  downloaded = dest;
  return { ok: true, version: found.version };
}

function install() {
  if (!downloaded || !fs.existsSync(downloaded)) throw new Error('Download the update first');
  // electron-builder's NSIS installer: /S = silent, --updated keeps the install folder, --force-run starts the new version.
  spawn(downloaded, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 300);
  return { ok: true };
}

function registerUpdater() {
  ipcMain.handle('autostudio:update-check', () => check());
  ipcMain.handle('autostudio:update-download', (e) => download(BrowserWindow.fromWebContents(e.sender)));
  ipcMain.handle('autostudio:update-install', () => (isPortable() ? (void shell.openExternal(found?.page ?? RELEASES), { ok: false, portable: true }) : install()));
}

module.exports = { registerUpdater, newer };
