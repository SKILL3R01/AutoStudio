/** Recipe import: repair what chat apps do to JSON, validate, map names, and turn it into a Motion group. */
import type { MotionGroup, MotionItem, MotionPalette, MotionPlacement } from './types';

export const PALETTES: Record<string, MotionPalette> = {
  dark: { bg: '#0f1117', card: '#1b1f2a', text: '#f5f6fa', muted: '#9aa3b2', accents: ['#7c6cff', '#21c8e8', '#ffd23f'], font: 'Montserrat' },
  brand: { bg: '#141018', card: '#221a2a', text: '#fff5e8', muted: '#b9a99a', accents: ['#e0a458', '#f26b3a', '#2fa3a0'], font: 'Montserrat' },
  paper: { bg: '#f4efe6', card: '#ffffff', text: '#1f1e1d', muted: '#6d665c', accents: ['#e5484d', '#ffd23f', '#2f6fde'], font: 'Oswald' },
  flat: { bg: '#6c4cf1', card: '#ffffff', text: '#ffffff', muted: '#d9d2ff', accents: ['#ffd23f', '#19c39c', '#ff6b35'], font: 'Poppins' },
  whiteboard: { bg: '#fbfbf8', card: '#ffffff', text: '#1d1d1f', muted: '#7a7a7a', accents: ['#2f6fde', '#e5484d', '#19a35b'], font: 'Poppins' },
  hud: { bg: '#05121a', card: '#0b2430', text: '#d8f6ff', muted: '#6fa7b8', accents: ['#21c8e8', '#7dfcff', '#ffb020'], font: 'Oswald' },
  neon: { bg: '#0a0614', card: '#170e2a', text: '#ffffff', muted: '#a99ccf', accents: ['#ff2bd6', '#21e8ff', '#c6ff3d'], font: 'Bebas Neue' },
  ocean: { bg: '#062033', card: '#0c3350', text: '#eaf7ff', muted: '#8fb6cc', accents: ['#2fd3c5', '#4ea8ff', '#ffd27a'], font: 'Montserrat' },
  mint: { bg: '#eafaf4', card: '#ffffff', text: '#123a2e', muted: '#5b8576', accents: ['#19c39c', '#2f6fde', '#ffb020'], font: 'Poppins' },
  sunset: { bg: '#2a0f22', card: '#3d1730', text: '#fff1e6', muted: '#d0a7a7', accents: ['#ff7a45', '#ffb020', '#ff3b7a'], font: 'Montserrat' },
};

export interface RepairReport { fixes: string[]; truncated: boolean; error?: string }

/**
 * Make a chat answer parseable: drop text / fences around the object, straighten curly quotes, remove line breaks
 * inside strings (they break colour codes like "\n#1d1a22"), trailing commas and comments, and close a cut-off answer.
 */
export function repairJson(raw: string): { text: string; report: RepairReport } {
  const fixes: string[] = [];
  let s = raw.replace(/^\uFEFF/, '');
  const a = s.indexOf('{');
  if (a < 0) return { text: s, report: { fixes, truncated: false, error: 'No JSON object found — paste the AI answer that starts with {' } };
  if (a > 0 || /```/.test(s)) fixes.push('removed text around the JSON');
  s = s.slice(a).replace(/```[a-z]*\s*$/i, '');
  if (/[“”„‟″]/.test(s)) (fixes.push('straightened curly double quotes'), (s = s.replace(/[“”„‟″]/g, '"')));
  if (/[‘’‛′]/.test(s)) (fixes.push('straightened curly single quotes'), (s = s.replace(/[‘’‛′]/g, "'")));
  // Walk the text: remove raw line breaks / tabs inside strings and comments outside strings.
  let out = '', inStr = false, esc = false, nl = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) (esc = false), (out += c);
      else if (c === '\\') (esc = true), (out += c);
      else if (c === '"') (inStr = false), (out += c);
      else if (c === '\n' || c === '\r' || c === '\t') nl++;
      else out += c;
    } else if (c === '"') (inStr = true), (out += c);
    else if (c === '/' && s[i + 1] === '/') while (i < s.length && s[i] !== '\n') i++;
    else if (c === '/' && s[i + 1] === '*') (i = s.indexOf('*/', i + 2)), (i = i < 0 ? s.length : i + 1);
    else out += c;
  }
  if (nl) fixes.push(`removed ${nl} line break${nl > 1 ? 's' : ''} inside text values`);
  s = out.replace(/"\s+(#[0-9a-fA-F]{3,8})"/g, '"$1"');
  const tc = s.replace(/,\s*([}\]])/g, '$1');
  if (tc !== s) (fixes.push('removed trailing commas'), (s = tc));
  // Cut off at the end (answer too long)? Close it after the last complete item.
  let truncated = false;
  try {
    JSON.parse(s);
  } catch {
    const fixed = closeTruncated(s);
    if (fixed) (truncated = true), (s = fixed), fixes.push('the answer was cut off — kept the complete items');
  }
  try {
    JSON.parse(s);
    return { text: s, report: { fixes, truncated } };
  } catch (e) {
    return { text: s, report: { fixes, truncated, error: `Still not valid JSON: ${(e as Error).message}` } };
  }
}

