/** v5 Story: scenes (one idea each) from a voiceover or a script, a designed template per scene, one Motion block per scene. */
import type { Project } from '../../types';
import type { MotionGroup, MotionItem } from '../types';
import { makeBeats, hintsOf, keysOf, type BeatHint, type DWord } from '../director/analyze';
import { getKit, variantOf } from '../styles';
import type { SceneCtx, SceneTemplate, Slots, StyleKit } from '../styles/types';
import { fixLayout } from '../layout';

export interface Scene {
  id: string;
  start: number;
  end: number;
  text: string;
  words: DWord[];
  hints: BeatHint[];
  keys: string[];
  templateId: string;
  slots: Slots;
  note?: string;
  locked?: boolean;
  source: 'template' | 'ai' | 'custom';
}
export interface StoryState {
  styleId: string;
  variantId: string;
  script: string;
  scenes: Scene[];
  /** Scenes timed by the narration words, or estimated from the script (until a voice arrives). */
  timing: 'voice' | 'script';
  createdAt: number;
}

export const sceneBlockId = (s: Scene) => `scene_${s.id}`;
export const frameOf = (p: Pick<Project, 'export'>) => (p.export.aspect === '9:16' ? { w: 1080, h: 1920 } : p.export.aspect === '1:1' ? { w: 1080, h: 1080 } : p.export.aspect === '4:5' ? { w: 1080, h: 1350 } : { w: 1920, h: 1080 });

/** Words with estimated timings for a script without a voice (≈ 2.6 words / s, short pauses at sentence ends). */
export function wordsFromScript(script: string, wps = 2.6): DWord[] {
  const out: DWord[] = [];
  let t = 0.3;
  for (const w of script.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)) {
    const d = Math.max(0.18, (1 / wps) * Math.min(2, Math.max(0.6, w.length / 5)));
    out.push({ w, t, end: t + d * 0.9 });
    t += d + (/[.!?؟…]$/.test(w) ? 0.35 : /[,;:،]$/.test(w) ? 0.12 : 0);
  }
  return out;
}

export function scenesFromWords(words: DWord[]): Scene[] {
  return makeBeats(words).map((b, i) => ({ id: `s${i}_${Math.round(b.start * 10)}`, start: b.start, end: b.end, text: b.text, words: b.words, hints: b.hints, keys: b.keys, templateId: '', slots: {}, source: 'template' as const }));
}

