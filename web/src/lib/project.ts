import type { Asset, AssetKind, Clip, KeywordSettings, Project, TypoBlock, TypoSettings } from '../types';
import { saveBlob } from './db';
import { uid } from './util';

export const defaultKeywordSettings = (): KeywordSettings => ({
  density: 3, combo: 'bold-serif', palette: 'neon', placement: 'safe', seed: 1, anims: ['pop', 'slam', 'slide', 'rotate'],
  hold: 1.2, stroke: true, shadow: true, uppercase: true,
});

export const defaultTypoSettings = (): TypoSettings => ({
  density: 2, template: 'random', palette: 'mono-yellow', fontPair: 'spartan-pacifico', bg: 'shadow', hold: 0.8, maxWords: 4, seed: 1,
});

/** Turn legacy single-word keywords into one-word typography blocks. */
function migrateKeywords(p: Project): TypoBlock[] {
  return (p.keywords ?? []).map((k) => ({
    id: k.id, start: k.start, end: k.end, template: 'punch', x: k.x, y: k.y, scale: k.size, rotate: k.rotate, palette: 'mono-yellow',
    fontPair: 'spartan-pacifico', bg: 'shadow', locked: k.locked, words: [{ text: k.text, start: k.start, end: k.end, role: 'main', font: k.font, color: k.color }],
  }));
}

