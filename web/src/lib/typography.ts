import type { TypoBlock, TypoRole, TypoSettings, TypoTemplate, TypoWord, Word } from '../types';
import { hash, isRtl, uid } from './util';
import { scoreWords } from './keywords';
import { chatJson } from './llm';

type Weighted = { family: string; weight: number };

/** Font per role. `main` = heavy caps, `script` = handwritten accent, `side` = vertical caps. */
export const FONT_PAIRS: Record<string, { name: string; main: Weighted; minor: Weighted; script: Weighted; side: Weighted }> = {
  'spartan-pacifico': { name: 'Spartan + Pacifico', main: { family: 'League Spartan', weight: 900 }, minor: { family: 'League Spartan', weight: 700 }, script: { family: 'Pacifico', weight: 400 }, side: { family: 'League Spartan', weight: 900 } },
  'archivo-dancing': { name: 'Archivo + Dancing', main: { family: 'Archivo Black', weight: 400 }, minor: { family: 'Montserrat', weight: 700 }, script: { family: 'Dancing Script', weight: 700 }, side: { family: 'Archivo Black', weight: 400 } },
  'oswald-caveat': { name: 'Oswald + Caveat', main: { family: 'Oswald', weight: 700 }, minor: { family: 'Oswald', weight: 500 }, script: { family: 'Caveat Brush', weight: 400 }, side: { family: 'Oswald', weight: 700 } },
  'bebas-marker': { name: 'Bebas + Marker', main: { family: 'Bebas Neue', weight: 400 }, minor: { family: 'Bebas Neue', weight: 400 }, script: { family: 'Permanent Marker', weight: 400 }, side: { family: 'Bebas Neue', weight: 400 } },
  'barlow-pacifico': { name: 'Barlow + Pacifico', main: { family: 'Barlow Condensed', weight: 800 }, minor: { family: 'Barlow Condensed', weight: 600 }, script: { family: 'Pacifico', weight: 400 }, side: { family: 'Barlow Condensed', weight: 800 } },
  'anton-dancing': { name: 'Anton + Dancing', main: { family: 'Anton', weight: 400 }, minor: { family: 'Oswald', weight: 500 }, script: { family: 'Dancing Script', weight: 700 }, side: { family: 'Anton', weight: 400 } },
  'arabic': { name: 'Arabic (Lalezar + Reem Kufi)', main: { family: 'Lalezar', weight: 400 }, minor: { family: 'Reem Kufi', weight: 700 }, script: { family: 'Amiri', weight: 700 }, side: { family: 'Reem Kufi', weight: 700 } },
};

/** `text` = main words, `accent` = script/accent words, `card`/`frame` = backgrounds. */
export const TYPO_PALETTES: Record<string, { name: string; text: string; minor: string; accent: string; card: string; frame: string; outline: string }> = {
  'mono-yellow': { name: 'White + yellow', text: '#ffffff', minor: '#ffffff', accent: '#ffc21a', card: 'rgba(10,10,12,0.72)', frame: '#111114', outline: '#000000' },
  'black-yellow': { name: 'Black on white', text: '#111111', minor: '#111111', accent: '#f5b400', card: '#ffffff', frame: '#ffffff', outline: '#ffffff' },
  'yellow-frame': { name: 'Yellow poster', text: '#111111', minor: '#111111', accent: '#ffffff', card: '#fbbd14', frame: '#fbbd14', outline: '#fbbd14' },
  'doodle': { name: 'Charcoal + orange', text: '#e4e4e4', minor: '#e4e4e4', accent: '#e8862c', card: '#1c1c1c', frame: '#1c1c1c', outline: '#000000' },
  'neon': { name: 'Neon', text: '#ffffff', minor: '#bfefff', accent: '#22e3ff', card: 'rgba(5,10,25,0.75)', frame: '#070b1a', outline: '#000000' },
  'fire': { name: 'Fire', text: '#ffffff', minor: '#ffe3cf', accent: '#ff5a1f', card: 'rgba(25,8,0,0.75)', frame: '#1a0800', outline: '#000000' },
  'mint': { name: 'Mint', text: '#0f2a24', minor: '#0f2a24', accent: '#ff6b6b', card: '#c8f7e1', frame: '#c8f7e1', outline: '#c8f7e1' },
};

export const TEMPLATE_LABELS: Record<TypoTemplate, string> = {
  stack: 'Stack', stackSide: 'Stack + side', mixed: 'Mixed weights', scriptCaps: 'Script + caps', punch: 'Single punch', random: 'Random mix',
};

