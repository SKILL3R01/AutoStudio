// Headless Edge/Chrome harness: open a URL, run optional JS steps, print console errors, save screenshots.
// Usage: node scripts/cdp-shot.mjs <url> <out-prefix> [steps.json]
// steps.json: [{ "wait": ms } | { "eval": "js" } | { "shot": "name" } | { "drag": { "from": "js → [x, y]", "to": "js → [x, y]" } }]
// "drag" is a real mouse drag: the browser runs its own HTML5 drag-and-drop (CDP drag interception).
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, prefix, stepsFile] = process.argv.slice(2);
const steps = stepsFile ? JSON.parse(readFileSync(stepsFile, 'utf8')) : [{ wait: 4000 }, { shot: 'page' }];
const browser = process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// A throwaway browser profile per run (removed again at the end; a fixed USER_DATA_DIR is kept).
const profile = process.env.USER_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'cdp-'));
// Port 0 = the browser picks a free port and writes it to <profile>/DevToolsActivePort (no clash with a browser still closing).
const portFile = join(profile, 'DevToolsActivePort');
try { if (existsSync(portFile)) unlinkSync(portFile); } catch {}
const proc = spawn(browser, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--window-size=1600,1000',
  `--user-data-dir=${profile}`, '--autoplay-policy=no-user-gesture-required', ...(process.env.EXTRA_ARGS ? process.env.EXTRA_ARGS.split(' ') : ['about:blank'])], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets, port;
for (let i = 0; i < 150 && !targets; i++) {
  await sleep(200);
  // The browser may still be writing the file (Windows: EBUSY) — just try again on the next round.
  if (!port && existsSync(portFile)) try { port = +readFileSync(portFile, 'utf8').split(String.fromCharCode(10))[0].trim() || undefined; } catch {}
  if (port) targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => undefined);
}
if (!targets) throw new Error('The browser did not start (no DevTools port)');
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
let lastDrag = null;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) return pending.get(msg.id)(msg), pending.delete(msg.id);
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type))
    console.log(`[console.${msg.params.type}]`, msg.params.args.map((a) => a.value ?? a.description).join(' '));
  if (msg.method === 'Input.dragIntercepted') lastDrag = msg.params.data;
  if (msg.method === 'Runtime.exceptionThrown') console.log('[exception]', msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((r) => {
  pending.set(++id, r);
  ws.send(JSON.stringify({ id, method, params }));
});
await send('Runtime.enable');
await send('Page.enable');
// UI_MODE=pro|simple: set the interface mode before the app's scripts run (regression suites use Pro selectors).
if (process.env.UI_MODE) await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('uiMode', ${JSON.stringify(process.env.UI_MODE)}); } catch {}` });
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
// The demo editor can take much longer to open on a slow / cold machine (CI): after the first long wait,
// keep waiting (up to 40 s more) until the editor is really there, so suites never start on a half-loaded page.
const ready = async () => (await send('Runtime.evaluate', { expression: "!!(document.querySelector('.rail button') && document.querySelector('.tl-inner') && document.querySelector('.stage canvas'))", returnByValue: true })).result?.result?.value;
let first = true;
for (const s of steps) {
  if (s.wait) await sleep(s.wait);
  if (first && s.wait >= 5000 && url.includes('#demo')) {
    const t0 = Date.now();
    while (!(await ready()) && Date.now() - t0 < 40000) await sleep(500);
    if (Date.now() - t0 > 600) console.log('[wait]', `editor ready after ${((Date.now() - t0) / 1000).toFixed(1)} s more`);
    await sleep(1500);
  }
  first = false;
  if (s.eval) {
    const r = await send('Runtime.evaluate', { expression: s.eval, awaitPromise: true, returnByValue: true });
    console.log('[eval]', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? null).slice(0, 2000));
  }
  if (s.drag) {
    const at = async (js) => (await send('Runtime.evaluate', { expression: js, returnByValue: true })).result?.result?.value;
    const [x0, y0] = await at(s.drag.from), [x1, y1] = await at(s.drag.to);
    lastDrag = null;
    await send('Input.setInterceptDrags', { enabled: true });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
    for (let k = 1; k <= 6; k++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * k) / 6, y: y0 + ((y1 - y0) * k) / 6, button: 'left', buttons: 1 });
    await sleep(200);
    if (lastDrag) {
      for (const type of ['dragEnter', 'dragOver']) await send('Input.dispatchDragEvent', { type, x: x1, y: y1, data: lastDrag });
      await send('Input.dispatchDragEvent', { type: 'drop', x: x1, y: y1, data: lastDrag });
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
    await send('Input.setInterceptDrags', { enabled: false });
    console.log('[drag]', lastDrag ? `dropped (${lastDrag.items.map((i) => i.mimeType).join(', ')})` : 'no drag started');
  }
  if (s.shot) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${prefix}-${s.shot}.png`, Buffer.from(r.result.data, 'base64'));
    console.log('[shot]', `${prefix}-${s.shot}.png`);
  }
}
ws.close();
proc.kill();
if (!process.env.USER_DATA_DIR) {
  // Edge keeps files locked for a moment after it is killed: retry for a few seconds.
  await new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)));
  for (let k = 0; k < 20; k++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      await sleep(250);
    }
  }
}
process.exit(0);
