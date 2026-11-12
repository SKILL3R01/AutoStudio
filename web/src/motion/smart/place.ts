/** Smart layers · free zones, transcript triggers and placement (pure: no browser needed). */
import type { MotionGroup, MotionItem, MotionPalette } from '../types';
import { fixLayout } from '../layout';
import { widgetBox } from '../widgets';
import { GX, GY, maxRects, type Face, type FootageAnalysis } from './footage';

export type Rect = { x: number; y: number; w: number; h: number };

/** Faces around time t (the sample nearest to it). */
export const facesAt = (an: FootageAnalysis, t: number): Face[] => an.faces[Math.max(0, Math.min(an.faces.length - 1, Math.round(t * an.fps)))] ?? [];
/** All faces seen during [t0, t1] (for layers that stay a while). */
export function facesDuring(an: FootageAnalysis, t0: number, t1: number): Face[] {
  const out: Face[] = [];
  for (let i = Math.max(0, Math.floor(t0 * an.fps)); i <= Math.min(an.faces.length - 1, Math.ceil(t1 * an.fps)); i++) out.push(...an.faces[i]);
  return out;
}

/** Areas to keep clear on gameplay: the HUD, the facecam and the centre of the action. */
export function gameBlocks(an: FootageAnalysis): Rect[] {
  return [...(an.hud ?? []), ...(an.cam ? [an.cam] : []), { x: 0.3, y: 0.25, w: 0.4, h: 0.5 }];
}

/**
 * The largest free rectangles (0..1) at time t, inside the safe area, never over a face (grown by 20 %).
 * Talking heads: calm areas only. Gameplay (`game`): the picture is busy everywhere, so free = not the HUD, the
 * facecam or the centre of the action.
 */
export function freeZones(an: FootageAnalysis, t: number, dur = 3, max = 4, game = false): Rect[] {
  const grid = an.busy[Math.min(an.busy.length - 1, Math.floor(t / an.win))] ?? new Array(GX * GY).fill(0);
  const free: boolean[][] = Array.from({ length: GY }, (_, y) => Array.from({ length: GX }, (_, x) => (game || grid[y * GX + x] < 0.42) && x > 0 && x < GX - 1 && y > 0 && y < GY - 1));
  const block = (r: Rect, gx = 0, gy = 0) => {
    for (let y = Math.max(0, Math.floor((r.y - gy) * GY)); y < Math.min(GY, Math.ceil((r.y + r.h + gy) * GY)); y++)
      for (let x = Math.max(0, Math.floor((r.x - gx) * GX)); x < Math.min(GX, Math.ceil((r.x + r.w + gx) * GX)); x++) free[y][x] = false;
  };
  for (const f of facesDuring(an, t, t + dur)) block({ x: f[0] - f[2] * 0.2, y: f[1] - f[3] * 0.2, w: f[2] * 1.4, h: f[3] * 1.55 });
  if (game) gameBlocks(an).forEach((r) => block(r, 0.01, 0.01));
  else (an.hud ?? []).forEach((r) => block(r));
  return maxRects(free, max, 4);
}

/** Who is speaking in [t0, t1] when two people are on screen: the face with the most mouth movement (left / right). */
export function speakerSide(an: FootageAnalysis, t0: number, t1: number): 'left' | 'right' | null {
  let l = 0, r = 0, two = 0;
  for (let i = Math.max(0, Math.floor(t0 * an.fps)); i <= Math.min(an.faces.length - 1, Math.ceil(t1 * an.fps)); i++) {
    const fs = an.faces[i];
    if (fs.length < 2) continue;
    two++;
    for (const f of fs) (f[0] + f[2] / 2 < 0.5 ? (l += f[4]) : (r += f[4]));
  }
  return two ? (l >= r ? 'left' : 'right') : null;
}

