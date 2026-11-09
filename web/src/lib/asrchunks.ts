/** Split long audio into overlapping windows for speech recognition, then merge the words back without duplicates. */
export interface Win {
  start: number;
  end: number;
}
export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

/** Windows of `len` seconds overlapping by `overlap` seconds, covering 0..duration. */
export function windows(duration: number, len = 28, overlap = 2): Win[] {
  if (duration <= len) return [{ start: 0, end: duration }];
  const out: Win[] = [];
  for (let s = 0; s < duration; s += len - overlap) {
    out.push({ start: s, end: Math.min(duration, s + len) });
    if (s + len >= duration) break;
  }
  return out;
}

/**
 * Merge per-window words (times relative to each window). Each window owns words up to the middle of the overlap
 * with the next window, so a word cut at a boundary comes from the window that heard it whole.
 */
export function mergeWindows(wins: Win[], words: TimedWord[][]): TimedWord[] {
  const out: TimedWord[] = [];
  wins.forEach((w, i) => {
    const lo = i === 0 ? -Infinity : (wins[i - 1].end + w.start) / 2;
    const hi = i === wins.length - 1 ? Infinity : (w.end + wins[i + 1].start) / 2;
    for (const x of words[i] ?? []) {
      const s = x.start + w.start;
      if (s >= lo && s < hi) out.push({ text: x.text, start: +s.toFixed(3), end: +(x.end + w.start).toFixed(3) });
    }
  });
  return out;
}
