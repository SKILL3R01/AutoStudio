// Local voice engine (desktop app): Chatterbox Multilingual on this PC — voice cloning in English, Arabic and 21 more languages.
// Installed once into <userData>/voice with uv (checksum-pinned): Python 3.12 + CPU PyTorch + chatterbox-tts, then the
// model (~3 GB) on first use. A persistent `tts_worker.py --serve` process keeps the model loaded between jobs.
const { app, BrowserWindow, ipcMain, net } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const UV_VERSION = '0.13.6';
const UV_SHA256 = 'a2a8820d5eea32f08ef467ef3b7f66883a9b076d5737a2fc2fbb5f458d1bb50f';
const UV_URL = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-pc-windows-msvc.zip`;
// Mirror: the same uv build published on PyPI (a wheel is a zip; uv.exe sits under uv-<ver>.data/scripts/).
const UV_PYPI_URL = 'https://files.pythonhosted.org/packages/7c/9d/714523188aea3054644d8e69ae8089aac70325a3cee2d3d05509d4f23398/uv-0.13.6-py3-none-win_amd64.whl';
const UV_PYPI_SHA256 = '7c9bc35ccb65932d8dc10a0669f9c805eaa3c9827ce18ecbecb1bd67944b2cdf';
const PACKAGES = { torch: ['torch==2.6.0', 'torchaudio==2.6.0'], chatterbox: ['chatterbox-tts==0.1.7'] };
const NEED_GB = 7; // runtime ~2.2 GB + model ~3 GB + headroom

// Local AppData (never synced by roaming profiles / OneDrive), unless overridden for tests.
const dir = () => process.env.AUTOSTUDIO_VOICE_DIR || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'AutoStudio', 'voice') : path.join(app.getPath('userData'), 'voice'));
const P = {
  uv: () => path.join(dir(), 'uv', 'uv.exe'),
  env: () => path.join(dir(), 'env'),
  py: () => path.join(dir(), 'env', 'Scripts', 'python.exe'),
  hf: () => path.join(dir(), 'hf'),
  tmp: () => path.join(dir(), 'tmp'),
  marker: () => path.join(dir(), 'installed.json'),
  worker: () => (app.isPackaged ? path.join(process.resourcesPath, 'tts_worker.py') : path.join(__dirname, '..', '..', 'engine', 'tts_worker.py')),
};

let installing = null; // { child, cancelled }
let worker = null; // { proc, ready: Promise, pending: Map }
const logs = [];
const note = (line) => {
  logs.push(String(line).slice(0, 400));
  if (logs.length > 200) logs.shift();
};
const send = (ch, payload) => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(ch, payload));
const progress = (stage, pct, line) => send('autostudio:voice-progress', { stage, pct, line });

function freeGB() {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const s = fs.statfsSync(dir());
    return (s.bavail * s.bsize) / 2 ** 30;
  } catch {
    return Infinity;
  }
}

function dirSizeGB(p) {
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else total += fs.statSync(f).size;
    }
  };
  try {
    walk(p);
  } catch {
    /* missing */
  }
  return total / 2 ** 30;
}

function status() {
  const installed = fs.existsSync(P.marker()) && fs.existsSync(P.py());
  const model = fs.existsSync(path.join(P.hf(), 'hub', 'models--ResembleAI--chatterbox'));
  return { supported: process.platform === 'win32', installed, model, installing: !!installing, running: !!worker, freeGB: +freeGB().toFixed(1), sizeGB: installed ? +dirSizeGB(dir()).toFixed(1) : 0, needGB: NEED_GB };
}

/** Run a command, streaming its output lines to the UI; rejects on non-zero exit or cancel. */
function run(cmd, args, stage, pct, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, windowsHide: true });
    installing.child = child;
    const onLine = (l) => {
      note(l);
      progress(stage, pct, l.slice(-160));
    };
    readline.createInterface({ input: child.stdout }).on('line', onLine);
    readline.createInterface({ input: child.stderr }).on('line', onLine);
    child.on('error', reject);
    child.on('close', (code) => (installing?.cancelled ? reject(new Error('Cancelled')) : code === 0 ? resolve() : reject(new Error(`${stage} failed (exit ${code}) — ${logs.slice(-3).join(' | ')}`))));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Download with retries + backoff; throws the last error. */
async function fetchRetry(url, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    if (installing?.cancelled) throw new Error('Cancelled');
    try {
      const r = await net.fetch(url);
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      last = new Error(`HTTP ${r.status}`);
    } catch (e) {
      last = e;
    }
    note(`[voice] download attempt ${i + 1} failed for ${new URL(url).host}: ${last.message}`);
    await sleep(1500 * 2 ** i);
  }
  throw last;
}

async function downloadUv() {
  const sources = [{ url: UV_URL, sha: UV_SHA256, label: 'GitHub' }, { url: UV_PYPI_URL, sha: UV_PYPI_SHA256, label: 'PyPI mirror' }];
  let buf, errors = [];
  for (const s of sources) {
    progress(`Downloading installer (uv) from ${s.label}`, 0.02);
    try {
      const b = await fetchRetry(s.url, 3);
      if (crypto.createHash('sha256').update(b).digest('hex') !== s.sha) throw new Error('checksum mismatch');
      buf = b;
      break;
    } catch (e) {
      errors.push(`${s.label}: ${e.message}`);
    }
  }
  if (!buf) throw new Error(`Could not download the installer (${errors.join('; ')})`);
  const zip = path.join(dir(), 'uv.zip');
  fs.writeFileSync(zip, buf);
  const tmp = path.join(dir(), 'uv-unpack');
  fs.rmSync(tmp, { recursive: true, force: true });
  await run('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${tmp}'`], 'Unpacking installer', 0.04);
  fs.rmSync(zip, { force: true });
  // GitHub zip: uv.exe at the root; PyPI wheel: uv-<ver>.data/scripts/uv.exe.
  const find = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) {
        const r = find(f);
        if (r) return r;
      } else if (e.name.toLowerCase() === 'uv.exe') return f;
    }
    return null;
  };
  const exe = find(tmp);
  if (!exe) throw new Error('uv.exe not found after unpacking');
  fs.mkdirSync(path.join(dir(), 'uv'), { recursive: true });
  fs.copyFileSync(exe, P.uv());
  fs.rmSync(tmp, { recursive: true, force: true });
}

