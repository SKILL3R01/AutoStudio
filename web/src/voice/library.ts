/**
 * Voice Studio data:
 *  - "My voices": reference samples for cloning, saved once and reused by every project (IndexedDB + a small index).
 *  - Script → speech: paragraph-level generation on the local engine (or the Colab engine as "turbo"), cached by
 *    content so editing one paragraph only regenerates that paragraph, then joined into one voiceover WAV.
 */
import { get, set } from 'idb-keyval';
import { encodeWav } from '../audio/silence';
import { runJob, fetchResult } from '../lib/engine';

export interface VoiceSample {
  id: string;
  name: string;
  language: string;
  duration: number;
  createdAt: number;
  /** The user confirmed this is their voice, or that they have permission to clone it. */
  consent: true;
}

const INDEX = 'voices:index';
export const listVoices = async (): Promise<VoiceSample[]> => (await get<VoiceSample[]>(INDEX)) ?? [];
export const voiceBlob = (id: string) => get<Blob>(`voice:${id}`);

export async function saveVoice(v: VoiceSample, blob: Blob) {
  await set(`voice:${v.id}`, blob);
  await set(INDEX, [...(await listVoices()).filter((x) => x.id !== v.id), v]);
}

export async function deleteVoice(id: string) {
  await set(INDEX, (await listVoices()).filter((x) => x.id !== id));
  await set(`voice:${id}`, undefined);
}

// ---------- sample quality ----------

export interface SampleCheck {
  duration: number;
  peak: number;
  rmsDb: number;
  issues: string[];
}

/** Length / clipping / loudness checks for a cloning reference. */
export function checkSample(buf: AudioBuffer): SampleCheck {
  const d = buf.getChannelData(0);
  let peak = 0, sum = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    sum += d[i] * d[i];
  }
  const rmsDb = 20 * Math.log10(Math.sqrt(sum / Math.max(1, d.length)) || 1e-9);
  const issues: string[] = [];
  if (buf.duration < 6) issues.push('Too short — record 10–20 seconds of natural speech.');
  if (buf.duration > 40) issues.push('Long samples are trimmed to the first 30 seconds.');
  if (peak > 0.99) issues.push('The recording clips (too loud) — move back from the mic a little.');
  if (rmsDb < -38) issues.push('Very quiet — speak closer to the microphone.');
  return { duration: buf.duration, peak, rmsDb, issues };
}

// ---------- script → paragraphs ----------

/** Split a script into paragraphs (blank lines), merging very short ones so every chunk sounds natural. */
export function paragraphsOf(script: string): string[] {
  const raw = script.split(/\n\s*\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of raw) {
    if (out.length && (out[out.length - 1].length < 40 || p.length < 25)) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}

export const detectLanguage = (text: string) => (/[\u0600-\u06ff]/.test(text) ? 'ar' : 'en');

export interface GenSettings {
  voiceId?: string;
  language: string;
  exaggeration: number;
  cfg: number;
  seed: number;
}

/** Stable cache key for one paragraph with given settings. */
export async function paragraphKey(text: string, s: GenSettings): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify([text, s.voiceId ?? '', s.language, s.exaggeration, s.cfg, s.seed]));
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return `tts:${Array.from(h.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export type Backend = 'local' | 'colab';

/** Generate one paragraph (cached). */
export async function speakParagraph(text: string, s: GenSettings, backend: Backend, onLog?: (l: string) => void): Promise<Blob> {
  const key = await paragraphKey(text, s);
  const hit = await get<Blob>(key);
  if (hit) return hit;
  const ref = s.voiceId ? await voiceBlob(s.voiceId) : undefined;
  let wav: Blob;
  if (backend === 'local') {
    if (!window.autostudio?.voice) throw new Error('The local voice engine needs the desktop app.');
    const buf = await window.autostudio.voice.generate({ id: key.slice(4), text, language: s.language, voice: ref ? await ref.arrayBuffer() : undefined, voiceExt: ref?.type.includes('webm') ? 'webm' : 'wav', exaggeration: s.exaggeration, cfg: s.cfg, seed: s.seed });
    wav = new Blob([buf], { type: 'audio/wav' });
  } else {
    const f = new FormData();
    f.append('text', text);
    f.append('language', s.language);
    f.append('model', s.language === 'en' ? 'auto' : 'multilingual');
    f.append('exaggeration', String(s.exaggeration));
    f.append('cfg_weight', String(s.cfg));
    f.append('seed', String(s.seed));
    if (ref) f.append('voice', ref, ref.type.includes('webm') ? 'voice.webm' : 'voice.wav');
    const job = await runJob('tts', f, (j) => onLog?.(j.logs[j.logs.length - 1] ?? ''));
    wav = await fetchResult(job.files[0].url);
  }
  await set(key, wav);
  return wav;
}

/** Join paragraph WAVs with natural pauses and tiny fades (no clicks). */
export async function joinParagraphs(parts: Blob[], pause = 0.45): Promise<Blob> {
  const ctx = new AudioContext();
  const bufs = await Promise.all(parts.map(async (b) => ctx.decodeAudioData(await b.arrayBuffer())));
  void ctx.close();
  const sr = bufs[0]?.sampleRate ?? 24000;
  const gap = Math.round(pause * sr), fade = Math.round(0.012 * sr);
  const total = bufs.reduce((n, b) => n + b.length, 0) + gap * Math.max(0, bufs.length - 1);
  const out = new AudioBuffer({ length: Math.max(1, total), numberOfChannels: 1, sampleRate: sr });
  const d = out.getChannelData(0);
  let at = 0;
  for (const [i, b] of bufs.entries()) {
    const src = b.getChannelData(0);
    for (let k = 0; k < src.length; k++) {
      const g = Math.min(1, k / fade, (src.length - 1 - k) / fade);
      d[at + k] = src[k] * g;
    }
    at += src.length + (i < bufs.length - 1 ? gap : 0);
  }
  return encodeWav(out);
}
