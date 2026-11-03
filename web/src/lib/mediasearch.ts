/**
 * "Find a clip by describing it": CLIP vectors for every image / video in the project (computed once, stored in the
 * project), compared with the vector of the typed description.
 */
import { clipEmbedImages, clipEmbedText } from '../ai/vision';
import { clipStill } from '../ai/jobs';
import { media } from '../render/media';
import type { Asset, Clip, Project } from '../types';

export function encodeVec(v: Float32Array): string {
  const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function decodeVec(s: string): Float32Array {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new Float32Array(b.buffer);
}

export const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s;
};

/** Media the search can index: visible images and videos (not depth maps / masks). */
export const searchable = (p: Project) => p.assets.filter((a) => (a.kind === 'image' || a.kind === 'video') && !a.name.startsWith('__'));
export const unindexed = (p: Project) => searchable(p).filter((a) => !p.embeddings?.[a.id]);

/** Rank assets by similarity to a text vector. */
export function rank(p: Project, q: Float32Array): { asset: Asset; score: number }[] {
  return searchable(p)
    .filter((a) => p.embeddings?.[a.id])
    .map((asset) => ({ asset, score: dot(q, decodeVec(p.embeddings![asset.id])) }))
    .sort((a, b) => b.score - a.score);
}

/** Show a friendly 0–100 match from CLIP cosine similarity (≈0.15 unrelated … ≈0.32 very good). */
export const matchPercent = (score: number) => Math.round(Math.max(0, Math.min(1, (score - 0.15) / 0.17)) * 100);

/** A still for each asset: the image, or a frame a quarter into the video. */
async function stillOf(a: Asset): Promise<Blob | undefined> {
  if (a.kind === 'image') return media.blob(a.id);
  const fake = { id: 'x', assetId: a.id, start: 0, trimIn: Math.min(2, (a.duration ?? 4) * 0.25) } as Clip;
  return clipStill(fake, a).catch(() => undefined);
}

/** Compute vectors for media that has none yet. Returns id → base64 vector. */
export async function indexMedia(assets: Asset[], onProgress: (done: number, total: number) => void): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < assets.length; i += 6) {
    const batch = assets.slice(i, i + 6);
    const stills = await Promise.all(batch.map(stillOf));
    const ok = batch.filter((_, k) => stills[k]);
    const vecs = ok.length ? await clipEmbedImages(stills.filter((s): s is Blob => !!s)) : [];
    ok.forEach((a, k) => (out[a.id] = encodeVec(vecs[k])));
    onProgress(Math.min(assets.length, i + batch.length), assets.length);
  }
  return out;
}

/** Text → vector. CLIP was trained on English captions, so "a photo of …" helps short queries. */
export async function queryVector(q: string): Promise<Float32Array> {
  const text = q.trim().split(/\s+/).length <= 3 ? `a photo of ${q.trim()}` : q.trim();
  return (await clipEmbedText([text]))[0];
}
