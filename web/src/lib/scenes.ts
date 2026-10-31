import type { Word } from '../types';
import { newProject, probe, defaultClip } from './project';
import { saveProject } from './db';

export interface Scene {
  start: number;
  end: number;
  text: string;
}

/** Group timed words into scenes of roughly `target` seconds, preferring sentence boundaries. */
export function splitScenes(words: Word[], target: number): Scene[] {
  const out: Scene[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(' ') });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    const dur = w.end - cur[0].start;
    const sentenceEnd = /[.!?…؟]$/.test(w.text);
    if ((sentenceEnd && dur >= target * 0.6) || dur >= target * 1.6 || (/[,;:،]$/.test(w.text) && dur >= target * 1.1)) flush();
  }
  flush();
  return out;
}

/** Group words into transcript lines of about `interval` seconds. */
export function linesByInterval(words: Word[], interval: number) {
  return splitScenes(words, interval);
}

export const STYLE_PRESETS: [string, string][] = [
  ['cinematic photo, dramatic lighting, 35mm film, highly detailed', 'Cinematic photo'],
  ['3d pixar style render, soft lighting, vibrant colors, cute', '3D animation'],
  ['cartoon illustration, clean line art, flat colors, storybook', 'Cartoon storybook'],
  ['anime key visual, studio ghibli style, detailed background', 'Anime'],
  ['digital painting, concept art, epic, artstation', 'Concept art'],
  ['watercolor illustration, soft pastel colors, paper texture', 'Watercolor'],
  ['dark moody horror atmosphere, fog, cinematic, eerie', 'Dark / horror'],
  ['documentary photo, natural light, realistic, 4k', 'Documentary'],
  ['minimalist vector illustration, flat design, simple shapes', 'Minimal vector'],
  ['', 'No style'],
];

export const buildPrompt = (style: string, character: string, text: string) =>
  [style, character, text].filter(Boolean).join(', ').slice(0, 380);

export const stampName = (t: number, ext: string) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000);
  return `${String(m).padStart(2, '0')}-${String(s).padStart(2, '0')}-${String(ms).padStart(3, '0')}.${ext}`;
};

/** Create and save a ready-to-edit project from generated media. */
export async function createProject(opts: { name: string; voice?: Blob; images: { blob: Blob; name: string; t: number }[]; words?: Word[]; aspect?: '16:9' | '9:16' | '1:1' }) {
  const p = newProject(opts.name);
  if (opts.voice) {
    const a = await probe(opts.voice, 'voiceover.wav', 'audio');
    p.assets.push(a);
    p.voiceover = { assetId: a.id, volume: 1 };
  }
  const imgs = [...opts.images].sort((a, b) => a.t - b.t);
  for (const [i, im] of imgs.entries()) {
    const a = await probe(im.blob, im.name, im.blob.type.startsWith('video') ? 'video' : 'image');
    p.assets.push(a);
    const c = defaultClip(a.id, i === 0 ? 0 : im.t);
    c.transition = i === 0 ? 'none' : 'crossfade';
    p.clips.push(c);
  }
  if (opts.words) p.words = opts.words;
  if (opts.aspect) p.export.aspect = opts.aspect;
  if (!opts.voice && imgs.length) p.length = imgs[imgs.length - 1].t + 4;
  await saveProject(p);
  return p;
}
