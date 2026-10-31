export type GuessKind = 'timestamp' | 'sequence' | 'number' | 'none' | 'rejected';

export interface TimeGuess {
  kind: GuessKind;
  /** Seconds, when the name encodes a time. */
  time: number | null;
  /** Flow-style sequence number (`001_v2` → 1) or a bare number that may be a sequence. */
  seq?: number;
  variant?: number;
  /** Human-readable explanation shown in the review table. */
  label: string;
}

const base = (name: string) => name.replace(/\.[^.]+$/, '').trim();

/**
 * Work out what a filename says about when it should appear.
 * Supports `0-03`, `01-32-420`, `1-02-03-500`, `0_03`, `00:03`, `[00:03.5]`, `1m32s`, `92s`, `t=92`, `12.5`,
 * Flow Automator names (`001_v1`, `001-prompt_v2`), and rejects camera/date names and copy markers like `image (16)`.
 */
export function detectTime(name: string): TimeGuess {
  const b = base(name);

  const flow = b.match(/^(\d{1,4})(?:-.*?)?_v(\d+)$/i);
  if (flow) return { kind: 'sequence', time: null, seq: +flow[1], variant: +flow[2], label: `Flow #${+flow[1]} · v${flow[2]}` };

  if (/(?:^|\D)(?:19|20)\d{2}[-_.]?(?:0[1-9]|1[0-2])[-_.]?(?:[0-2]\d|3[01])(?:\D|$)/.test(b) || /\d{6,}/.test(b))
    return { kind: 'rejected', time: null, label: 'Looks like a date / camera name' };

  const clock = b.match(/(?:^|[^\d])\[?((?:\d{1,2}:)?\d{1,3}:\d{2}(?:[.,]\d{1,3})?)\]?(?:[^\d]|$)/);
  if (clock) {
    const parts = clock[1].replace(',', '.').split(':').map(Number);
    const t = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
    return { kind: 'timestamp', time: t, label: clock[1] };
  }

  const units = b.match(/(?:^|[^a-z\d])(?:(\d+)h)?(?:(\d+)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:[^a-z\d]|$)/i);
  if (units && (units[1] || units[2] || units[3])) {
    const t = (+(units[1] ?? 0)) * 3600 + (+(units[2] ?? 0)) * 60 + +(units[3] ?? 0);
    return { kind: 'timestamp', time: t, label: units[0].replace(/^[^a-z\d]|[^a-z\d]$/gi, '') };
  }

  const tEq = b.match(/(?:^|[^a-z])t\s*=\s*(\d+(?:\.\d+)?)/i);
  if (tEq) return { kind: 'timestamp', time: +tEq[1], label: `t=${tEq[1]}` };

  if (/\(\d+\)\s*$/.test(b) && !/^\d/.test(b)) return { kind: 'none', time: null, label: 'Copy number, not a time' };

  const groups = b.match(/(?:^|[^\d])(\d{1,3}(?:[-_.]\d{1,3}){1,3})(?:[^\d]|$)/);
  if (groups) {
    const raw = groups[1];
    const p = raw.split(/[-_.]/);
    const n = p.map(Number);
    let t: number | null = null;
    if (p.length === 2) t = /^\d+\.\d+$/.test(raw) ? parseFloat(raw) : n[1] < 60 ? n[0] * 60 + n[1] : null;
    else if (p.length === 3) t = p[2].length === 3 ? n[0] * 60 + n[1] + n[2] / 1000 : n[0] * 3600 + n[1] * 60 + n[2];
    else t = n[0] * 3600 + n[1] * 60 + n[2] + n[3] / 1000;
    if (t !== null) return { kind: 'timestamp', time: t, label: raw };
  }

  const single = b.match(/(?:^|[^\d])(\d{1,4})(?:[^\d]|$)/);
  if (single) return { kind: 'number', time: +single[1], seq: +single[1], label: `“${single[1]}” — seconds or order?` };

  return { kind: 'none', time: null, label: 'No timestamp in name' };
}

/** Parse what the user types in the review table: `1:32.4`, `92`, `92.4s`, `1m32`. */
export function parseClock(s: string): number | null {
  const v = s.trim();
  if (!v) return null;
  if (/^\d+(?:\.\d+)?s?$/.test(v)) return parseFloat(v);
  const m = v.match(/^(?:(\d+):)?(\d+):(\d+(?:[.,]\d+)?)$/);
  if (m) return (+(m[1] ?? 0)) * 3600 + +m[2] * 60 + parseFloat(m[3].replace(',', '.'));
  const u = v.match(/^(?:(\d+)m)?\s*(\d+(?:\.\d+)?)?s?$/i);
  if (u && (u[1] || u[2])) return (+(u[1] ?? 0)) * 60 + +(u[2] ?? 0);
  return null;
}

export const fmtClock = (t: number) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
