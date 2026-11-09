/** 720p working copies for large videos: smooth preview editing; export still reads the original file. */
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny';
import { saveBlob } from './db';
import { media } from '../render/media';
import { uid } from './util';
import type { Asset, Project } from '../types';

export const needsProxy = (a: Asset) => a.kind === 'video' && !a.proxyId && (a.height ?? 0) > 1080;

export async function makeProxy(a: Asset, onProgress?: (p: number) => void): Promise<string> {
  const blob = await media.blob(a.id);
  if (!blob) throw new Error('Video file not found');
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const conv = await Conversion.init({ input: new Input({ source: new BlobSource(blob), formats: ALL_FORMATS }), output, video: { height: 720, bitrate: 3e6 }, audio: { discard: true } });
  if (!conv.isValid) throw new Error('This video cannot be converted in the app');
  if (onProgress) conv.onProgress = onProgress;
  await conv.execute();
  const id = `proxy_${uid()}`;
  await saveBlob(id, new Blob([target.buffer!], { type: 'video/mp4' }));
  return id;
}

/** Tell the preview which assets have working copies. */
export const syncProxies = (p: Project) => media.setProxies(new Map(p.assets.filter((a) => a.proxyId).map((a) => [a.id, a.proxyId!])));