/* ---------- triggers from what is said ---------- */
export type SmartKind = 'name' | 'number' | 'list' | 'quote' | 'topic' | 'cta' | 'emoji' | 'alert' | 'counter' | 'facecam';
export interface Suggestion { id: string; kind: SmartKind; t: number; dur: number; title: string; sub?: string; value?: string; items?: string[]; icon?: string; on: boolean }
interface W { text: string; start: number; end: number }

const PRI: Record<SmartKind, number> = { name: 6, alert: 5.5, number: 5, counter: 4.5, cta: 4, quote: 3, list: 2, topic: 1, emoji: 0, facecam: -1 };
const HYPE = /\b(let'?s go+|no way|oh my god|omg|clutch|insane|what\?!|gg|victory|we won|boss|ace|let'?s gooo+)\b|يلا|مستحيل|فزنا/i;
const KILL = /\b(killed|kill|got (him|her|them|one)|eliminated|headshot|knocked|down one)\b|قتلت|قضيت/i;
const ROUND = /\b(level|round|stage|wave|chapter|act|map|boss fight)\s+(\d+|one|two|three|four|five|final)\b|المرحلة|الجولة/i;
export function sentencesOf(words: W[]) {
  const out: { text: string; start: number; end: number; ws: W[] }[] = [];
  let cur: W[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const nx = words[i + 1];
    if (!nx || /[.!?؟]["”»]?$/.test(w.text) || nx.start - w.end > 0.7) (out.push({ text: cur.map((x) => x.text).join(' '), start: cur[0].start, end: cur[cur.length - 1].end, ws: cur }), (cur = []));
  });
  return out;
}

export function suggestLayers(words: W[], chapters: { t: number; title: string }[] = [], opts: { game?: boolean; an?: FootageAnalysis; length?: number } = {}): Suggestion[] {
  const out: Suggestion[] = [];
  let n = 0, kills = 0;
  const add = (s: Omit<Suggestion, 'id' | 'on'>) => out.push({ ...s, id: `sg${n++}`, on: true });
  for (const s of sentencesOf(words)) {
    if (opts.game) {
      const hype = HYPE.exec(s.text), kill = KILL.exec(s.text), round = ROUND.exec(s.text);
      const at = (m: RegExpExecArray) => s.ws.find((w) => m[0].toLowerCase().startsWith(w.text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')))?.start ?? s.start;
      if (hype) add({ kind: 'alert', t: at(hype), dur: 1.8, title: `${hype[0].toUpperCase().replace(/[?!.]+$/, '')}!` });
      if (kill) add({ kind: 'counter', t: at(kill), dur: 2.2, title: 'ELIMINATIONS', value: `×${++kills}` });
      if (round) add({ kind: 'topic', t: s.start, dur: 3, title: round[0].toUpperCase(), sub: '' });
      if (round || kill) continue;
    }
    const name = /(?:I'm|I am|my name is|this is|welcome|joined by|with me is|here with)\s+([A-Z][\p{L}'-]+(?:\s[A-Z][\p{L}'-]+)?)/u.exec(s.text) ?? /(?:أنا|اسمي|معنا|ضيفنا)\s+([\p{L}]+(?:\s[\p{L}]+)?)/u.exec(s.text);
    if (name) add({ kind: 'name', t: s.start + 0.2, dur: 4, title: name[1], sub: '' });
    const num = /[$€£]?\s?\d[\d,.]*\s?(%|x|k|m|million|billion|percent)?/i.exec(s.text) ?? /\b(twice|double|half|one in (?:three|four|five|ten))\b/i.exec(s.text);
    if (num) add({ kind: 'number', t: s.start, dur: Math.min(4, Math.max(2.5, s.end - s.start)), title: s.text.replace(num[0], '').split(/\s+/).filter((w) => w.length > 3).slice(0, 3).join(' '), value: num[0].replace(/\s+/g, '').replace(/percent/i, '%') });
    const parts = s.text.split(/,|;|،/).map((x) => x.trim()).filter((x) => x.length > 2);
    if (parts.length >= 3) add({ kind: 'list', t: s.start, dur: Math.min(5, Math.max(3, s.end - s.start + 0.5)), title: '', items: parts.slice(0, 4).map((x) => x.replace(/^(and|or|و)\s+/i, '').split(/\s+/).slice(0, 4).join(' ')) });
    const ws = s.text.split(/\s+/).length;
    if (ws <= 16 && ws >= 4 && /(never|always|secret|truth|most important|the key|remember|the problem is|here's the thing|!|أبدا|دائما|السر|الحقيقة|المهم)/i.test(s.text)) add({ kind: 'quote', t: s.start, dur: Math.min(5, Math.max(3, s.end - s.start + 0.8)), title: s.text.replace(/["“”]/g, '') });
    if (/subscribe|link (below|in the description)|comment below|follow (me|us)|اشترك|الرابط في الوصف/i.test(s.text)) add({ kind: 'cta', t: s.start, dur: 3.5, title: /comment/i.test(s.text) ? 'Comment' : /link/i.test(s.text) ? 'Link below' : 'Subscribe', icon: /comment/i.test(s.text) ? 'message-circle' : /link/i.test(s.text) ? 'link' : 'bell' });
    const emo = /\b(haha|funny|laugh|love|amazing|wow|crazy|insane)\b|ضحك|رائع|مذهل/i.exec(s.text);
    if (emo) add({ kind: 'emoji', t: s.ws.find((w) => w.text.toLowerCase().includes(emo[0].toLowerCase()))?.start ?? s.start, dur: 1.6, title: '', icon: /love/i.test(emo[0]) ? 'heart' : /haha|funny|laugh|ضحك/i.test(emo[0]) ? 'laugh' : 'sparkles' });
  }
  chapters.filter((c) => c.t > 1).forEach((c, i) => add({ kind: 'topic', t: c.t, dur: 3, title: c.title, sub: `PART ${i + 2}` }));
  // One at a time: a lower-priority suggestion that overlaps a higher one is dropped.
  out.sort((a, b) => a.t - b.t);
  const kept: Suggestion[] = [];
  for (const s of out) {
    const clash = kept.find((k) => s.t < k.t + k.dur && k.t < s.t + s.dur);
    if (!clash) kept.push(s);
    else if (PRI[s.kind] > PRI[clash.kind]) kept.splice(kept.indexOf(clash), 1, s);
  }
  // Gameplay: a frame around the facecam for the whole video (it never clashes with the rest).
  if (opts.game && opts.an?.cam) kept.unshift({ id: `sg${n++}`, kind: 'facecam', t: 0, dur: Math.max(1, opts.length ?? opts.an.faces.length / opts.an.fps), title: 'LIVE', on: true });
  return kept;
}

/* ---------- placement ---------- */
/** The layers of one suggestion (recipe px around the frame centre). */
export function itemsFor(s: Suggestion, pal: MotionPalette): MotionItem[] {
  const base = { id: 'main', start: 0, dur: s.dur, in: 'saas-rise', out: 'fade-out' } as const;
  switch (s.kind) {
    case 'name': return [{ ...base, type: 'widget', widget: 'headline', title: s.title, sub: s.sub || '', size: 70, align: 'left', width: 700, in: 'slide-from-left' }];
    case 'number': return [{ ...base, type: 'widget', widget: 'stat', value: s.value ?? '', label: s.title, size: 160 }];
    case 'list': return [{ ...base, type: 'widget', widget: 'checklist', items: s.items ?? [], w: 640 }];
    case 'quote': return [{ ...base, type: 'widget', widget: 'quote', text: s.title, name: '', w: 820, h: 340, size: 40, palette: 'paper' }];
    case 'topic': return [{ ...base, type: 'widget', widget: 'tag', text: `${s.sub ? s.sub + ' · ' : ''}${s.title}`.toUpperCase() }];
    case 'cta': return [{ ...base, type: 'widget', widget: 'button', text: s.title, icon: s.icon, press: Math.min(1.6, s.dur * 0.5), color: pal.accents[0] }, { id: 'pulse', type: 'widget', widget: 'click-pulse', start: Math.min(1.6, s.dur * 0.5), dur: 1, at: [0] }];
    case 'emoji': return [{ ...base, type: 'widget', widget: 'plus-badge', text: '', icon: s.icon ?? 'heart', color: pal.accents[0], at: [0.1] }];
    case 'alert': return [{ id: 'burst', type: 'widget', widget: 'starburst', start: 0, dur: s.dur, size: 300, color: pal.accents[1] ?? pal.accents[0] }, { ...base, type: 'text', text: s.title, size: 96, weight: 900, font: 'Oswald', color: '#ffffff', stroke: { color: '#111111', width: 10 }, rotation: -6, in: 'stomp', out: 'pop-out' }];
    case 'counter': return [{ ...base, type: 'widget', widget: 'stat', value: s.value ?? '×1', label: s.title, size: 120, color: pal.accents[0], in: 'elastic-pop' }];
    case 'facecam': return [{ ...base, type: 'shape', shape: 'roundrect', w: 400, h: 300, color: pal.accents[0], fill: false, lineWidth: 10, radius: 24, glow: pal.accents[0], in: 'fade-in', out: undefined }, { id: 'tag', type: 'widget', widget: 'tag', text: s.title || 'LIVE', start: 0.3, dur: s.dur - 0.3, color: pal.accents[0] }];
  }
}

/** Which zone suits a kind: name → low and next to the speaker, quote → the biggest, topic → a top corner, number → beside the face… */
function score(kind: SmartKind, z: Rect, faces: Face[], side: 'left' | 'right' | null): number {
  const cx = z.x + z.w / 2, cy = z.y + z.h / 2, area = z.w * z.h;
  const f = faces[0], fx = f ? f[0] + f[2] / 2 : 0.5, fy = f ? f[1] + f[3] / 2 : 0.4;
  const near = 1 - Math.min(1, Math.hypot(cx - fx, cy - fy));
  switch (kind) {
    case 'name': return (cy > 0.55 ? 2 : 0) + near + (side ? ((side === 'left') === (cx < 0.5) ? 1 : -0.5) : 0) + area;
    case 'quote': return area * 4 + (1 - near) * 0.5;
    case 'topic': return (cy < 0.35 ? 2 : 0) + (Math.abs(cx - 0.5) > 0.2 ? 1 : 0) - area;
    case 'number': return near * 1.5 + area * 2 + (Math.abs(cy - fy) < 0.2 ? 1 : 0);
    case 'cta': return (cy > 0.6 ? 2 : 0) + area;
    case 'list': return area * 3 + near * 0.5;
    case 'emoji': return near * 3 - area;
    case 'alert': return (cy < 0.35 ? 2 : 0) + (Math.abs(cx - 0.5) < 0.3 ? 1 : 0) + area;
    case 'counter': return (cy < 0.35 ? 2 : 0) + (Math.abs(cx - 0.5) > 0.25 ? 1 : 0) - area;
    case 'facecam': return 0;
  }
}
const FALLBACK: Record<SmartKind, Rect> = { name: { x: 0.06, y: 0.72, w: 0.42, h: 0.18 }, number: { x: 0.6, y: 0.25, w: 0.34, h: 0.4 }, list: { x: 0.58, y: 0.2, w: 0.36, h: 0.55 }, quote: { x: 0.1, y: 0.62, w: 0.8, h: 0.28 }, topic: { x: 0.06, y: 0.06, w: 0.38, h: 0.12 }, cta: { x: 0.3, y: 0.78, w: 0.4, h: 0.14 }, emoji: { x: 0.65, y: 0.15, w: 0.18, h: 0.2 }, alert: { x: 0.3, y: 0.06, w: 0.4, h: 0.2 }, counter: { x: 0.75, y: 0.06, w: 0.2, h: 0.16 }, facecam: { x: 0.7, y: 0.65, w: 0.25, h: 0.3 } };

/** A Motion block (placement overlay) for a suggestion: in the best free zone, sized to it, never over a face. */
export function placeSuggestion(s: Suggestion, an: FootageAnalysis | undefined, frame: { w: number; h: number }, pal: MotionPalette, game = false): MotionGroup {
  const id = `smart_${s.id}_${Math.round(s.t * 10)}`, name = `${s.kind} · ${s.title || s.value || ''}`.slice(0, 40);
  const px = (r: Rect) => ({ x: (r.x + r.w / 2 - 0.5) * frame.w, y: (r.y + r.h / 2 - 0.5) * frame.h, w: r.w * frame.w, h: r.h * frame.h });
  if (s.kind === 'facecam') {
    // A glowing frame exactly around the detected facecam, with a small tag under it.
    const r = px(an?.cam ?? FALLBACK.facecam), [box, tag] = itemsFor(s, pal);
    const below = r.y + r.h / 2 + 40 < frame.h * 0.46;
    return { id, name, start: s.t, dur: s.dur, placement: 'overlay', frame, palette: { ...pal }, idea: 'smart', items: [{ ...box, x: r.x, y: r.y, w: r.w, h: r.h }, { ...tag, x: r.x, y: below ? r.y + r.h / 2 + 34 : r.y - r.h / 2 - 34 }] };
  }
  const faces = an ? facesDuring(an, s.t, s.t + s.dur) : [];
  const side = an && s.kind === 'name' ? speakerSide(an, s.t, s.t + s.dur) : null;
  const zones = an ? freeZones(an, s.t, s.dur, 4, game) : [];
  const z = [...zones].sort((a, b) => score(s.kind, b, faces, side) - score(s.kind, a, faces, side))[0] ?? FALLBACK[s.kind];
  let items = itemsFor(s, pal);
  const main = items[0];
  const box = main.type === 'widget' ? widgetBox(main) : { w: 400, h: 200 };
  const k = Math.max(0.45, Math.min(1.2, (z.w * frame.w * 0.92) / box.w, (z.h * frame.h * 0.92) / box.h));
  const cx = (z.x + z.w / 2 - 0.5) * frame.w, cy = (z.y + z.h / 2 - 0.5) * frame.h;
  items = items.map((it) => ({ ...it, x: cx, y: cy, scale: (it.scale ?? 1) * (it.id === 'main' ? k : 1) }));
  // Follow the speaker's face (lower-thirds) when it moves.
  if (an && s.kind === 'name' && faces.length) {
    const f0 = facesAt(an, s.t)[0];
    if (f0) {
      const keys = [];
      for (let t = 0; t <= s.dur; t += 0.5) {
        const f = facesAt(an, s.t + t)[0] ?? f0;
        keys.push({ t, x: cx + (f[0] - f0[0]) * frame.w * 0.8 });
      }
      if (keys.some((kk) => Math.abs(kk.x - cx) > 15)) items[0] = { ...items[0], keys };
    }
  }
  const avoid = [...faces.map((f) => ({ x: (f[0] + f[2] / 2 - 0.5) * frame.w, y: (f[1] + f[3] / 2 - 0.5) * frame.h, w: f[2] * frame.w * 1.15, h: f[3] * frame.h * 1.25 })), ...(an ? (game ? gameBlocks(an) : an.hud ?? []).map(px) : [])];
  const fixed = fixLayout(items, frame, avoid);
  return { id, name, start: s.t, dur: s.dur, placement: 'overlay', frame, palette: { ...pal }, items: fixed.items, idea: 'smart' };
}
