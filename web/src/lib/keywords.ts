import type { KeywordAnim, KeywordItem, KeywordSettings, Word } from '../types';
import { hash, uid } from './util';

export const FONT_COMBOS: Record<string, { name: string; fonts: string[] }> = {
  'bold-serif': { name: 'Bebas + Playfair', fonts: ['Bebas Neue', 'Playfair Display', 'Montserrat'] },
  'impact-marker': { name: 'Anton + Marker', fonts: ['Anton', 'Permanent Marker'] },
  'comic': { name: 'Bangers + Poppins', fonts: ['Bangers', 'Poppins'] },
  'clean': { name: 'Montserrat + Inter', fonts: ['Montserrat', 'Inter'] },
  'editorial': { name: 'Playfair + Bebas', fonts: ['Playfair Display', 'Bebas Neue'] },
  'arabic': { name: 'Cairo + Amiri', fonts: ['Cairo', 'Amiri', 'Noto Naskh Arabic'] },
  'urdu': { name: 'Nastaliq + Cairo', fonts: ['Noto Nastaliq Urdu', 'Cairo'] },
  'mix-all': { name: 'Random mix', fonts: ['Bebas Neue', 'Anton', 'Bangers', 'Permanent Marker', 'Playfair Display', 'Montserrat', 'Poppins'] },
};

export const PALETTES: Record<string, { name: string; colors: string[] }> = {
  neon: { name: 'Neon', colors: ['#22e3ff', '#ff2bd6', '#b6ff3b', '#ffffff'] },
  gold: { name: 'Gold', colors: ['#ffd166', '#ffb703', '#fff4d6'] },
  fire: { name: 'Fire', colors: ['#ff4d4d', '#ff8c1a', '#ffd400', '#ffffff'] },
  pastel: { name: 'Pastel', colors: ['#ffc8dd', '#bde0fe', '#cdb4db', '#caffbf'] },
  mono: { name: 'Mono', colors: ['#ffffff', '#e5e5e5'] },
  ocean: { name: 'Ocean', colors: ['#4dd0ff', '#00f5d4', '#e0fbfc'] },
  mrbeast: { name: 'Yellow / Red', colors: ['#ffe600', '#ff2d55', '#ffffff'] },
};

const STOP = new Set(`a an the and or but if then so of to in on at by for with from up down out over under again further once here there when where why how all any both each few more most other some such no nor not only own same than too very can will just don should now is are was were be been being have has had do does did i me my we our you your he him his she her it its they them their what which who whom this that these those am as until while about against between into through during before after above below off also get got like really thing things going go gonna one ever even still let lets yeah okay ok well
le la les un une des du de et ou mais donc or ni car je tu il elle nous vous ils elles ce cette ces est sont pas que qui dans sur pour avec par
في من على إلى عن مع هذا هذه ذلك التي الذي و أو ثم لا ما لم لن هو هي هم أن إن كان كانت قد كل`.split(/\s+/));

const clean = (w: string) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** Score how "keyword-worthy" a word is: length, rarity in the script, numbers and emphasis. */
export function scoreWords(words: Word[]) {
  const freq = new Map<string, number>();
  words.forEach((w) => {
    const c = clean(w.text);
    freq.set(c, (freq.get(c) ?? 0) + 1);
  });
  return words.map((w, i) => {
    const c = clean(w.text);
    if (!c || STOP.has(c) || c.length < 3) return 0;
    let s = Math.min(c.length, 10) / 10 + 0.6 / (freq.get(c) ?? 1);
    if (/\d/.test(c)) s += 0.8;
    if (/[!?]$/.test(w.text)) s += 0.5;
    if (/^[A-Z]/.test(w.text) && i > 0 && !/[.!?]$/.test(words[i - 1].text)) s += 0.4;
    if (w.text === w.text.toUpperCase() && /\p{L}{2}/u.test(w.text)) s += 0.6;
    return s;
  });
}

/** Choose ~`density` keywords per 10 s: the best-scoring word in each window. */
export function pickKeywords(words: Word[], s: KeywordSettings): { text: string; start: number; end: number }[] {
  if (!words.length) return [];
  const scores = scoreWords(words);
  const total = words[words.length - 1].end;
  const win = 10 / Math.max(0.2, s.density);
  const out: { text: string; start: number; end: number }[] = [];
  for (let t0 = 0; t0 < total; t0 += win) {
    let best = -1;
    words.forEach((w, i) => w.start >= t0 && w.start < t0 + win && scores[i] > 0 && (best < 0 || scores[i] > scores[best]) && (best = i));
    if (best >= 0) out.push({ text: words[best].text.replace(/[.,;:،]+$/, ''), start: words[best].start, end: words[best].end });
  }
  return out;
}

/** Give each keyword a position, font, colour, size, rotation and animation (seeded, so 🎲 is repeatable). */
export function layoutKeywords(items: { text: string; start: number; end: number; id?: string }[], s: KeywordSettings, aspect: string, existing: KeywordItem[] = []): KeywordItem[] {
  const fonts = FONT_COMBOS[s.combo]?.fonts ?? FONT_COMBOS['bold-serif'].fonts;
  const colors = PALETTES[s.palette]?.colors ?? PALETTES.neon.colors;
  const anims: KeywordAnim[] = s.anims.length ? s.anims : ['pop'];
  const tall = aspect === '9:16' || aspect === '4:5';
  const zones = s.placement === 'grid'
    ? [[0.25, 0.3], [0.75, 0.3], [0.5, 0.5], [0.25, 0.68], [0.75, 0.68]]
    : tall ? [[0.5, 0.25], [0.35, 0.4], [0.65, 0.55], [0.5, 0.65]] : [[0.25, 0.25], [0.72, 0.3], [0.5, 0.45], [0.3, 0.6], [0.7, 0.62]];
  let prev = -1;
  return items.map((it, i) => {
    const old = existing.find((e) => e.id === it.id);
    if (old?.locked) return { ...old, text: it.text, start: it.start, end: it.end };
    const r = (k: number) => hash(s.seed * 97 + i * 13 + k);
    let x: number, y: number;
    if (s.placement === 'random') {
      x = 0.2 + r(1) * 0.6;
      y = 0.18 + r(2) * 0.5;
    } else {
      let z = Math.floor(r(1) * zones.length);
      if (z === prev) z = (z + 1) % zones.length;
      prev = z;
      x = zones[z][0] + (r(2) - 0.5) * 0.08;
      y = zones[z][1] + (r(3) - 0.5) * 0.06;
    }
    return {
      id: it.id ?? uid(), text: s.uppercase ? it.text.toLocaleUpperCase() : it.text, start: it.start, end: Math.max(it.end, it.start + s.hold),
      x, y, font: fonts[Math.floor(r(4) * fonts.length)], color: colors[Math.floor(r(5) * colors.length)],
      size: 0.7 + r(6) * 0.5, rotate: Math.round((r(7) - 0.5) * 16), anim: anims[Math.floor(r(8) * anims.length)], locked: false,
    };
  });
}
