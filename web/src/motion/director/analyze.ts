/** Motion Director · voice analysis: narration words → sections (45–90 s) → beats (2.5–4 s, one stressed phrase each). */

export interface DWord { w: string; t: number; end: number }
export type BeatHint = 'number' | 'percent' | 'money' | 'compare' | 'list' | 'question' | 'quote' | 'date' | 'trend' | 'plain';
export interface DBeat {
  id: string;
  /** Index over the whole video. */
  i: number;
  section: number;
  start: number;
  end: number;
  text: string;
  words: DWord[];
  /** Key words (gold / highlighted), longest content words + numbers. */
  keys: string[];
  hints: BeatHint[];
  /** Storyboard: the layout chosen for this beat (editable). */
  layout: string;
  /** Storyboard: a note for the AI ("show a cracked phone"). */
  note?: string;
  locked?: boolean;
}
export interface DSection { i: number; start: number; end: number; title: string; mood: 'hook' | 'explain' | 'story' | 'recap' | 'end' }

const STOP = new Set('the a an and or but if then so to of in on at by for with from as is are was were be been being it its this that these those i you he she we they me him her us them my your his our their not no do does did have has had will would can could should just very really also into about than too more most some any all one two'.split(' ')
  .concat('في من على إلى عن مع هذا هذه ذلك التي الذي هو هي هم أن إن كان كانت لا ما لم لن قد ثم أو و'.split(' ')));
const NUM_WORDS = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|billion|half|double|triple)\b/i;
const clean = (w: string) => w.replace(/[^\p{L}\p{N}%$€£.,-]/gu, '').replace(/[.,]+$/, '');

export function hintsOf(text: string): BeatHint[] {
  const h: BeatHint[] = [];
  if (/\d+(\.\d+)?\s?%|\bpercent\b|بالمئة|٪/i.test(text)) h.push('percent');
  if (/[$€£]\s?\d|\d\s?(dollars|euros|pounds|k\b|m\b|million|billion)/i.test(text)) h.push('money');
  if (/\d/.test(text) || NUM_WORDS.test(text)) h.push('number');
  if (/\b(1[5-9]\d\d|20\d\d)\b/.test(text)) h.push('date');
  if (/\b(vs\.?|versus|instead of|rather than|compared to|on the other hand|but)\b|بدلا من|مقابل|لكن/i.test(text)) h.push('compare');
  if ((text.match(/,/g) ?? []).length >= 2 || /\b(first|second|third|finally|step)\b/i.test(text)) h.push('list');
  if (/[?؟]\s*$/.test(text.trim())) h.push('question');
  if (/["“”«»]/.test(text)) h.push('quote');
  if (/\b(grow|grows|grew|rise|rises|rose|increase|doubled|tripled|more and more|skyrocket|drop|fell|decline|less)\b/i.test(text)) h.push('trend');
  if (!h.length) h.push('plain');
  return h;
}

export function keysOf(words: DWord[], n = 2): string[] {
  const nums = words.map((w) => clean(w.w)).filter((w) => /\d/.test(w));
  const content = [...new Set(words.map((w) => clean(w.w)).filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()) && !/\d/.test(w)))];
  content.sort((a, b) => b.length - a.length);
  return [...nums.slice(0, 1), ...content].slice(0, n);
}