/* ---------- slots from the scene's own words ---------- */
const STOPW = /^(the|a|an|and|or|but|of|to|in|on|at|for|with|is|are|was|were|it|this|that|so|then|just)$/i;
export function phrase(text: string, key?: string, max = 6): string {
  const ws = text.replace(/["“”«»]/g, '').split(/\s+/).filter(Boolean);
  if (ws.length <= max) return ws.join(' ').replace(/[,;:]+$/, '');
  const k = key ? Math.max(0, ws.findIndex((w) => w.toLowerCase().includes(key.toLowerCase()))) : 0;
  let a = Math.max(0, Math.min(ws.length - max, k - Math.floor(max / 2)));
  while (a < k && STOPW.test(ws[a]) && a + max < ws.length) a++;
  return ws.slice(a, a + max).join(' ').replace(/^[,;:.]+|[,;:]+$/g, '');
}
export const numberIn = (t: string) => /[$€£]?\s?\d[\d,.]*\s?(%|x|×|k|m|bn|million|billion)?/i.exec(t)?.[0].replace(/\s+/g, '') ?? '';
export const listIn = (t: string) => t.split(/,|;|\band\b|،| و /).map((s) => s.trim().replace(/^(first|second|third|finally|then)\s+/i, '').replace(/[.!?]+$/, '')).filter((s) => s.length > 1).slice(0, 4).map((s) => s.split(/\s+/).slice(0, 4).join(' '));
const yearIn = (t: string) => /\b(1[5-9]\d\d|20\d\d)\b/.exec(t)?.[0] ?? '';

/** Fill a template's slots from the scene text (the AI can override any of them). */
export function autoSlots(sc: Scene, tpl: SceneTemplate): Slots {
  const key = sc.keys.find((k) => !/\d/.test(k)) ?? sc.keys[0] ?? '';
  const s: Slots = { title: phrase(sc.text, key), key };
  const v = numberIn(sc.text);
  if (v) s.value = v;
  const rest = phrase(sc.text.replace(v, ''), key, 4);
  if (tpl.slots.includes('label')) s.label = rest;
  const li = listIn(sc.text);
  if (tpl.slots.includes('items')) s.items = li.length > 1 ? li : sc.keys.length > 1 ? sc.keys : [s.title!];
  if (tpl.slots.includes('left') || tpl.slots.includes('right')) {
    const [L, ...R] = sc.text.split(/\b(?:vs\.?|versus|instead of|rather than|compared to|but)\b|بدلا من|مقابل|لكن/i);
    s.left = listIn(L ?? '').length ? listIn(L ?? '') : [phrase(L ?? sc.text, undefined, 4)];
    s.right = listIn(R.join(' ')).length ? listIn(R.join(' ')) : [phrase(R.join(' ') || sc.text, undefined, 4)];
  }
  if (tpl.slots.includes('date')) s.date = yearIn(sc.text) || key.toUpperCase();
  if (tpl.slots.includes('icon')) s.icon = key.toLowerCase();
  return { ...s, ...sc.slots };
}

/* ---------- template choice with variety ---------- */
export function pickTemplates(scenes: Scene[], kit: StyleKit, force = false) {
  if (!kit.templates.length) return;
  const recent: string[] = [];
  const general = kit.templates.filter((t) => t.fits.includes('plain') || t.fits.includes('picture'));
  let rot = 0;
  scenes.forEach((sc, i) => {
    if (sc.locked || (!force && sc.templateId && kit.templates.some((t) => t.id === sc.templateId) && sc.source !== 'template')) return void recent.push(sc.templateId);
    const want: string[] = [...sc.hints, ...(i === 0 ? ['intro'] : []), ...(i === scenes.length - 1 && scenes.length > 2 ? ['outro'] : [])];
    const fit = kit.templates.filter((t) => t.fits.some((f) => want.includes(f)) && !t.fits.includes('chapter'));
    const pool = [...fit, ...general.slice(rot % general.length), ...general];
    const pick = pool.find((t) => !recent.slice(-3).includes(t.id)) ?? general[rot % general.length] ?? kit.templates[0];
    rot++;
    sc.templateId = pick.id;
    recent.push(pick.id);
  });
}

/* ---------- building ---------- */
export function sceneCtx(p: Project, st: StoryState, sc: Scene, i: number): SceneCtx {
  const kit = getKit(st.styleId), pal = variantOf(kit, st.variantId).palette;
  const key = sc.slots.key ?? sc.keys[0];
  const kw = key ? sc.words.find((w) => w.w.toLowerCase().includes(key.toLowerCase())) : undefined;
  return { dur: Math.max(0.6, sc.end - sc.start), frame: frameOf(p), pal, font: pal.font ?? kit.font, k: i, keyAt: kw ? Math.max(0.2, kw.t - sc.start) : 0.6, last: i === st.scenes.length - 1, images: (p.assets ?? []).filter((a) => a.kind === 'image').map((a) => a.id) };
}

export function buildSceneItems(p: Project, st: StoryState, sc: Scene, i: number): { items: MotionItem[]; fixes: string[] } {
  const kit = getKit(st.styleId), ctx = sceneCtx(p, st, sc, i);
  const tpl = kit.templates.find((t) => t.id === sc.templateId) ?? kit.templates[0];
  const own = tpl ? tpl.build(autoSlots(sc, tpl), ctx) : [];
  const { items, fixes } = fixLayout(own, ctx.frame);
  return { items: kit.frameScene(items, ctx), fixes };
}

export function sceneBlock(p: Project, st: StoryState, sc: Scene, i: number, items: MotionItem[]): MotionGroup {
  const kit = getKit(st.styleId);
  return { id: sceneBlockId(sc), name: `${i + 1}. ${sc.slots.title ?? phrase(sc.text, sc.keys[0], 4)}`, start: sc.start, dur: Math.max(0.6, sc.end - sc.start), placement: 'full', frame: frameOf(p), palette: { ...variantOf(kit, st.variantId).palette }, items, idea: `story:${sc.source}` };
}

/** (Re)build scene blocks. Custom scenes (free-form "Surprise me" recipes) keep their own layers unless forced. */
export function buildStory(p: Project, only?: string[], force = false): string[] {
  const st = p.story;
  if (!st) return [];
  const fixes: string[] = [];
  const keep = new Map((p.motion ?? []).map((g) => [g.id, g]));
  const blocks: MotionGroup[] = [];
  st.scenes.forEach((sc, i) => {
    const old = keep.get(sceneBlockId(sc));
    if ((only && !only.includes(sc.id)) || (sc.source === 'custom' && old && !force)) {
      if (old) blocks.push({ ...old, start: sc.start, dur: Math.max(0.6, sc.end - sc.start) });
      return;
    }
    const b = buildSceneItems(p, st, sc, i);
    fixes.push(...b.fixes.map((f) => `Scene ${i + 1}: ${f}`));
    blocks.push(sceneBlock(p, st, sc, i, b.items));
  });
  // Old scene blocks and v4.2 Director section blocks are replaced by the scene blocks.
  p.motion = [...(p.motion ?? []).filter((g) => !g.id.startsWith('scene_') && !g.id.startsWith('dir_s')), ...blocks].sort((a, b) => a.start - b.start);
  return fixes;
}

/** Start a story from the narration (or the script) in a style. */
export function newStory(p: Project, styleId: string, variantId: string, script = ''): StoryState {
  const words: DWord[] = (p.words?.length ? p.words : p.lines.flatMap((l) => l.words)).map((w) => ({ w: w.text, t: w.start, end: w.end }));
  // A script given → scenes follow the script (timed by reading speed until its voice is made); none → the narration.
  const timing: StoryState['timing'] = !script.trim() && words.length >= 5 ? 'voice' : 'script';
  const scenes = scenesFromWords(timing === 'voice' ? words : wordsFromScript(script));
  const st: StoryState = { styleId, variantId, script: script || words.map((w) => w.w).join(' '), scenes, timing, createdAt: Date.now() };
  pickTemplates(scenes, getKit(styleId), true);
  return st;
}

/** A voice arrived for a script-timed story: move every scene onto the spoken words (matched in order). */
export function retimeScenes(st: StoryState, words: DWord[]) {
  if (!words.length) return;
  const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  let wi = 0;
  st.scenes.forEach((sc, i) => {
    const toks = sc.text.split(/\s+/).map(norm).filter(Boolean);
    const first = toks[0];
    let a = wi;
    for (let k = wi; k < Math.min(words.length, wi + 40); k++) if (norm(words[k].w) === first) {
      a = k;
      break;
    }
    const b = Math.min(words.length - 1, a + Math.max(0, toks.length - 1));
    const next = st.scenes[i + 1];
    sc.start = i === 0 ? Math.max(0, words[a].t - 0.15) : words[a].t - 0.15;
    sc.words = words.slice(a, b + 1);
    wi = b + 1;
    sc.end = next && wi < words.length ? words[wi].t - 0.15 : words[b].end + 0.6;
  });
  for (let i = 1; i < st.scenes.length; i++) st.scenes[i].start = st.scenes[i - 1].end;
  st.timing = 'voice';
}

/** Split a scene at the middle word / merge it with the next one. */
export function splitScene(st: StoryState, id: string) {
  const i = st.scenes.findIndex((s) => s.id === id), sc = st.scenes[i];
  if (!sc || sc.words.length < 4) return false;
  const m = Math.floor(sc.words.length / 2), a = sc.words.slice(0, m), b = sc.words.slice(m);
  const mk = (ws: DWord[], start: number, end: number, n: string): Scene => ({ ...sc, id: `${sc.id}${n}`, start, end, words: ws, text: ws.map((w) => w.w).join(' '), hints: hintsOf(ws.map((w) => w.w).join(' ')), keys: keysOf(ws), slots: {}, source: 'template', templateId: '' });
  st.scenes.splice(i, 1, mk(a, sc.start, b[0].t - 0.15, 'a'), mk(b, b[0].t - 0.15, sc.end, 'b'));
  return true;
}
export function mergeScene(st: StoryState, id: string) {
  const i = st.scenes.findIndex((s) => s.id === id), a = st.scenes[i], b = st.scenes[i + 1];
  if (!a || !b) return false;
  const words = [...a.words, ...b.words], text = `${a.text} ${b.text}`;
  st.scenes.splice(i, 2, { ...a, end: b.end, words, text, hints: hintsOf(text), keys: keysOf(words), slots: {}, source: 'template', templateId: '' });
  return true;
}

/** v4.2 Director projects → story (beats become scenes; old section blocks stay until rebuilt). */
export function storyFromDirector(d: NonNullable<Project['director']>): StoryState {
  const styleId = d.style === 'pack:paper-explainer' ? 'documentary' : 'explainer';
  return {
    styleId, variantId: styleId === 'explainer' && /^[a-z]+$/.test(d.style) ? d.style : '', script: d.beats.map((b) => b.text).join(' '), timing: 'voice', createdAt: d.createdAt,
    scenes: d.beats.map((b) => ({ id: `s${b.i}_${Math.round(b.start * 10)}`, start: b.start, end: b.end, text: b.text, words: b.words, hints: b.hints, keys: b.keys, templateId: '', slots: {}, note: b.note, locked: b.locked, source: 'template' as const })),
  };
}
