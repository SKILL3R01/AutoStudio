import type { FlowScene } from '../types';
import { detectTime, type TimeGuess } from '../lib/timecode';
import { kindOf } from '../lib/project';
import { uid } from '../lib/util';

export interface ReviewItem {
  id: string;
  file: File | Blob;
  name: string;
  kind: 'image' | 'video' | 'audio';
  /** For sound files: where the file goes in the project. */
  audioRole?: AudioRole;
  guess: TimeGuess;
  time: number | null;
  /** True once the time was confirmed by the user or a bulk action (ambiguous guesses need this). */
  confirmed: boolean;
  include: boolean;
  selected: boolean;
  url: string;
}

export type AudioRole = 'voiceover' | 'music' | 'sfx';

export type ReviewStatus = 'ok' | 'check' | 'missing' | 'duplicate' | 'beyond' | 'excluded';

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  ok: 'OK', check: 'Check', missing: 'No time', duplicate: 'Duplicate', beyond: 'After end', excluded: 'Skipped',
};

const byName = (a: ReviewItem, b: ReviewItem) => a.name.localeCompare(b.name, undefined, { numeric: true });

/**
 * Turn dropped files into review rows. Sound files become audio rows: the first one is the voiceover when the
 * project has none, the rest music; they start at their filename time or 0 and never block the build.
 */
export function toReviewItems(files: File[], hasVoiceover = false): ReviewItem[] {
  let voiceTaken = hasVoiceover;
  return files
    .filter((f) => kindOf(f) !== null)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((f) => {
      const guess = detectTime(f.name);
      const kind = kindOf(f) as 'image' | 'video' | 'audio';
      const base = { id: uid(), file: f, name: f.name, kind, guess, include: true, selected: false, url: URL.createObjectURL(f) };
      if (kind === 'audio') {
        const audioRole: AudioRole = voiceTaken ? 'music' : 'voiceover';
        voiceTaken = true;
        return { ...base, audioRole, time: guess.kind === 'timestamp' ? guess.time : 0, confirmed: true };
      }
      return { ...base, time: guess.kind === 'timestamp' || guess.kind === 'number' ? guess.time : null, confirmed: guess.kind === 'timestamp' };
    });
}

const visual = (i: ReviewItem) => i.kind !== 'audio';

export function statuses(items: ReviewItem[], length: number | null): Map<string, ReviewStatus> {
  const out = new Map<string, ReviewStatus>();
  const seen = new Map<string, number>();
  for (const it of items) if (it.include && it.time !== null && visual(it)) seen.set(it.time.toFixed(2), (seen.get(it.time.toFixed(2)) ?? 0) + 1);
  for (const it of items) {
    let s: ReviewStatus = 'ok';
    if (!it.include) s = 'excluded';
    else if (!visual(it)) s = 'ok';
    else if (it.time === null) s = 'missing';
    else if ((seen.get(it.time.toFixed(2)) ?? 0) > 1) s = 'duplicate';
    else if (length && it.time >= length) s = 'beyond';
    else if (!it.confirmed) s = 'check';
    out.set(it.id, s);
  }
  return out;
}

/** Items a bulk action applies to: the selected rows, or every included row when nothing is selected. */
const targets = (items: ReviewItem[]) => {
  const sel = items.filter((i) => i.selected && i.include && visual(i));
  return (sel.length ? sel : items.filter((i) => i.include && visual(i))).sort(byName);
};

const apply = (items: ReviewItem[], times: Map<string, number | null>) =>
  items.map((i) => (times.has(i.id) ? { ...i, time: times.get(i.id)!, confirmed: true } : i));

/** Rename a row: the time is re-detected from the new name (and used as the clip's asset name). */
export function renameItem(i: ReviewItem, name: string): ReviewItem {
  const guess = detectTime(name);
  const time = guess.kind === 'timestamp' || guess.kind === 'number' ? guess.time : guess.kind === 'sequence' ? i.time : null;
  return { ...i, name, guess, time, confirmed: guess.kind === 'timestamp' };
}

export const ops = {
  spread(items: ReviewItem[], length: number) {
    const t = targets(items);
    return apply(items, new Map(t.map((it, k) => [it.id, (k * length) / t.length])));
  },
  sequential(items: ReviewItem[], step: number, from = 0) {
    return apply(items, new Map(targets(items).map((it, k) => [it.id, from + k * step])));
  },
  shift(items: ReviewItem[], delta: number) {
    return apply(items, new Map(targets(items).filter((i) => i.time !== null).map((it) => [it.id, Math.max(0, it.time! + delta)])));
  },
  /** Place rows without a time between their named neighbours (e.g. `image (16)` between 15 and 17). */
  fillMissing(items: ReviewItem[], length: number) {
    const list = items.filter((i) => i.include && visual(i)).sort(byName);
    const times = new Map<string, number>();
    let k = 0;
    while (k < list.length) {
      if (list[k].time !== null) {
        k++;
        continue;
      }
      let e = k;
      while (e < list.length && list[e].time === null) e++;
      const a = k > 0 ? list[k - 1].time! : 0;
      const b = e < list.length ? list[e].time! : Math.max(length, a + (e - k + 1) * 3);
      for (let j = k; j < e; j++) times.set(list[j].id, a + ((j - k + (k > 0 ? 1 : 0)) * (b - a)) / (e - k + (k > 0 ? 1 : 0)));
      k = e;
    }
    return apply(items, times);
  },
  confirmNumbersAsSeconds(items: ReviewItem[]) {
    return items.map((i) => (i.guess.kind === 'number' && i.include ? { ...i, time: i.guess.time, confirmed: true } : i));
  },
  /** Map Flow `NNN_vK` files to the scene timestamps saved when the prompts were exported. */
  mapFlow(items: ReviewItem[], scenes: FlowScene[]) {
    const bySeq = new Map(scenes.map((s) => [s.seq, s.start]));
    return items.map((i) => (i.guess.seq !== undefined && bySeq.has(i.guess.seq) ? { ...i, time: bySeq.get(i.guess.seq)!, confirmed: true } : i));
  },
  /** Keep one variant per Flow prompt (the lowest version, or the one already chosen). */
  keepOneVariant(items: ReviewItem[]) {
    const best = new Map<number, ReviewItem>();
    for (const i of items) {
      if (i.guess.seq === undefined || i.guess.variant === undefined || !i.include) continue;
      const cur = best.get(i.guess.seq);
      if (!cur || i.guess.variant < cur.guess.variant!) best.set(i.guess.seq, i);
    }
    return items.map((i) => (i.guess.variant !== undefined && i.guess.seq !== undefined && best.get(i.guess.seq) !== i ? { ...i, include: false } : i));
  },
  /** Rename the target rows to canonical stamps (`mm-ss-cc_name`) from their current times. */
  stampNames(items: ReviewItem[], stamp: (t: number) => string) {
    const ids = new Set(targets(items).filter((i) => i.time !== null).map((i) => i.id));
    return items.map((i) => (ids.has(i.id) ? { ...renameItem(i, `${stamp(i.time!)}_${i.name.replace(/^[\s\S]*?(\d{1,3}(?:-\d{1,3}){1,3})[_ -]?/, '')}`), time: i.time, confirmed: true } : i));
  },
  removeSelected(items: ReviewItem[]) {
    return items.filter((i) => !i.selected);
  },
  clear(items: ReviewItem[]) {
    return apply(items, new Map(targets(items).map((i) => [i.id, null])));
  },
};
