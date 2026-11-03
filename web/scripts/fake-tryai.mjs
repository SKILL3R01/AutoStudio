// Fake TryAIToday Studio engine for testing the adapter (src/lib/tryai.ts) without Colab.
//   node scripts/fake-tryai.mjs [port=1236]
// Mirrors their API: /api/health, POST /{chatterbox,whisper,upscaler,vupscaler}/start → { job_id },
// WebSocket /ws/{id} events, GET /file/{id}/{key}, POST /cancel/{id}. CORS * like theirs.
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

const port = +(process.argv[2] ?? 1236);
const jobs = new Map();
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const json = (res, code, body) => (res.writeHead(code, { 'Content-Type': 'application/json', ...cors }), res.end(JSON.stringify(body)));

function wav(seconds = 1, sr = 16000) {
  const n = seconds * sr, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / sr) * 8000), 44 + i * 2);
  return b;
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/health') {
    return json(res, 200, { runners: { chatterbox: { ready: true }, whisper: { ready: true }, upscaler: { ready: true, models: true }, vupscaler: { ready: true } } });
  }
  const start = url.pathname.match(/^\/(chatterbox|whisper|upscaler|vupscaler)\/start$/);
  if (start && req.method === 'POST') {
    let size = 0, body = '';
    req.on('data', (c) => ((size += c.length), (body += c.toString('latin1'))));
    req.on('end', () => {
      const tool = start[1];
      // Like theirs: Chatterbox single mode needs a reference voice and a .txt script.
      if (tool === 'chatterbox' && (!body.includes('name="ref_audio"') || !body.includes('filename="script.txt"'))) return json(res, 400, { error: 'Valid reference audio is required.' });
      const id = randomUUID().replace(/-/g, '').slice(0, 12);
      const files = tool === 'chatterbox' ? { audio: ['audio/wav', wav(2)] }
        : tool === 'whisper' ? { words: ['application/json', Buffer.from(JSON.stringify([{ word: ' Hello', start: 0.1, end: 0.5 }, { word: ' world.', start: 0.6, end: 1.1 }]))] }
        : tool === 'upscaler' ? { img0: ['image/png', PNG] } : { output: ['video/mp4', Buffer.from('fake-mp4')] };
      jobs.set(id, { tool, files, bytes: size });
      console.log(`${tool} job ${id} (${size} bytes uploaded)`);
      json(res, 200, { success: true, job_id: id });
    });
    return;
  }
  const file = url.pathname.match(/^\/file\/(\w+)\/([\w-]+)$/);
  if (file) {
    const f = jobs.get(file[1])?.files[file[2]];
    if (!f) return (res.writeHead(404, cors), res.end('Not found'));
    res.writeHead(200, { 'Content-Type': f[0], ...cors });
    return res.end(f[1]);
  }
  if (url.pathname.startsWith('/cancel/')) return json(res, 200, { success: true });
  json(res, 404, { error: 'not found' });
});

// Minimal WebSocket server (text frames only, server → client).
server.on('upgrade', (req, socket) => {
  const id = req.url.split('/').pop();
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const send = (obj) => {
    const data = Buffer.from(JSON.stringify(obj));
    const head = data.length < 126 ? Buffer.from([0x81, data.length]) : Buffer.from([0x81, 126, data.length >> 8, data.length & 255]);
    socket.write(Buffer.concat([head, data]));
  };
  const job = jobs.get(id);
  if (!job) return send({ type: 'status', message: 'Job not found.', status: 'failed' });
  const steps = ['Files uploaded successfully.', 'Loading model… 20%', 'Working… 60%', 'Saving… 95%'];
  let k = 0;
  const iv = setInterval(() => {
    if (k < steps.length) send({ type: 'log', message: steps[k++], time: Date.now() / 1000 });
    else {
      clearInterval(iv);
      send({ type: 'status', message: `${job.tool} completed.`, status: 'completed', return_code: 0 });
      setTimeout(() => socket.end(Buffer.from([0x88, 0])), 100);
    }
  }, 150);
  socket.on('error', () => clearInterval(iv));
});

server.listen(port, () => console.log(`fake TryAIToday engine on http://localhost:${port}`));
