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
