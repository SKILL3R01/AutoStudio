import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { Asset, Clip } from '../types';
import { media } from '../render/media';
import { probe } from '../lib/project';
import { estimateDepth } from './vision';
import { grayOf, lumaOf, refineDepth } from '../render/depthrefine';

/** A still of the clip's source (the image itself, or the video frame at its trim-in point), max 1280px. */
export async function clipStill(clip: Clip, asset: Asset): Promise<Blob | undefined> {
  const b = await media.blob(asset.id);
  if (!b || asset.kind === 'image') return b;
  const input = new Input({ source: new BlobSource(b), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) return undefined;
  const sink = new CanvasSink(track, { width: Math.min(1280, track.displayWidth) });
  const c = await sink.getCanvas((await track.getFirstTimestamp()) + clip.trimIn + 0.05);
  if (!c) return undefined;
  const cv = c.canvas;
  return cv instanceof HTMLCanvasElement ? new Promise<Blob>((r) => cv.toBlob((x) => r(x!), 'image/png')) : cv.convertToBlob({ type: 'image/png' });
}

/** Run Depth Anything on a clip, clean the map (edges aligned to the picture) and store it as a hidden asset. */
export async function makeDepthAsset(clip: Clip, asset: Asset): Promise<Asset | undefined> {
  const still = await clipStill(clip, asset);
  if (!still) return undefined;
  const depth = await estimateDepth(still);
  return probe(await refinedDepth(depth, still), `${REFINED}${asset.name}`, 'image');
}

/** Hidden depth assets made (or fixed) with edge refinement start with this prefix. */
export const REFINED = '__depth2_';
export const isRefined = (a?: Asset) => !!a?.name.startsWith(REFINED);

/** "Fix edges" for a depth map made before refinement existed. */
export async function refineDepthAsset(clip: Clip, asset: Asset, depthAsset: Asset): Promise<Asset | undefined> {
  const [still, depth] = await Promise.all([clipStill(clip, asset), media.blob(depthAsset.id)]);
  if (!still || !depth) return undefined;
  return probe(await refinedDepth(depth, still), `${REFINED}${asset.name}`, 'image');
}

async function refinedDepth(depth: Blob, still: Blob): Promise<Blob> {
  const [db, sb] = await Promise.all([createImageBitmap(depth), createImageBitmap(still)]);
  const s = Math.min(1, 768 / Math.max(db.width, db.height));
  const w = Math.round(db.width * s), h = Math.round(db.height * s);
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(db, 0, 0, w, h);
  const d = grayOf(g.getImageData(0, 0, w, h).data);
  g.drawImage(sb, 0, 0, w, h);
  const lum = lumaOf(g.getImageData(0, 0, w, h).data);
  db.close();
  sb.close();
  const out = refineDepth(d, lum, w, h);
  const img = g.createImageData(w, h);
  for (let i = 0; i < out.length; i++) (img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = out[i]), (img.data[i * 4 + 3] = 255);
  g.putImageData(img, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}
