export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** Deterministic hash → [0,1). Used so preview and export render identical randomness. */
export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function fmtTime(t: number, ms = true) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return ms ? `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}` : `${m}:${String(Math.floor(sec)).padStart(2, '0')}`;
}

export function fmtSrtTime(t: number, sep = ',') {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms % 1000, 3)}`;
}

/**
 * Parse a timestamp embedded in a filename: `0-03.png` → 3, `01-32-420.mp4` → 92.42,
 * `1-02-03-500` → 3723.5, `12.5.png` → 12.5. Returns null if none found.
 */
export function parseFilenameTime(name: string): number | null {
  const base = name.replace(/\.[^.]+$/, '');
  const m = base.match(/(\d+(?:[-_:.]\d+){0,3})/);
  if (!m) return null;
  const parts = m[1].split(/[-_:.]/);
  const n = parts.map(Number);
  if (parts.length === 1) return n[0];
  if (parts.length === 2) return /^\d+\.\d+$/.test(m[1]) ? parseFloat(m[1]) : n[0] * 60 + n[1];
  if (parts.length === 3) return parts[2].length === 3 ? n[0] * 60 + n[1] + n[2] / 1000 : n[0] * 3600 + n[1] * 60 + n[2];
  return n[0] * 3600 + n[1] * 60 + n[2] + n[3] / 1000;
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

export const isRtl = (s: string) => /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(s);