export function newProject(name = 'Untitled project'): Project {
  return {
    id: 'p_' + uid(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    assets: [],
    length: 10,
    voiceStart: 0,
    tail: 0,
    audioFade: { in: 0, out: 0 },
    clips: [],
    motionDepth: 0.12,
    transitionDuration: 0.5,
    sceneFades: { fadeIn: 0.5, fadeOut: 0.8 },
    words: [],
    lines: [],
    captions: { enabled: true, mode: 'full', style: 'neon', font: '', size: 1, position: 82, maxWords: 6, uppercase: false, wordLevel: true },
    keywords: [],
    keywordSettings: defaultKeywordSettings(),
    typo: [],
    typoSettings: defaultTypoSettings(),
    flowScenes: [],
    overlays: [],
    music: [],
    sfx: [],
    effects: [],
    color: { brightness: 1, contrast: 1, saturation: 1 },
    luts: [],
    export: { aspect: '16:9', fps: 30, resolution: 'full', quality: 'high', background: 'blur', format: 'mp4' },
  };
}

/** Fill in fields added in later versions so older saved projects keep working. */
export function normalizeProject(p: Project): Project {
  const d = newProject(p.name);
  return {
    ...d,
    ...p,
    captions: { ...d.captions, ...p.captions },
    keywordSettings: { ...d.keywordSettings, ...p.keywordSettings },
    keywords: [],
    typo: p.typo ?? migrateKeywords(p),
    typoSettings: { ...d.typoSettings, ...p.typoSettings },
    flowScenes: p.flowScenes ?? [],
    effects: p.effects ?? [],
    export: { ...d.export, ...p.export },
    voiceStart: p.voiceStart ?? 0,
    tail: p.tail ?? 0,
    audioFade: { ...d.audioFade, ...p.audioFade },
  };
}

/** Move the narration start; captions, keywords and SFX follow so they stay in sync with the voice. */
export function setVoiceStart(p: Project, v: number) {
  const d = Math.max(0, v) - p.voiceStart;
  if (!d) return;
  p.voiceStart = Math.max(0, v);
  p.words.forEach((w) => ((w.start += d), (w.end += d)));
  p.lines.forEach((l) => ((l.start += d), (l.end += d), l.words.forEach((w) => ((w.start += d), (w.end += d)))));
  p.typo.forEach((b) => ((b.start += d), (b.end += d), b.words.forEach((w) => ((w.start += d), (w.end += d)))));
  p.sfx.forEach((s) => (s.start = Math.max(0, s.start + d)));
}

/** A blank (solid colour) section starting at `start`. */
export const blankClip = (start: number, fill = '#000000'): Clip => ({ ...defaultClip('', start), fill, motion: 'none', volume: 0 });

export const kindOf = (f: File): AssetKind | null =>
  f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio'
  : /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(f.name) ? 'image' : /\.(mp4|webm|mov|mkv)$/i.test(f.name) ? 'video'
  : /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(f.name) ? 'audio' : null;

export async function probe(file: Blob, name: string, kind: AssetKind): Promise<Asset> {
  const id = uid();
  const url = URL.createObjectURL(file);
  const asset: Asset = { id, name, kind, mime: file.type };
  try {
    if (kind === 'image') {
      const bmp = await createImageBitmap(file);
      asset.width = bmp.width;
      asset.height = bmp.height;
      bmp.close();
    } else {
      const el = document.createElement(kind === 'video' ? 'video' : 'audio');
      el.preload = 'metadata';
      el.src = url;
      await new Promise<void>((res, rej) => {
        el.onloadedmetadata = () => res();
        el.onerror = () => rej(new Error(`Cannot read ${name}`));
      });
      asset.duration = Number.isFinite(el.duration) ? el.duration : 0;
      if (el instanceof HTMLVideoElement) {
        asset.width = el.videoWidth;
        asset.height = el.videoHeight;
      }
    }
  } finally {
    URL.revokeObjectURL(url);
  }
  await saveBlob(id, file);
  return asset;
}

export const defaultClip = (assetId: string, start: number): Clip => ({
  id: uid(), assetId, start, trimIn: 0, motion: 'random', transition: 'none', volume: 0.4, fit: 'cover',
});

/** Import audio files: the first becomes the voiceover (unless `asMusic`), the rest music beds. */
export async function importAudio(p: Project, files: File[], opts: { asVoiceover?: boolean; asMusic?: boolean } = {}): Promise<Project> {
  const next = structuredClone(p);
  for (const f of files) {
    if (kindOf(f) !== 'audio') continue;
    const asset = await probe(f, f.name, 'audio');
    next.assets.push(asset);
    if (!opts.asMusic && (opts.asVoiceover || !next.voiceover)) next.voiceover = { assetId: asset.id, volume: 1 };
    else next.music.push({ id: uid(), assetId: asset.id, start: 0, duration: asset.duration ?? 10, trimIn: 0, volume: 0.25, fadeIn: 1, fadeOut: 2, duck: true });
  }
  return next;
}

export interface TimedFile {
  file: File | Blob;
  name: string;
  time: number;
}

/** Add visuals at reviewed times (from the import review table). Existing clips stay where they are. */
export async function importVisuals(p: Project, entries: TimedFile[], onProgress?: (done: number) => void): Promise<Project> {
  const next = structuredClone(p);
  const sorted = [...entries].sort((a, b) => a.time - b.time);
  for (const [i, e] of sorted.entries()) {
    const kind = e.file.type.startsWith('video') || /\.(mp4|webm|mov|mkv)$/i.test(e.name) ? 'video' : 'image';
    const asset = await probe(e.file, e.name, kind);
    next.assets.push(asset);
    next.clips.push(defaultClip(asset.id, e.time));
    onProgress?.(i + 1);
  }
  next.clips.sort((a, b) => a.start - b.start);
  if (next.clips[0]) next.clips[0].start = Math.min(next.clips[0].start, 0);
  if (!next.voiceover && next.clips.length) {
    const last = next.clips[next.clips.length - 1];
    const lastAsset = next.assets.find((a) => a.id === last.assetId);
    next.length = Math.max(next.length, last.start + (lastAsset?.kind === 'video' ? lastAsset.duration ?? 4 : 4));
  }
  return next;
}

/** Spread existing clips evenly across the project length. */
export function distributeEvenly(p: Project, total: number) {
  p.clips.forEach((c, i) => (c.start = (i * total) / p.clips.length));
}
