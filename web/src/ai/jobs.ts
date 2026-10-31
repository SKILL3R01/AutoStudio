import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { Asset, Clip } from '../types';
import { media } from '../render/media';
import { probe } from '../lib/project';
import { estimateDepth } from './vision';

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

/** Run Depth Anything on a clip and store the map as a hidden asset. */
export async function makeDepthAsset(clip: Clip, asset: Asset): Promise<Asset | undefined> {
  const still = await clipStill(clip, asset);
  if (!still) return undefined;
  const depth = await estimateDepth(still);
  return probe(depth, `__depth_${asset.name}`, 'image');
}