const CONNECTORS = new Set('with and the of to in a an my your our for on at by from or but is are was so it this that de la le et à en و في من على'.split(' '));
const clean = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’]+$/gu, '');

/** Assign roles: best-scoring word(s) are `main`, short connectors `script`, others `minor` / `side`. */
export function assignRoles(texts: string[], scores: number[], template: Exclude<TypoTemplate, 'random'>): TypoRole[] {
  const order = texts.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  // Stacks and script+caps make every content word big; "mixed" keeps a small trailing word; "punch" has one hero word.
  const mainCount = template === 'punch' ? 1 : template === 'mixed' && texts.length >= 3 ? texts.length - 1 : texts.length;
  const mains = new Set(template === 'mixed' && texts.length >= 3 ? texts.map((_, i) => i).slice(0, mainCount) : order.slice(0, mainCount));
  const roles: TypoRole[] = texts.map((t, i) => (CONNECTORS.has(clean(t).toLowerCase()) && texts.length > 1 ? 'script' : mains.has(i) ? 'main' : 'minor'));
  if (!roles.includes('main')) roles[order[0]] = 'main';
  if (template === 'stackSide') {
    // The weakest content word runs vertically on the side.
    const weakest = [...order].reverse();
    const side = weakest.find((i) => roles[i] === 'minor') ?? (roles.filter((r) => r === 'main').length > 1 ? weakest.find((i) => roles[i] === 'main') : undefined);
    if (side !== undefined) roles[side] = 'side';
  }
  if (template === 'scriptCaps' && !roles.includes('script') && texts.length > 1) roles[order[order.length - 1]] = 'script';
  return roles;
}

/** Pick a template that suits the phrase (used by "Random mix"). */
export function chooseTemplate(texts: string[], seed: number): Exclude<TypoTemplate, 'random'> {
  if (texts.length === 1) return 'punch';
  const hasConnector = texts.some((t) => CONNECTORS.has(clean(t).toLowerCase()));
  if (texts.length === 2 && hasConnector) return 'scriptCaps';
  if (texts.length >= 4) return hash(seed * 3.1) > 0.4 ? 'stackSide' : 'mixed';
  const pool: Exclude<TypoTemplate, 'random'>[] = ['stack', 'mixed', 'scriptCaps', 'stackSide'];
  return pool[Math.floor(hash(seed * 7.7) * pool.length)];
}

const PLACES = [[0.5, 0.42], [0.36, 0.38], [0.64, 0.4], [0.5, 0.34], [0.4, 0.46], [0.6, 0.46]];

/** Build a block from consecutive transcript words. */
export function makeBlock(words: Word[], s: TypoSettings, seed: number, scores?: number[]): TypoBlock {
  const texts = words.map((w) => clean(w.text) || w.text);
  const sc = scores ?? scoreWords(words);
  const template = s.template === 'random' ? chooseTemplate(texts, seed) : s.template;
  const roles = assignRoles(texts, sc, template);
  const [x, y] = PLACES[Math.floor(hash(seed * 1.3) * PLACES.length)];
  return {
    id: uid(), start: words[0].start, end: words[words.length - 1].end + s.hold, template, x, y, scale: 1, rotate: 0,
    palette: s.palette, fontPair: isRtl(texts.join(' ')) ? 'arabic' : s.fontPair, bg: s.bg, locked: false,
    words: words.map((w, i) => ({ text: texts[i], start: w.start, end: w.end, role: roles[i] })),
  };
}

/**
 * Automatic phrases: slide over the transcript in windows of 10/density seconds and keep the best-scoring run of
 * 2–maxWords consecutive words inside each window (sentence boundaries end a run).
 */
export function autoBlocks(words: Word[], s: TypoSettings): TypoBlock[] {
  if (!words.length) return [];
  const scores = scoreWords(words);
  const total = words[words.length - 1].end;
  const win = 10 / Math.max(0.2, s.density);
  const out: TypoBlock[] = [];
  let lastEnd = -1;
  for (let t0 = words[0].start, k = 0; t0 < total; t0 += win, k++) {
    let best: { i: number; n: number; v: number } | null = null;
    for (let i = 0; i < words.length; i++) {
      if (words[i].start < t0 || words[i].start >= t0 + win || i <= lastEnd) continue;
      let v = 0;
      for (let n = 1; n <= s.maxWords && i + n <= words.length; n++) {
        const w = words[i + n - 1];
        if (n > 1 && w.start - words[i + n - 2].end > 0.5) break;
        v += scores[i + n - 1] + 0.15;
        const avg = v / n + (n >= 2 && n <= 3 ? 0.25 : 0);
        if (scores[i] > 0 && (!best || avg > best.v)) best = { i, n, v: avg };
        if (/[.!?…،؟,;:]$/.test(w.text)) break;
      }
    }
    if (best) {
      out.push(makeBlock(words.slice(best.i, best.i + best.n), s, s.seed * 31 + k, scores.slice(best.i, best.i + best.n)));
      lastEnd = best.i + best.n - 1;
    }
  }
  // Blocks must not overlap: each ends before the next begins.
  out.forEach((b, i) => {
    const next = out[i + 1];
    if (next && b.end > next.start - 0.05) b.end = Math.max(b.words[b.words.length - 1].end, next.start - 0.05);
  });
  return out;
}