/** Run a step up to `tries` times (network hiccups), keeping the last error. */
async function step(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (installing?.cancelled || /Cancelled/.test(e.message)) throw e;
      note(`[voice] step failed (attempt ${i + 1}): ${e.message}`);
      await sleep(3000 * (i + 1));
    }
  }
  throw last;
}

/** Turn network failures into a message that says what to do. */
function friendly(e) {
  const m = String(e?.message ?? e);
  if (/504|502|503|timed? ?out|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|Read timed out|ConnectionError|net::ERR/i.test(m)) {
    return `A download kept failing (${m.slice(0, 160)}). Your network or a firewall / proxy may be blocking GitHub or Hugging Face. Click “Retry install” — finished steps are skipped — or use the Colab engine.`;
  }
  return m;
}

const uvEnv = () => ({ UV_PYTHON_INSTALL_DIR: path.join(dir(), 'python'), UV_CACHE_DIR: path.join(dir(), 'uvcache'), UV_NO_PROGRESS: '1', UV_HTTP_TIMEOUT: '180', UV_HTTP_RETRIES: '5' });

async function install() {
  if (installing) throw new Error('Already installing');
  if (process.platform !== 'win32') throw new Error('The local voice engine is available for Windows only');
  const free = freeGB();
  if (free < NEED_GB) throw new Error(`Needs about ${NEED_GB} GB free disk space — you have ${free.toFixed(1)} GB. Free some space and try again.`);
  installing = { child: null, cancelled: false };
  fs.mkdirSync(dir(), { recursive: true });
  try {
    // Each step is skipped when already done, so "Retry install" resumes where it stopped.
    if (!fs.existsSync(P.uv())) await downloadUv();
    if (!fs.existsSync(P.py())) await step(() => run(P.uv(), ['venv', P.env(), '--python', '3.12'], 'Installing Python 3.12', 0.08, uvEnv()));
    await step(() => run(P.uv(), ['pip', 'install', '--python', P.py(), ...PACKAGES.torch, '--index-url', 'https://download.pytorch.org/whl/cpu'], 'Installing PyTorch (CPU, ~1 GB)', 0.2, uvEnv()));
    await step(() => run(P.uv(), ['pip', 'install', '--python', P.py(), ...PACKAGES.chatterbox], 'Installing Chatterbox', 0.45, uvEnv()));
    progress('Downloading the voice model (~3 GB, first time only)', 0.6);
    // The first load straight after the download can crash natively on Windows; a fresh process loads fine.
    await step(() => withRetry(() => job({ warmup: true, model: 'multilingual', language: 'en' })), 3);
    fs.writeFileSync(P.marker(), JSON.stringify({ at: new Date().toISOString(), uv: UV_VERSION, packages: PACKAGES }));
    await run(P.uv(), ['cache', 'clean'], 'Cleaning up', 0.98, uvEnv()).catch(() => {});
    progress('Ready', 1);
    installing = null;
    return status();
  } catch (e) {
    throw new Error(friendly(e));
  } finally {
    installing = null;
  }
}

