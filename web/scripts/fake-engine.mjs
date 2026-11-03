// Fake AutoStudio engine (our API) for UI tests of GPU tools without Colab.
//   node scripts/fake-engine.mjs [port=1237]
// GET /health, POST /jobs/{tool} → { id }, GET /jobs/{id} (finishes after ~2 s), GET /files/{id}/{name}.
// POST /__seed stores the bytes returned as the result file (a test records a short video in the browser).
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const port = +(process.argv[2] ?? 1237);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const json = (res, code, body) => (res.writeHead(code, { 'Content-Type': 'application/json', ...cors }), res.end(JSON.stringify(body)));
const jobs = new Map();
let seed = { type: 'video/webm', data: Buffer.alloc(0) };

const read = (req) => new Promise((r) => {
  const parts = [];
  req.on('data', (c) => parts.push(c));
  req.on('end', () => r(Buffer.concat(parts)));
});

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') return json(res, 200, { ok: true, gpu: 'Fake T4', tools: ['tts', 'transcribe', 'imagegen', 'videogen', 'upscale', 'video_upscale', 'prompts', 'script', 'chat'], drive: false });
  if (url.pathname === '/__seed' && req.method === 'POST') {
    seed = { type: req.headers['content-type'] ?? 'video/webm', data: await read(req) };
    return json(res, 200, { ok: true, bytes: seed.data.length });
  }
  const submit = url.pathname.match(/^\/jobs\/(\w+)$/);
  if (submit && req.method === 'POST') {
    const body = await read(req);
    const id = randomUUID().replace(/-/g, '').slice(0, 12);
    const fields = [...body.toString('latin1').matchAll(/name="(\w+)"(?:; filename="[^"]*")?\r\n(?:Content-Type: [^\r]+\r\n)?\r\n([^\r]{0,120})/g)].map((m) => `${m[1]}=${m[1] === 'image' ? '<file>' : m[2]}`);
    console.log(`job ${id} ${submit[1]}: ${fields.join(' · ')}`);
    jobs.set(id, { tool: submit[1], t0: Date.now(), fields });
    return json(res, 200, { id });
  }
  const st = url.pathname.match(/^\/jobs\/(\w+)$/);
  if (st && jobs.has(st[1])) {
    const j = jobs.get(st[1]);
    const p = Math.min(1, (Date.now() - j.t0) / 2000);
    const done = p >= 1;
    return json(res, 200, { id: st[1], status: done ? 'done' : 'running', progress: p, logs: [`${j.tool}: ${j.fields.join(' · ')}`, `step ${Math.round(p * 20)}/20`], files: done ? [{ name: 'clip_ai.mp4', url: `/files/${st[1]}/clip_ai.mp4` }] : [], data: done ? { seed: 1 } : null, error: null });
  }
  if (url.pathname.startsWith('/files/')) {
    res.writeHead(200, { 'Content-Type': seed.type, ...cors });
    return res.end(seed.data);
  }
  json(res, 404, { error: 'not found' });
}).listen(port, () => console.log(`fake AutoStudio engine on http://localhost:${port}`));
