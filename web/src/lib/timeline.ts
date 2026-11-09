/** Timeline helpers shared by the timeline, the right-click menu and Properties. */
import type { Clip, Project } from '../types';

/** "1:23.450", "83.45", "1:02:03.5" or "00:12:340" (mm:ss:ms) → seconds; null when unreadable. */
export function parseClock(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const colon = t.split(':');
  // mm:ss:ms with a 3-digit last part = milliseconds (the format the review table uses).
  if (colon.length === 3 && /^\d{3}$/.test(colon[2]) && !colon[1].includes('.')) {
    const [m, s, ms] = colon.map(Number);
    return [m, s, ms].every(Number.isFinite) ? m * 60 + s + ms / 1000 : null;
  }
  const nums = colon.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

/** Seconds → "m:ss.mmm". */
export const fmtClock = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(3).padStart(6, '0')}`;
};

/** Visible start / end of clip i (clip 0 always starts at 0; a clip lasts until the next one starts). */
export const clipSpan = (p: Project, i: number, length: number) => ({
  start: i === 0 ? 0 : p.clips[i].start,
  end: i + 1 < p.clips.length ? p.clips[i + 1].start : length,
});

/** Move clip `from` to position `to`, keeping every clip's duration; starts are rebuilt in order. */
export function moveClip(clips: Clip[], from: number, to: number, length: number): Clip[] {
  if (from === to || from < 0 || from >= clips.length) return clips;
  const durs = clips.map((c, i) => (i + 1 < clips.length ? clips[i + 1].start : length) - (i === 0 ? 0 : c.start));
  const order = clips.map((_, i) => i);
  order.splice(to, 0, order.splice(from, 1)[0]);
  let t = 0;
  return order.map((k) => {
    const c = { ...clips[k], start: t };
    t += durs[k];
    return c;
  });
}

/** Set where clip i starts (moves the cut with the previous clip), kept inside its neighbours. */
export function setClipStart(p: Project, i: number, start: number, length: number) {
  if (i <= 0) return;
  const lo = (i === 1 ? 0 : p.clips[i - 1].start) + 0.1;
  const hi = (i + 1 < p.clips.length ? p.clips[i + 1].start : length) - 0.1;
  p.clips[i].start = Math.min(hi, Math.max(lo, start));
}

export interface DurationFlag {
  index: number;
  id: string;
  duration: number;
  kind: 'short' | 'long';
}

/** Clips shorter than `min` or longer than `max` seconds (ignored ones are skipped). */
export function durationFlags(p: Project, length: number, min = 1, max = 20): DurationFlag[] {
  const out: DurationFlag[] = [];
  p.clips.forEach((c, i) => {
    if (c.ignoreDuration) return;
    const { start, end } = clipSpan(p, i, length);
    const d = end - start;
    if (d < min) out.push({ index: i, id: c.id, duration: d, kind: 'short' });
    else if (d > max) out.push({ index: i, id: c.id, duration: d, kind: 'long' });
  });
  return out;
}