function cancelInstall() {
  if (!installing) return false;
  installing.cancelled = true;
  installing.child?.kill();
  stopWorker();
  return true;
}

function ensureWorker() {
  if (worker) return worker.ready;
  if (!fs.existsSync(P.py())) return Promise.reject(new Error('The local voice engine is not installed'));
  fs.mkdirSync(P.tmp(), { recursive: true });
  const proc = spawn(P.py(), [P.worker(), '--serve'], {
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1', HF_HOME: P.hf(), HF_HUB_DISABLE_SYMLINKS_WARNING: '1', TOKENIZERS_PARALLELISM: 'false', HF_HUB_DOWNLOAD_TIMEOUT: '120', HF_HUB_ETAG_TIMEOUT: '60' },
  });
  const pending = new Map();
  let readyResolve, readyReject;
  const ready = new Promise((res, rej) => ((readyResolve = res), (readyReject = rej)));
  worker = { proc, ready, pending };
  readline.createInterface({ input: proc.stdout }).on('line', (line) => {
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      return note(line);
    }
    if (m.ready) return readyResolve(m);
    const p = pending.get(m.id);
    if (!p) return;
    if (m.progress !== undefined) return send('autostudio:voice-progress', { id: m.id, stage: 'Generating', pct: m.progress, chunk: m.chunk, chunks: m.chunks });
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error)) : p.resolve(m);
  });
  readline.createInterface({ input: proc.stderr }).on('line', (l) => {
    note(l);
    const pct = /(\d+)%\|/.exec(l);
    if (pct && installing) progress('Downloading the voice model (~3 GB, first time only)', 0.6 + 0.35 * (+pct[1] / 100), l.slice(-120));
  });
  proc.on('close', (code) => {
    const err = new Error(code === null ? 'Voice engine stopped' : `Voice engine exited (${code}) — ${logs.slice(-2).join(' | ')}`);
    readyReject(err);
    for (const p of pending.values()) p.reject(err);
    if (worker?.proc === proc) worker = null;
  });
  return ready;
}

function stopWorker() {
  worker?.proc.kill();
  worker = null;
}

/** Run a worker job; if the Python process crashed (not cancelled), restart it once and retry. */
async function withRetry(fn) {
  try {
    return await fn();
  } catch (e) {
    if (!/Voice engine exited/.test(String(e?.message))) throw e;
    note(`[voice] worker crashed (${e.message}); restarting once`);
    stopWorker();
    return fn();
  }
}

let seq = 0;
async function job(payload) {
  await ensureWorker();
  const id = payload.id ?? `j${++seq}`;
  return new Promise((resolve, reject) => {
    worker.pending.set(id, { resolve, reject });
    worker.proc.stdin.write(`${JSON.stringify({ ...payload, id })}\n`);
  });
}

/** Generate speech. `voice` = WAV/MP3 bytes of the reference sample (optional). Returns WAV bytes. */
async function generate(o) {
  const id = String(o.id || `g${Date.now()}`).replace(/[^\w-]/g, '');
  fs.mkdirSync(P.tmp(), { recursive: true });
  const out = path.join(P.tmp(), `${id}.wav`);
  let ref = null;
  if (o.voice) {
    ref = path.join(P.tmp(), `${id}-ref.${o.voiceExt || 'wav'}`);
    fs.writeFileSync(ref, Buffer.from(o.voice));
  }
  try {
    await withRetry(() => job({ id, text: String(o.text ?? ''), out, voice: ref, language: o.language || 'en', model: 'multilingual', exaggeration: o.exaggeration ?? 0.5, cfg: o.cfg ?? 0.5, temperature: o.temperature ?? 0.8, seed: o.seed ?? 0, pause: o.pause ?? 0.18 }));
    const data = fs.readFileSync(out);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  } finally {
    fs.rmSync(out, { force: true });
    if (ref) fs.rmSync(ref, { force: true });
  }
}

/** Stop a running generation (the worker restarts — the model reloads in ~25 s on the next job). */
function cancel() {
  stopWorker();
  return true;
}

function uninstall() {
  cancelInstall();
  stopWorker();
  fs.rmSync(dir(), { recursive: true, force: true });
  return status();
}

function registerVoice() {
  ipcMain.handle('autostudio:voice-status', () => status());
  ipcMain.handle('autostudio:voice-install', () => install());
  ipcMain.handle('autostudio:voice-cancel-install', () => cancelInstall());
  ipcMain.handle('autostudio:voice-generate', (_e, o) => generate(o));
  ipcMain.handle('autostudio:voice-cancel', () => cancel());
  ipcMain.handle('autostudio:voice-uninstall', () => uninstall());
  ipcMain.handle('autostudio:voice-logs', () => logs.slice(-60));
  app.on('before-quit', stopWorker);
}

module.exports = { registerVoice };
