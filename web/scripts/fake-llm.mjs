// Fake OpenAI-compatible LLM for testing the AI features without LM Studio.
//   node scripts/fake-llm.mjs [port=1235]
// It behaves like LM Studio + Gemma: rejects a `system` role (so the app must fold it), and returns
// deliberately messy replies (```json fences, prose, <think> blocks, trailing commas) to exercise parsing.
import { createServer } from 'node:http';

const port = +(process.argv[2] ?? 1235);
const MODEL = 'gemma-3-4b-it';
const log = [];

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const send = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json', ...cors });
  res.end(JSON.stringify(body));
};

function answer(text) {
  if (/Reply with exactly: AutoStudio connected/.test(text)) return 'AutoStudio connected.';
  if (/video editor for faceless/.test(text)) {
    const n = (text.match(/^\d+: /gm) ?? []).length;
    const motions = ['zoomIn', 'panLeft', 'tiltUp', 'drift', 'zoomOut'];
    const trans = ['none', 'crossfade', 'slideLeft', 'zoomBlur', 'flash'];
    const plan = Array.from({ length: n }, (_, i) => ({ i, motion: motions[i % 5], transition: trans[i % 5], ...(i % 3 === 1 ? { sfx: 'whoosh' } : {}) }));
    return `Sure! Here is the edit plan:\n\`\`\`json\n${JSON.stringify(plan, null, 1)}\n\`\`\`\nLet me know if you want changes.`;
  }
  if (/kinetic typography/.test(text)) {
    const idx = [...text.matchAll(/(\d+):\S+/g)].map((m) => +m[1]);
    const max = idx.length ? Math.max(...idx) : 0;
    const picks = [];
    for (let f = 2; f + 2 <= max; f += 12) picks.push({ from: f, to: f + 2, main: [f + 1], template: ['stack', 'mixed', 'scriptCaps', 'punch'][picks.length % 4] });
    // Thinking block + prose + trailing comma — the app must still parse this.
    return `<think>The user wants phrases. Pick strong words.</think>Here you go: ${JSON.stringify(picks).replace(/]$/, ',]')}`;
  }
  if (/prompts for an AI image/.test(text)) {
    const m = text.match(/JSON array of (\d+) strings/);
    const n = m ? +m[1] : 1;
    return JSON.stringify(Array.from({ length: n }, (_, i) => `Cinematic wide shot ${i + 1}, golden hour light, shallow depth of field, slow dolly in`));
  }
  if (/Fix spelling/.test(text)) {
    const body = text.split('\n\n').slice(1).join('\n\n') || text;
    return body.replace(/^./, (c) => c.toUpperCase()).replace(/([^.])$/, '$1.');
  }
  if (/YouTube upload metadata/.test(text)) return 'Titles:\n1. The Secret Nobody Tells You\n2. Why This Changes Everything\n\nDescription: A short story about focus.\n\n#focus #story';
  return 'OK';
}

createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.url?.endsWith('/models')) return send(res, 200, { data: [{ id: MODEL, object: 'model' }] });
  if (req.url?.endsWith('/chat/completions') && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      const msgs = body.messages ?? [];
      if (msgs.some((m) => m.role === 'system')) {
        log.push('rejected system role');
        return send(res, 400, { error: 'Jinja template error: System role not supported' });
      }
      const text = msgs.filter((m) => m.role === 'user').map((m) => m.content).join('\n\n');
      const content = answer(text);
      log.push(`${text.slice(0, 50).replace(/\n/g, ' ')} → ${content.slice(0, 40).replace(/\n/g, ' ')}`);
      console.log(log[log.length - 1]);
      send(res, 200, { id: 'fake', object: 'chat.completion', model: MODEL, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] });
    });
    return;
  }
  if (req.url === '/log') return send(res, 200, log);
  send(res, 404, { error: 'not found' });
}).listen(port, () => console.log(`fake LLM on http://localhost:${port}/v1 (model ${MODEL})`));
