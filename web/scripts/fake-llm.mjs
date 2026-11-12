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
  if (/art director of my video editor AutoStudio/.test(text)) {
    // Story answer: a design per scene (round-robin over the catalogue), fenced, with a sentence before it.
    const ids = [...text.matchAll(/^- ([a-z0-9-]+): /gm)].map((m) => m[1]);
    const nums = [...text.matchAll(/^(\d+) \([\d.]+–[\d.]+ s\) “([^”]*)”/gm)].map((m) => ({ n: +m[1], t: m[2] }));
    const scenes = nums.map(({ n, t }, i) => ({ n, template: ids[(i * 5 + 1) % Math.max(1, ids.length)] ?? 'headline', slots: { title: t.split(' ').slice(0, 5).join(' '), key: t.split(' ').sort((a, b) => b.length - a.length)[0].replace(/[^\p{L}]/gu, '') } }));
    return `Here is the storyboard:\n\`\`\`json\n${JSON.stringify({ autoStudioStory: 1, scenes })}\n\`\`\``;
  }
  if (/Write the narration script/.test(text)) return 'Most people never think about it. But every day we make the same small choice. Forty percent of us do it without noticing. Here is why it matters, and what you can change tomorrow. First, notice it. Second, pause. Third, choose. Small steps add up to big results over a year.';
  if (/top After Effects motion designer/.test(text)) {
    // Motion Studio / Director: a recipe per section (or for the idea), inside fences, with the same transition twice
    // in a row so the app's variety fix has something to do.
    const sec = /SECTION (\d+) of (\d+) — ([\d.]+) s long/.exec(text);
    const len = sec ? +sec[3] : 8;
    const beats = sec ? [...text.slice(text.lastIndexOf(`SECTION ${sec[1]} of`)).matchAll(/^B(\d+) ([\d.]+)–([\d.]+) s \[[^\]]*\] “([^”]*)”/gm)].map((m) => ({ a: +m[2], b: +m[3], t: m[4] })) : [{ a: 0, b: len, t: 'Make it move' }];
    const items = [];
    beats.forEach((b, i) => {
      items.push({ type: 'background', kind: i % 2 ? 'mesh' : 'gradient', colors: i % 2 ? ['#101826', '#3b2a6b', '#0f4c5c'] : ['#1d1a22', '#4a1d2c'], start: b.a, dur: b.b - b.a });
      items.push({ type: 'widget', id: 'headline', start: b.a + 0.1, dur: b.b - b.a - 0.1, title: b.t.split(' ').slice(0, 6).join(' '), gold: b.t.split(' ').sort((x, y) => y.length - x.length)[0].replace(/[^\p{L}]/gu, ''), size: 96 });
      if (i < beats.length - 1) items.push({ type: 'widget', id: 'wipe', start: b.b - 0.5, dur: 1, dir: 'left', colors: ['#ff6b4a', '#101826'] });
    });
    return `Here is section ${sec ? sec[1] : 1}:\n\`\`\`json\n${JSON.stringify({ haVisualRecipe: 2, palette: 'dark', items })}\n\`\`\``;
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
