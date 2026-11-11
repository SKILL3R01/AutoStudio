/** Pure Motion edits: stretch a block in time, split it at a time, find / remove layers. */
import type { Project } from '../types';
import type { MotionGroup, MotionItem } from './types';

const uid = () => Math.random().toString(36).slice(2, 9);

/** Change a block's length, scaling every layer's timing (and its keys) to match. */
export function stretchGroup(g: MotionGroup, dur: number) {
  const k = Math.max(0.2, dur) / g.dur;
  if (!Number.isFinite(k) || Math.abs(k - 1) < 1e-6) return;
  for (const it of g.items) {
    it.start *= k;
    it.dur *= k;
    if (it.keys) for (const key of it.keys) key.t *= k;
    if (typeof it.revealAt === 'number') it.revealAt *= k;
  }
  g.dur = Math.max(0.2, dur);
}

/** Split a block at project time t into two blocks; layers crossing the cut are cut too. Returns the new block id. */
export function splitGroup(p: Project, id: string, t: number): string | null {
  const i = (p.motion ?? []).findIndex((g) => g.id === id);
  if (i < 0) return null;
  const g = p.motion![i];
  const lt = t - g.start;
  if (lt < 0.1 || lt > g.dur - 0.1) return null;
  const left: MotionItem[] = [], right: MotionItem[] = [];
  for (const it of g.items) {
    if (it.start + it.dur <= lt) left.push(it);
    else if (it.start >= lt) right.push({ ...it, start: it.start - lt });
    else {
      left.push({ ...it, dur: lt - it.start, out: undefined });
      // The right half continues from where the layer was (no second entrance); keys shift with it.
      right.push({ ...it, id: it.id + '_' + uid(), start: 0, dur: it.start + it.dur - lt, in: undefined, keys: it.keys?.map((k) => ({ ...k, t: k.t - (lt - it.start) })) });
    }
  }
  const b: MotionGroup = { ...structuredClone(g), id: 'mg_' + uid(), name: g.name + ' (2)', start: t, dur: g.dur - lt, items: right };
  g.items = left;
  g.dur = lt;
  p.motion!.splice(i + 1, 0, b);
  return b.id;
}

/** "groupId" or "groupId/itemId" → the block and (optionally) the layer. */
export function motionRef(p: Project, ref: string): { g?: MotionGroup; it?: MotionItem } {
  const [gid, iid] = ref.split('/');
  const g = p.motion?.find((x) => x.id === gid);
  return { g, it: iid ? g?.items.find((x) => x.id === iid) : undefined };
}

/** Delete a block or one of its layers. */
export function removeMotion(p: Project, ref: string) {
  const [gid, iid] = ref.split('/');
  if (!iid) p.motion = (p.motion ?? []).filter((g) => g.id !== gid);
  else {
    const g = p.motion?.find((x) => x.id === gid);
    if (g) g.items = g.items.filter((x) => x.id !== iid);
  }
}

/** Short human label for a layer. */
export function layerLabel(it: MotionItem): string {
  const txt = it.text ?? it.title ?? it.label ?? it.name ?? it.value;
  const kind = it.type === 'widget' ? String(it.widget ?? 'widget') : it.type === 'background' ? `background · ${it.kind ?? 'flat'}` : it.type === 'shape' ? `shape · ${it.shape ?? 'rect'}` : it.type === 'light' ? `light · ${it.light ?? ''}` : it.type;
  return txt ? `${kind} · ${String(txt).slice(0, 28)}` : kind;
}