/** Close a cut-off recipe after its last complete item in "items". */
function closeTruncated(s: string): string | null {
  const i = s.indexOf('"items"');
  if (i < 0) return null;
  let depth = 0, inStr = false, esc = false, lastEnd = -1;
  const open = s.indexOf('[', i);
  for (let k = open + 1; k < s.length; k++) {
    const c = s[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0 && c === '}') lastEnd = k;
      if (depth < 0) return null;
    }
  }
  return lastEnd > 0 ? s.slice(0, lastEnd + 1) + ']}' : null;
}

const TYPES = new Set(['background', 'text', 'shape', 'svg', 'icon', 'widget', 'camera', 'light', 'placeholder', 'asset', 'scene', 'vector', '3d', 'graphic', 'marker']);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : d);

export interface ValidateResult { items: MotionItem[]; palette: MotionPalette; warnings: string[]; dur: number }

/** Check and normalise a parsed recipe: types, times, numbers, palette. */
export function validateRecipe(r: unknown): ValidateResult {
  const warnings: string[] = [];
  const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
  const list = Array.isArray(o.items) ? o.items : Array.isArray(r) ? (r as unknown[]) : [];
  if (!list.length) warnings.push('The recipe has no items');
  const pal = typeof o.palette === 'string' ? PALETTES[o.palette] ?? (warnings.push(`Unknown palette "${o.palette}" — using dark`), PALETTES.dark)
    : o.palette && typeof o.palette === 'object' ? { ...PALETTES.dark, ...(o.palette as Partial<MotionPalette>) } : PALETTES.dark;
  const items: MotionItem[] = [];
  list.forEach((x, k) => {
    if (!x || typeof x !== 'object') return;
    const it = { ...(x as Record<string, unknown>) } as MotionItem;
    if (!TYPES.has(String(it.type))) return void warnings.push(`Item ${k + 1}: unknown type "${it.type}" skipped`);
    if (it.type === 'widget' && typeof it.id === 'string' && !it.widget) it.widget = it.id;
    if (it.type === 'light' && typeof it.id === 'string' && !it.light) it.light = it.id;
    it.id = `m${k}`;
    it.start = Math.max(0, num(it.start, 0));
    it.dur = Math.max(0.05, num(it.dur, it.type === 'camera' ? 3 : 2));
    for (const f of ['x', 'y', 'w', 'h', 'size', 'scale', 'rotation', 'opacity'] as const) if (f in it) it[f] = num(it[f], f === 'scale' || f === 'opacity' ? 1 : 0);
    items.push(it);
  });
  const dur = Math.max(0.5, ...items.map((i) => i.start + i.dur));
  return { items, palette: pal, warnings, dur };
}

/** Parse + repair + validate pasted text into a group placed at `at`. */
export function recipeToGroup(raw: string, at: number, placement: MotionPlacement, idea = '', frameSize?: { w: number; h: number }): { group?: MotionGroup; report: RepairReport; warnings: string[] } {
  const { text, report } = repairJson(raw);
  if (report.error) return { report, warnings: [] };
  const v = validateRecipe(JSON.parse(text));
  const frame = frameSize ?? (placement === 'band' ? { w: 1920, h: 540 } : { w: 1920, h: 1080 });
  return {
    report, warnings: v.warnings,
    group: { id: 'mg_' + Math.random().toString(36).slice(2, 9), name: idea.slice(0, 40) || 'Motion', start: at, dur: v.dur, placement, band: placement === 'band' ? { side: 'top', h: 0.5 } : undefined, frame, palette: v.palette, items: v.items, idea },
  };
}
