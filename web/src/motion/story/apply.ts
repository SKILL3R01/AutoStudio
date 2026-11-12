/** Apply an AI story answer: repair, match scene numbers and design ids, fill slots, rebuild those scenes. */
import type { Project } from '../../types';
import { repairJson, recipeToGroup } from '../recipe';
import { getKit } from '../styles';
import type { Slots } from '../styles/types';
import { buildStory, frameOf, sceneBlockId, type Scene } from './model';
import { fixLayout } from '../layout';
import { partsOf } from './prompt';

export interface ApplyResult {
  ok: boolean;
  error?: string;
  updated: number[];
  missing: number[];
  fixes: string[];
  truncated: boolean;
  /** The answer was a single free-form recipe (not a story answer). */
  recipe?: boolean;
}

const SLOT_KEYS: (keyof Slots)[] = ['title', 'key', 'value', 'label', 'sub', 'items', 'left', 'right', 'image', 'image2', 'icon', 'date'];
function cleanSlots(raw: unknown): Slots {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s: Slots = {};
  for (const k of SLOT_KEYS) {
    const v = o[k];
    if (v === undefined || v === null || v === '') continue;
    if (k === 'items' || k === 'left' || k === 'right') s[k] = (Array.isArray(v) ? v : String(v).split(/,|;/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 5);
    else (s as Record<string, string>)[k] = String(v).trim();
  }
  return s;
}

/** Closest design id of the style (exact → prefix → shared words → the scene's current one). */
export function closestTemplate(styleId: string, id: string, fallback: string): string {
  const ts = getKit(styleId).templates.map((t) => t.id);
  const n = id.toLowerCase().trim().replace(/[\s_]+/g, '-');
  return ts.find((t) => t === n) ?? ts.find((t) => t.startsWith(n) || n.startsWith(t)) ?? ts.find((t) => t.split('-').some((w) => n.split('-').includes(w))) ?? fallback;
}

/** Image slots may name a file: map it to the asset id (file name with or without extension). */
function assetRef(p: Project, ref?: string) {
  if (!ref) return undefined;
  const r = ref.toLowerCase();
  return p.assets.find((a) => a.id === ref || a.name.toLowerCase() === r || a.name.toLowerCase().replace(/\.[^.]+$/, '') === r)?.id ?? undefined;
}

/** `expect` = the scene numbers this answer should cover (1-based), for the "missing" report. */
export function applyStoryAnswer(p: Project, raw: string, expect: number[]): ApplyResult {
  const st = p.story;
  if (!st) return { ok: false, error: 'No story in this project', updated: [], missing: expect, fixes: [], truncated: false };
  const { text, report } = repairJson(raw);
  if (report.error) return { ok: false, error: report.error, updated: [], missing: expect, fixes: report.fixes, truncated: false };
  const o = JSON.parse(text) as Record<string, unknown>;
  if (!Array.isArray(o.scenes)) return { ok: false, recipe: Array.isArray(o.items), error: Array.isArray(o.items) ? 'This is a single-scene recipe — it goes into one scene (Surprise me / Paste a recipe), not here' : 'No "scenes" list in the answer', updated: [], missing: expect, fixes: report.fixes, truncated: false };
  const updated: number[] = [];
  for (const e of o.scenes as Record<string, unknown>[]) {
    const n = Math.round(Number(e?.n ?? e?.scene));
    const sc: Scene | undefined = st.scenes[n - 1];
    if (!sc || sc.locked) continue;
    sc.templateId = closestTemplate(st.styleId, String(e.template ?? e.design ?? ''), sc.templateId);
    const slots = cleanSlots(e.slots ?? e);
    if (slots.image) slots.image = assetRef(p, slots.image);
    if (slots.image2) slots.image2 = assetRef(p, slots.image2);
    sc.slots = slots;
    sc.source = 'ai';
    updated.push(n);
  }
  const fixes = buildStory(p, updated.map((n) => st.scenes[n - 1].id));
  const missing = expect.filter((n) => !updated.includes(n) && !st.scenes[n - 1]?.locked);
  return { ok: updated.length > 0, error: updated.length ? undefined : 'The answer had no scene numbers I recognise', updated, missing, fixes: [...report.fixes, ...fixes], truncated: report.truncated || missing.length > 0 };
}

/** A free-form recipe ("Surprise me") for ONE scene: replaces that scene's layers (times from the scene start). */
export function applySceneRecipe(p: Project, sceneId: string, raw: string): { ok: boolean; error?: string; fixes: string[] } {
  const st = p.story, sc = st?.scenes.find((s) => s.id === sceneId);
  const g = p.motion?.find((x) => sc && x.id === sceneBlockId(sc));
  if (!st || !sc || !g) return { ok: false, error: 'Scene not found', fixes: [] };
  const r = recipeToGroup(raw, sc.start, 'full', '', frameOf(p));
  if (!r.group) return { ok: false, error: r.report.error, fixes: [] };
  const len = sc.end - sc.start;
  let items = r.group.items;
  const min = Math.min(...items.map((x) => x.start));
  if (min > len * 0.6 && min >= sc.start - 1) items = items.map((x) => ({ ...x, start: x.start - sc.start }));
  items = items.filter((x) => x.start < len).map((x) => (x.start + x.dur > len ? { ...x, dur: len - x.start } : x));
  const fixed = fixLayout(items, g.frame);
  g.items = fixed.items;
  g.palette = { ...g.palette, ...r.group.palette };
  g.idea = 'story:custom';
  sc.source = 'custom';
  return { ok: true, fixes: [...r.report.fixes, ...fixed.fixes] };
}

/** Scene numbers (1-based) of a part. */
export const partNumbers = (p: Project, part: number) => {
  const pt = p.story ? partsOf(p.story)[part] : undefined;
  return pt ? Array.from({ length: pt.to - pt.from }, (_, k) => pt.from + k + 1) : [];
};
