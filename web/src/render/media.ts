import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { loadBlob } from '../lib/db';

/** Image cache limits — tuned by the performance profile (see lib/perf.ts). */
export const mediaLimits = { maxDim: 1920, lru: 30 };

/** Loads project media from IndexedDB and keeps bounded caches for rendering. */
class MediaCache {
  private blobs = new Map<string, Promise<Blob | undefined>>();
  private urls = new Map<string, string>();
  private images = new Map<string, ImageBitmap>();
  private pendingImages = new Map<string, Promise<ImageBitmap | undefined>>();
  private videos = new Map<string, HTMLVideoElement>();
  private audio = new Map<string, Promise<AudioBuffer | undefined>>();
  private thumbs = new Map<string, Promise<string | undefined>>();
  private listeners = new Set<() => void>();
  private decodeCtx?: AudioContext;

  onLoad(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  blob(id: string) {
    if (!this.blobs.has(id)) this.blobs.set(id, loadBlob(id));
    return this.blobs.get(id)!;
  }

  async url(id: string) {
    if (this.urls.has(id)) return this.urls.get(id)!;
    const b = await this.blob(id);
    if (!b) return undefined;
    const u = URL.createObjectURL(b);
    this.urls.set(id, u);
    return u;
  }

  /** Synchronous lookup for the render loop; kicks off a load when missing. */
  image(id: string): ImageBitmap | undefined {
    const img = this.images.get(id);
    if (img) {
      this.images.delete(id);
      this.images.set(id, img);
      return img;
    }
    void this.ensureImage(id);
    return undefined;
  }

  ensureImage(id: string) {
    if (this.images.has(id)) return Promise.resolve(this.images.get(id));
    if (!this.pendingImages.has(id)) {
      this.pendingImages.set(id, (async () => {
        const b = await this.blob(id);
        if (!b) return undefined;
        const probe = await createImageBitmap(b);
        const s = Math.min(1, mediaLimits.maxDim / Math.max(probe.width, probe.height));
        const bmp = s < 1 ? await createImageBitmap(probe, { resizeWidth: Math.round(probe.width * s), resizeHeight: Math.round(probe.height * s), resizeQuality: 'high' }) : probe;
        if (bmp !== probe) probe.close();
        this.images.set(id, bmp);
        while (this.images.size > mediaLimits.lru) {
          const [k, v] = this.images.entries().next().value!;
          v.close();
          this.images.delete(k);
        }
        this.pendingImages.delete(id);
        this.listeners.forEach((l) => l());
        return bmp;
      })());
    }
    return this.pendingImages.get(id)!;
  }

  /** A muted <video> element used for preview frames. */
  /** asset id → proxy blob id (preview only). */
  proxies = new Map<string, string>();
  setProxies(map: Map<string, string>) {
    for (const [id, px] of map) if (this.proxies.get(id) !== px) this.videos.delete(id);
    this.proxies = map;
  }

  video(id: string): HTMLVideoElement {
    let v = this.videos.get(id);
    if (!v) {
      v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      this.videos.set(id, v);
      void this.url(this.proxies.get(id) ?? id).then((u) => u && (v!.src = u));
      v.addEventListener('seeked', () => this.listeners.forEach((l) => l()));
      v.addEventListener('loadeddata', () => this.listeners.forEach((l) => l()));
    }
    return v;
  }

  allVideos() {
    return [...this.videos.entries()];
  }

  audioBuffer(id: string) {
    if (!this.audio.has(id)) {
      this.audio.set(id, (async () => {
        const b = await this.blob(id);
        if (!b) return undefined;
        this.decodeCtx ??= new AudioContext();
        try {
          return await this.decodeCtx.decodeAudioData(await b.arrayBuffer());
        } catch {
          return undefined;
        }
      })());
    }
    return this.audio.get(id)!;
  }

  /** Small preview image (object URL for images, a decoded frame for videos). */
  thumb(id: string, kind: 'image' | 'video'): Promise<string | undefined> {
    if (!this.thumbs.has(id)) {
      this.thumbs.set(id, (async () => {
        if (kind === 'image') return this.url(id);
        const b = await this.blob(id);
        if (!b) return undefined;
        const input = new Input({ source: new BlobSource(b), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (!track) return undefined;
        const sink = new CanvasSink(track, { width: 240 });
        const start = await track.getFirstTimestamp();
        const c = await sink.getCanvas(start + 0.3);
        if (!c) return undefined;
        const cv = c.canvas;
        const blob = cv instanceof HTMLCanvasElement
          ? await new Promise<Blob>((r) => cv.toBlob((x) => r(x!), 'image/jpeg', 0.7))
          : await cv.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
        return URL.createObjectURL(blob);
      })());
    }
    return this.thumbs.get(id)!;
  }

  reset() {
    this.images.forEach((i) => i.close());
    this.images.clear();
    this.videos.forEach((v) => v.removeAttribute('src'));
    this.videos.clear();
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls.clear();
    this.blobs.clear();
    this.audio.clear();
    this.thumbs.clear();
    this.pendingImages.clear();
  }
}

export const media = new MediaCache();

/** Peak data for waveform drawing. */
export function peaks(buf: AudioBuffer, buckets: number) {
  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / buckets));
  const out = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    let m = 0;
    for (let j = i * step, e = Math.min(data.length, j + step); j < e; j += 16) m = Math.max(m, Math.abs(data[j]));
    out[i] = m;
  }
  return out;
}
