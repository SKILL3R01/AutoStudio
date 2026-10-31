import type { CaptionLine, CaptionSettings, Word } from '../types';
import { fmtSrtTime } from './util';

const toSec = (t: string) => {
  const m = t.trim().replace(',', '.').split(':').map(Number);
  return m.length === 3 ? m[0] * 3600 + m[1] * 60 + m[2] : m.length === 2 ? m[0] * 60 + m[1] : m[0];
};

/** Parse SRT or VTT into lines (each cue becomes one line). */
function parseCues(text: string): CaptionLine[] {
  const out: CaptionLine[] = [];
  const re = /((?:\d+:)?\d+:\d+[.,]\d+)\s*-->\s*((?:\d+:)?\d+:\d+[.,]\d+)[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g;
  for (const m of text.replace(/\r/g, '').matchAll(re)) {
    const start = toSec(m[1]), end = toSec(m[2]);
    const content = m[3].replace(/<[^>]+>/g, '').trim();
    if (content) out.push({ start, end, words: spreadWords(content, start, end) });
  }
  return out;
}

/** Split text evenly across a time range (weighted by word length). */
export function spreadWords(text: string, start: number, end: number): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const total = tokens.reduce((s, w) => s + w.length + 1, 0);
  let t = start;
  return tokens.map((w) => {
    const d = ((w.length + 1) / total) * (end - start);
    const word = { text: w, start: t, end: t + d };
    t += d;
    return word;
  });
}

/** Timestamped plain text: lines like `[00:12.5] text` or `00:12 text`. */
function parseTimestampedTxt(text: string, total: number): CaptionLine[] {
  const rows = text.split(/\r?\n/).map((l) => l.match(/^\s*\[?((?:\d+:)?\d+:\d+(?:[.,]\d+)?)\]?\s*[-–]?\s*(.+)$/)).filter(Boolean) as RegExpMatchArray[];
  return rows.map((r, i) => {
    const start = toSec(r[1]);
    const end = i + 1 < rows.length ? toSec(rows[i + 1][1]) : Math.max(start + 2, total);
    return { start, end, words: spreadWords(r[2].trim(), start, end) };
  });
}

export interface ParsedCaptions {
  words: Word[];
  lines: CaptionLine[];
  wordLevel: boolean;
}

export function parseCaptionFile(name: string, text: string, total: number): ParsedCaptions {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'json') {
    const j = JSON.parse(text);
    const arr: any[] = Array.isArray(j) ? j : j.words ?? j.segments?.flatMap((s: any) => s.words ?? []) ?? [];
    const words: Word[] = arr
      .map((w) => ({ text: String(w.text ?? w.word ?? '').trim(), start: +(w.start ?? w.s), end: +(w.end ?? w.e) }))
      .filter((w) => w.text && Number.isFinite(w.start));
    if (words.length) return { words, lines: [], wordLevel: true };
    const segs: any[] = j.segments ?? [];
    return { words: [], lines: segs.map((s) => ({ start: s.start, end: s.end, words: spreadWords(s.text, s.start, s.end) })), wordLevel: false };
  }
  const lines = /-->/.test(text) ? parseCues(text) : parseTimestampedTxt(text, total);
  // A cue with exactly one word per entry is a word-level SRT.
  const wordLevel = lines.length > 0 && lines.every((l) => l.words.length === 1);
  return wordLevel ? { words: lines.flatMap((l) => l.words), lines: [], wordLevel: true } : { words: [], lines, wordLevel: false };
}

/** Group words into display lines respecting max words, punctuation and pauses. */
export function buildLines(words: Word[], lines: CaptionLine[], s: CaptionSettings): CaptionLine[] {
  if (!words.length) {
    return lines.flatMap((l) => chunk(l.words, s.maxWords).map((ws) => ({ start: ws[0].start, end: ws[ws.length - 1].end, words: ws })));
  }
  const out: CaptionLine[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && (cur.length >= s.maxWords || (prev && w.start - prev.end > 0.6))) flush();
    cur.push(w);
    if (/[.!?…،؟]$/.test(w.text)) flush();
  });
  flush();
  // Hold each line on screen until the next begins (if the gap is short).
  out.forEach((l, i) => {
    const next = out[i + 1];
    l.end = next && next.start - l.end < 0.8 ? next.start : l.end + 0.3;
  });
  return out;
}

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export function toSrt(lines: CaptionLine[]) {
  return lines.map((l, i) => `${i + 1}\n${fmtSrtTime(l.start)} --> ${fmtSrtTime(l.end)}\n${l.words.map((w) => w.text).join(' ')}\n`).join('\n');
}

export function toVtt(lines: CaptionLine[]) {
  return 'WEBVTT\n\n' + lines.map((l) => `${fmtSrtTime(l.start, '.')} --> ${fmtSrtTime(l.end, '.')}\n${l.words.map((w) => w.text).join(' ')}\n`).join('\n');
}
