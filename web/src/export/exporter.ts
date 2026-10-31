import {
  ALL_FORMATS, AudioBufferSource, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input, Mp4OutputFormat, Output,
  WebMOutputFormat, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec,
} from 'mediabunny';
import type { Asset, Clip, Project } from '../types';
import { renderMix } from '../audio/mix';
import { media } from '../render/media';
import {
  activeClipIndices, clipSourceTime, clipStart, imagesNeededAt, makeModel, outputSize, renderFrame, type Drawable, type FrameSource,
} from '../render/renderer';
import type { CaptionLine } from '../types';

export interface ExportProgress {
  stage: string;
  progress: number;
}

/**
 * Decodes video frames for export. Every frame time each clip will need is known up front, so each clip gets one
 * monotonic `canvasesAtTimestamps` stream (each packet decoded at most once) instead of a seek per frame.
 */
class VideoFrames {
  private streams = new Map<string, Promise<AsyncGenerator<{ canvas: Drawable } | null> | null>>();
  private frames = new Map<string, Drawable>();

  constructor(private W: number, private plan: Map<string, number[]>) {}

  private stream(clip: Clip) {
    if (!this.streams.has(clip.id)) {
      this.streams.set(clip.id, (async () => {
        const b = await media.blob(clip.assetId);
        if (!b) return null;
        const input = new Input({ source: new BlobSource(b), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (!track) return null;
        const sink = new CanvasSink(track, { width: Math.min(this.W, track.displayWidth), poolSize: 4 });
        return sink.canvasesAtTimestamps(this.plan.get(clip.id) ?? []);
      })());
    }
    return this.streams.get(clip.id)!;
  }

  async next(clip: Clip) {
    const it = await this.stream(clip);
    const r = it && (await it.next());
    if (r && !r.done && r.value) this.frames.set(clip.id, r.value.canvas);
  }

  get(clip: Clip) {
    return this.frames.get(clip.id);
  }
}

const sourceTime = (p: Project, i: number, t: number, asset: Asset) => clipSourceTime(p.clips[i], asset, t - clipStart(p.clips, i));

export async function exportVideo(p: Project, lines: CaptionLine[], onProgress: (e: ExportProgress) => void, signal: AbortSignal, beats: number[] = []) {
  const m = makeModel(p, lines, beats);
  const { W, H } = outputSize(p);
  const fps = p.export.fps;
  const bitrate = videoBitrate(p, W, H);
  const webm = p.export.format === 'webm';

  onProgress({ stage: 'Loading fonts & media', progress: 0 });
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const videoCodec = await getFirstEncodableVideoCodec(webm ? ['vp9', 'av1', 'vp8'] : ['avc', 'hevc', 'vp9', 'av1'], { width: W, height: H, bitrate });
  if (!videoCodec) throw new Error('This browser cannot encode video. Use Chrome or Edge.');
  const audioCodec = await getFirstEncodableAudioCodec(webm ? ['opus'] : ['aac', 'opus'], { numberOfChannels: 2, sampleRate: 48000 });

  onProgress({ stage: 'Mixing audio', progress: 0 });
  const mix = await renderMix(p, 48000);

  const format = webm ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' });
  const output = new Output({ format, target: new BufferTarget() });
  const vsrc = new CanvasSource(canvas, { codec: videoCodec, bitrate, keyFrameInterval: 2 });
  output.addVideoTrack(vsrc, { frameRate: fps });
  const asrc = audioCodec ? new AudioBufferSource({ codec: audioCodec, bitrate: 192_000 }) : null;
  if (asrc) output.addAudioTrack(asrc);
  await output.start();

  if (asrc) {
    const chunk = 48000 * 10;
    for (let off = 0; off < mix.length; off += chunk) {
      const len = Math.min(chunk, mix.length - off);
      const part = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: 48000 });
      for (let c = 0; c < 2; c++) part.copyToChannel(mix.getChannelData(Math.min(c, mix.numberOfChannels - 1)).subarray(off, off + len), c);
      await asrc.add(part);
    }
  }

  const total = Math.ceil(m.length * fps);
  const plan = new Map<string, number[]>();
  for (let f = 0; f < total; f++) {
    for (const i of activeClipIndices(m, f / fps)) {
      const clip = p.clips[i];
      const asset = m.assets.get(clip.assetId);
      if (asset?.kind !== 'video') continue;
      const list = plan.get(clip.id) ?? [];
      list.push(sourceTime(p, i, f / fps, asset));
      plan.set(clip.id, list);
    }
  }
  const frames = new VideoFrames(W, plan);
  const src: FrameSource = {
    clip: (clip, asset) => (asset.kind === 'video' ? frames.get(clip) : media.image(asset.id)),
    image: (id) => media.image(id),
  };
  const started = performance.now();
  for (let f = 0; f < total; f++) {
    if (signal.aborted) {
      await output.cancel();
      throw new DOMException('Export cancelled', 'AbortError');
    }
    const t = f / fps;
    for (const i of activeClipIndices(m, t)) {
      const clip = p.clips[i];
      const asset = m.assets.get(clip.assetId);
      if (asset?.kind === 'video') await frames.next(clip);
      else if (asset) await media.ensureImage(asset.id);
    }
    await Promise.all(imagesNeededAt(m, t).map((id) => media.ensureImage(id)));
    renderFrame(ctx, m, t, src, W, H);
    await vsrc.add(t, 1 / fps);
    if (f % 15 === 0) {
      const el = (performance.now() - started) / 1000;
      const eta = f ? (el / f) * (total - f) : 0;
      onProgress({ stage: `Rendering frame ${f}/${total} · ETA ${Math.ceil(eta)}s`, progress: f / total });
    }
  }
  onProgress({ stage: 'Finalizing', progress: 1 });
  await output.finalize();
  return new Blob([output.target.buffer!], { type: webm ? 'video/webm' : 'video/mp4' });
}

/** Explicit video bitrate: 8 / 5 / 2.5 Mbps at 1080p30, scaled by pixel count and frame rate. */
export function videoBitrate(p: Project, W: number, H: number) {
  const base = { high: 8e6, medium: 5e6, low: 2.5e6 }[p.export.quality];
  return Math.round(base * Math.max(0.25, (W * H) / (1920 * 1080)) * Math.max(1, p.export.fps / 30) ** 0.6);
}

/** Export just the audio mix as a WAV file. */
export async function exportAudio(p: Project) {
  const buf = await renderMix(p, 48000);
  const ch = buf.numberOfChannels, len = buf.length;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, 48000, true);
  data.setUint32(28, 48000 * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  for (let i = 0, o = 44; i < len; i++) for (let c = 0; c < ch; c++, o += 2) data.setInt16(o, Math.max(-1, Math.min(1, chans[c][i])) * 0x7fff, true);
  return new Blob([data.buffer], { type: 'audio/wav' });
}
