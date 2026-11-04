// Reproduces the notebook's connection path locally: engine on :1237 → Cloudflare quick tunnel → public /health.
// Measures how long after the URL is printed the public URL starts answering, and what the app's
// single 8-second check (lib/engine.ts) would have seen at the moment the notebook prints "READY".
//   node scripts/tunnel-check.mjs [path-to-cloudflared]
import { spawn } from 'node:child_process';

const bin = process.argv[2] ?? '../.shots/cloudflared.exe';
const engine = spawn(process.execPath, ['scripts/fake-engine.mjs', '1237'], { stdio: 'ignore' });
const tunnel = spawn(bin, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:1237']);
const t0 = Date.now();
const sec = () => ((Date.now() - t0) / 1000).toFixed(1);
let url = '';
let registered = 0;
const GATE = process.argv.includes('--gate');
const done = (code) => (engine.kill(), tunnel.kill(), process.exit(code));
setTimeout(() => (console.log('timeout: no URL in 60 s'), done(2)), 60000);

const onData = async (buf) => {
  if (/Registered tunnel connection/.test(String(buf)) && !registered) (registered = Date.now()), console.log(`[${sec()}s] tunnel registered`);
  const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!m || url) return;
  url = m[0];
  const printed = Date.now();
  console.log(`[${sec()}s] URL printed: ${url}`);
  if (GATE) {
    // Candidate fix: no lookup until the tunnel is registered, plus a short grace period.
    while (!registered) await new Promise((r) => setTimeout(r, 200));
    await new Promise((r) => setTimeout(r, 3000));
  } else await new Promise((r) => setTimeout(r, 4000)); // today: notebook waits 4 s, the app checks once
  const appCheck = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000) }).then((r) => `HTTP ${r.status}`).catch((e) => `FAILED (${e.cause?.code ?? e.name})`);
  console.log(`[${sec()}s] app-style check 4 s after URL: ${appCheck}`);
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.ok).catch(() => false);
    if (ok) {
      console.log(`[${sec()}s] public /health first OK ${((Date.now() - printed) / 1000).toFixed(1)} s after the URL was printed`);
      return done(appCheck.startsWith('HTTP 200') ? 0 : 1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log('public URL never answered within 60 s');
  done(3);
};
tunnel.stdout.on('data', onData);
tunnel.stderr.on('data', onData);
