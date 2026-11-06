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

async function downloadUv() {
  progress('Downloading installer (uv)', 0.02);
  const r = await net.fetch(UV_URL);
  if (!r.ok) throw new Error(`uv download failed (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (crypto.createHash('sha256').update(buf).digest('hex') !== UV_SHA256) throw new Error('uv download does not match its published checksum');
  const zip = path.join(dir(), 'uv.zip');
  fs.writeFileSync(zip, buf);
  fs.mkdirSync(path.join(dir(), 'uv'), { recursive: true });
  await run('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${path.join(dir(), 'uv')}'`], 'Unpacking installer', 0.04);
  fs.rmSync(zip, { force: true });
  if (!fs.existsSync(P.uv())) throw new Error('uv.exe not found after unpacking');
}

const uvEnv = () => ({ UV_PYTHON_INSTALL_DIR: path.join(dir(), 'python'), UV_CACHE_DIR: path.join(dir(), 'uvcache'), UV_NO_PROGRESS: '1' });

async function install() {
  if (installing) throw new Error('Already installing');
  if (process.platform !== 'win32') throw new Error('The local voice engine is available for Windows only');
  const free = freeGB();
  if (free < NEED_GB) throw new Error(`Needs about ${NEED_GB} GB free disk space — you have ${free.toFixed(1)} GB. Free some space and try again.`);
  installing = { child: null, cancelled: false };
  fs.mkdirSync(dir(), { recursive: true });
  try {
    if (!fs.existsSync(P.uv())) await downloadUv();
    if (!fs.existsSync(P.py())) await run(P.uv(), ['venv', P.env(), '--python', '3.12'], 'Installing Python 3.12', 0.08, uvEnv());
    await run(P.uv(), ['pip', 'install', '--python', P.py(), ...PACKAGES.torch, '--index-url', 'https://download.pytorch.org/whl/cpu'], 'Installing PyTorch (CPU, ~1 GB)', 0.2, uvEnv());
    await run(P.uv(), ['pip', 'install', '--python', P.py(), ...PACKAGES.chatterbox], 'Installing Chatterbox', 0.45, uvEnv());
    progress('Downloading the voice model (~3 GB, first time only)', 0.6);
    await ensureWorker();
    await job({ warmup: true, model: 'multilingual', language: 'en' });
    fs.writeFileSync(P.marker(), JSON.stringify({ at: new Date().toISOString(), uv: UV_VERSION, packages: PACKAGES }));
    await run(P.uv(), ['cache', 'clean'], 'Cleaning up', 0.98, uvEnv()).catch(() => {});
    progress('Ready', 1);
    return status();
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
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1', HF_HOME: P.hf(), HF_HUB_DISABLE_SYMLINKS_WARNING: '1', TOKENIZERS_PARALLELISM: 'false' },
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
    await job({ id, text: String(o.text ?? ''), out, voice: ref, language: o.language || 'en', model: 'multilingual', exaggeration: o.exaggeration ?? 0.5, cfg: o.cfg ?? 0.5, temperature: o.temperature ?? 0.8, seed: o.seed ?? 0, pause: o.pause ?? 0.18 });
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