/** Re-roll templates, positions and looks for unlocked blocks (🎲). */
export function restyle(blocks: TypoBlock[], s: TypoSettings): TypoBlock[] {
  return blocks.map((b, i) => {
    if (b.locked) return b;
    const seed = s.seed * 31 + i;
    const template = s.template === 'random' ? chooseTemplate(b.words.map((w) => w.text), seed) : s.template;
    const roles = assignRoles(b.words.map((w) => w.text), b.words.map((w) => (w.role === 'main' ? 2 : w.role === 'script' ? 0 : 1)), template);
    const [x, y] = PLACES[Math.floor(hash(seed * 1.3) * PLACES.length)];
    return { ...b, template, x, y, palette: s.palette, fontPair: isRtl(b.words.map((w) => w.text).join(' ')) ? 'arabic' : s.fontPair, bg: s.bg, words: b.words.map((w, k) => ({ ...w, role: roles[k], font: undefined, color: undefined })) };
  });
}

export interface AiPick { from: number; to: number; main: number[]; template?: string }

/** Make an LLM answer usable: unwrap {phrases: [...]}, numbers given as text, `main` as one number / text / list. */
export function cleanPicks(raw: unknown, wordCount: number): AiPick[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? (Object.values(raw).find(Array.isArray) ?? []) : [];
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return (list as Record<string, unknown>[]).flatMap((r) => {
    if (!r || typeof r !== 'object') return [];
    const from = num(r.from), to = num(r.to);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to >= wordCount || to - from >= 8) return [];
    const m = r.main;
    const main = (Array.isArray(m) ? m : typeof m === 'string' ? m.split(/[\s,]+/) : m === undefined || m === null ? [] : [m]).map(num).filter(Number.isInteger);
    return [{ from, to, main, template: typeof r.template === 'string' ? r.template : undefined }];
  });
}

/** Ask the LLM for impactful phrases + their emphasis word and a template. */
export async function aiBlocks(words: Word[], s: TypoSettings): Promise<TypoBlock[]> {
  const target = Math.max(2, Math.round(((words[words.length - 1].end - words[0].start) / 10) * s.density));
  const indexed = words.map((w, i) => `${i}:${w.text}`).join(' ');
  const raw = await chatJson<unknown>(
    `You design kinetic typography for faceless videos. From a voiceover transcript pick short, punchy phrases (1-${s.maxWords} consecutive words) that deserve to appear as big animated typography. Spread them across the whole video, avoid filler. For each, give the word indexes to emphasise and a template from [stack, stackSide, mixed, scriptCaps, punch].`,
    `Transcript (index:word): ${indexed}\n\nPick about ${target} phrases. Return JSON: [{"from": 12, "to": 14, "main": [13], "template": "stack"}]`,
    3000,
  );
  const valid = ['stack', 'stackSide', 'mixed', 'scriptCaps', 'punch'];
  const res = cleanPicks(raw, words.length);
  if (!res.length) throw new Error('The AI answer had no usable phrases — try again, or use Auto pick.');
  const blocks = res
    .sort((a, b) => a.from - b.from)
    .map((r, k) => {
      const slice = words.slice(r.from, r.to + 1);
      const scores = slice.map((_, i) => (r.main.includes(r.from + i) ? 5 : 1));
      const tpl = valid.includes(r.template ?? '') ? (r.template as Exclude<TypoTemplate, 'random'>) : s.template;
      return makeBlock(slice, { ...s, template: tpl }, s.seed * 17 + k, scores);
    });
  blocks.forEach((b, i) => {
    const next = blocks[i + 1];
    if (next && b.end > next.start - 0.05) b.end = Math.max(b.words[b.words.length - 1].end, next.start - 0.05);
  });
  return blocks;
}

export const blockText = (b: TypoBlock) => b.words.map((w: TypoWord) => w.text).join(' ');
