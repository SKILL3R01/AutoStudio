import { create } from 'zustand';

/** Download/progress state of the in-browser vision models, for UI display. */
export const useVision = create<{ label: string; value: number; device?: string }>(() => ({ label: '', value: 0 }));

let worker: Worker | undefined;
let cpuOnly = false;
let n = 0;
const pending = new Map<number, { res: (v: any) => void; rej: (e: Error & { gpu?: boolean }) => void }>();
/** Images prepared for segmentation, so a restarted worker can re-embed them. */
const prepared = new Map<string, Blob>();

function w() {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    if (cpuOnly) worker.postMessage({ type: 'cpu' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') return useVision.setState({ label: m.label, value: m.value });
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      useVision.setState({ label: '', value: 0 });
      if (m.type === 'error') {
        console.error('[vision]', m.error);
        p.rej(Object.assign(new Error(m.error), { gpu: m.gpu }));
      } else p.res(m.result);
    };
  }
  return worker;
}

const raw = <T,>(msg: object): Promise<T> =>
  new Promise((res, rej) => {
    const id = ++n;
    pending.set(id, { res, rej });
    w().postMessage({ ...msg, id });
  });

/** Call the worker; if WebGPU fails, restart it in CPU (WASM) mode and retry once. */
async function call<T>(msg: { type: string; key?: string; [k: string]: unknown }): Promise<T> {
  try {
    return await raw<T>(msg);
  } catch (e) {
    if (!(e as { gpu?: boolean }).gpu || cpuOnly) throw e;
    cpuOnly = true;
    worker?.terminate();
    worker = undefined;
    useVision.setState({ label: 'GPU failed — retrying on CPU', value: 0, device: 'wasm' });
    if (msg.type === 'mask' && msg.key && prepared.has(msg.key)) await raw({ type: 'embed', key: msg.key, image: prepared.get(msg.key) });
    return raw<T>(msg);
  }
}

/** Models work at ≤1024 px anyway; sending smaller images saves GPU memory and transfer time. */
async function shrink(image: Blob, max = 1024): Promise<Blob> {
  const bmp = await createImageBitmap(image);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (s === 1) return bmp.close(), image;
  const c = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.convertToBlob({ type: 'image/png' });
}

/** Depth Anything V2 (small): grayscale PNG, white = near. */
export async function estimateDepth(image: Blob): Promise<Blob> {
  const r = await call<{ blob: Blob; device: string }>({ type: 'depth', image: await shrink(image) });
  useVision.setState({ device: r.device });
  return r.blob;
}

/** Prepare SlimSAM for an image (runs the encoder once). */
export async function prepareSegment(key: string, image: Blob) {
  const small = await shrink(image);
  prepared.set(key, small);
  while (prepared.size > 3) prepared.delete(prepared.keys().next().value!);
  const r = await call<{ ok: boolean; device: string }>({ type: 'embed', key, image: small });
  useVision.setState({ device: r.device });
  return r;
}

/** Mask PNG for clicks (normalised x/y), label 1 = include, 0 = exclude. */
export const segmentAt = (key: string, points: [number, number][], labels: number[]) =>
  call<{ blob: Blob; score: number }>({ type: 'mask', key, points, labels });

/** CLIP image vectors (unit length, 512-d) — images are shrunk to 336 px first (the model uses 224). */
export async function clipEmbedImages(images: Blob[]): Promise<Float32Array[]> {
  const small = await Promise.all(images.map((b) => shrink(b, 336)));
  return (await call<{ vectors: Float32Array[] }>({ type: 'clipImages', images: small })).vectors;
}

/** CLIP text vectors (unit length) in the same space as the image vectors. */
export async function clipEmbedText(texts: string[]): Promise<Float32Array[]> {
  return (await call<{ vectors: Float32Array[] }>({ type: 'clipText', texts })).vectors;
}

/** 16 kHz mono samples for Whisper. */
async function to16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  void ctx.close();
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

/** Word-level transcript on this PC (Whisper base = fast, small = accurate). No engine needed. */
export async function transcribeLocal(audio: Blob, model: 'base' | 'small' = 'base', language = 'auto'): Promise<{ words: { text: string; start: number; end: number }[]; text: string }> {
  const samples = await to16k(audio);
  return call({ type: 'transcribe', audio: samples, model, language });
}

/** Natural preset English voices (Kokoro) — instant drafts, no install. */
export const KOKORO_VOICES: [string, string][] = [
  ['af_heart', 'Heart (US, female)'], ['af_bella', 'Bella (US, female)'], ['af_nicole', 'Nicole (US, soft)'], ['am_michael', 'Michael (US, male)'],
  ['am_fenrir', 'Fenrir (US, deep)'], ['am_puck', 'Puck (US, lively)'], ['bf_emma', 'Emma (UK, female)'], ['bm_george', 'George (UK, male)'],
];
export const speakDraft = (text: string, voice = 'af_heart', speed = 1) => call<{ wav: Blob; seconds: number }>({ type: 'kokoro', text, voice, speed });