/** Split narration into beats (sentences, long ones split at commas / the middle, tiny ones merged). */
export function makeBeats(words: DWord[], minLen = 1.8, maxLen = 4.5): Omit<DBeat, 'section' | 'layout'>[] {
  const ws = words.filter((w) => w.w.trim());
  if (!ws.length) return [];
  // Sentences: end punctuation or a pause > 0.6 s.
  const sents: DWord[][] = [[]];
  ws.forEach((w, i) => {
    sents[sents.length - 1].push(w);
    const next = ws[i + 1];
    if (next && (/[.!?؟…]["”»]?$/.test(w.w) || next.t - w.end > 0.6)) sents.push([]);
  });
  const chunks: DWord[][] = [];
  for (const s of sents.filter((x) => x.length)) {
    const dur = s[s.length - 1].end - s[0].t;
    if (dur <= maxLen) chunks.push(s);
    else {
      // Split at commas near the middle (or the middle word) until every part fits.
      const parts: DWord[][] = [s];
      for (let guard = 0; guard < 20; guard++) {
        const k = parts.findIndex((p) => p[p.length - 1].end - p[0].t > maxLen && p.length > 3);
        if (k < 0) break;
        const p = parts[k], mid = p.length / 2;
        let cut = -1, best = Infinity;
        p.forEach((w, j) => j > 0 && j < p.length - 1 && /[,;:،]$/.test(w.w) && Math.abs(j + 1 - mid) < best && ((best = Math.abs(j + 1 - mid)), (cut = j + 1)));
        if (cut < 0) cut = Math.round(mid);
        parts.splice(k, 1, p.slice(0, cut), p.slice(cut));
      }
      chunks.push(...parts);
    }
  }
  // Merge tiny chunks into a neighbour when the result still fits.
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i], d = c[c.length - 1].end - c[0].t;
    if (d >= minLen || chunks.length === 1) continue;
    const nx = chunks[i + 1], pv = chunks[i - 1];
    if (nx && nx[nx.length - 1].end - c[0].t <= maxLen + 0.5) (chunks.splice(i, 2, [...c, ...nx]), i--);
    else if (pv && c[c.length - 1].end - pv[0].t <= maxLen + 0.5) (chunks.splice(i - 1, 2, [...pv, ...c]), (i -= 2));
  }
  return chunks.map((c, i) => {
    const text = c.map((w) => w.w).join(' ');
    const next = chunks[i + 1];
    return { id: `b${i}`, i, start: i === 0 ? Math.max(0, c[0].t - 0.15) : c[0].t - 0.15, end: next ? next[0].t - 0.15 : c[c.length - 1].end + 0.6, text, words: c, keys: keysOf(c), hints: hintsOf(text) };
  });
}

/** Group beats into sections of about `target` seconds, cutting at the longest pause near the target. */
export function makeSections(beats: Omit<DBeat, 'section' | 'layout'>[], target = 55): DSection[] {
  if (!beats.length) return [];
  const out: DSection[] = [];
  let s0 = 0;
  for (let i = 0; i < beats.length; i++) {
    const len = beats[i].end - beats[s0].start;
    const last = i === beats.length - 1;
    const pause = last ? 0 : beats[i + 1].words[0].t - beats[i].words[beats[i].words.length - 1].end;
    if (last || len >= target * 1.25 || (len >= target * 0.75 && (pause > 0.5 || /[.!?؟]$/.test(beats[i].text)))) {
      out.push({ i: out.length, start: beats[s0].start, end: beats[i].end, title: '', mood: 'explain' });
      s0 = i + 1;
    }
  }
  // A very short last section joins the previous one.
  if (out.length > 1 && out[out.length - 1].end - out[out.length - 1].start < target * 0.3) {
    const l = out.pop()!;
    out[out.length - 1].end = l.end;
  }
  out.forEach((s, i) => {
    s.mood = i === 0 ? 'hook' : i === out.length - 1 && out.length > 2 ? 'end' : i === out.length - 2 && out.length > 3 ? 'recap' : i % 2 ? 'explain' : 'story';
    const first = beats.find((b) => b.start >= s.start - 0.01);
    s.title = first ? (first.keys[0] ?? first.text.split(' ').slice(0, 3).join(' ')) : `Part ${i + 1}`;
  });
  return out;
}

/** Full analysis: beats with their section index. */
export function analyzeVoice(words: DWord[], target = 55) {
  const raw = makeBeats(words);
  const sections = makeSections(raw, target);
  const beats: DBeat[] = raw.map((b) => ({ ...b, section: Math.max(0, sections.findIndex((s) => b.start >= s.start - 0.01 && b.start < s.end - 0.01)), layout: '' }));
  return { beats, sections };
}
