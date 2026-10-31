/// <reference lib="webworker" />
import { AutoProcessor, RawImage, SamModel, pipeline } from '@huggingface/transformers';

const DEPTH_MODEL = 'onnx-community/depth-anything-v2-small';
const SAM_MODEL = 'Xenova/slimsam-77-uniform';

type Req =
  | { id: number; type: 'depth'; image: Blob }
  | { id: number; type: 'embed'; key: string; image: Blob }
  | { id: number; type: 'mask'; key: string; points: [number, number][]; labels: number[] };

type Device = 'webgpu' | 'wasm';
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

let gpu: boolean | undefined;
/** WebGPU when available; a model falls back to WASM (CPU) for good after a GPU failure (e.g. device lost). */
const forced: Record<'depth' | 'sam', Device | undefined> = { depth: undefined, sam: undefined };
async function deviceFor(kind: 'depth' | 'sam'): Promise<Device> {
  if (forced[kind]) return forced[kind]!;
  gpu ??= !!((navigator as any).gpu && (await (navigator as any).gpu.requestAdapter().catch(() => null)));
  return gpu ? 'webgpu' : 'wasm';
}

const progress = (label: string) => (p: any) => {
  if (p.status === 'progress' && p.total) post({ type: 'progress', label, value: p.loaded / p.total, file: p.file });
};

let depthPipe: Promise<any> | undefined;
let sam: Promise<{ model: any; processor: any }> | undefined;
const embeddings = new Map<string, { image: RawImage; emb: any }>();

async function toPng(img: RawImage): Promise<Blob> {
  const rgba = img.channels === 4 ? img : img.rgba();
  const c = new OffscreenCanvas(rgba.width, rgba.height);
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba.data), rgba.width, rgba.height), 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}

async function depth(image: Blob) {
  const dev = await deviceFor('depth');
  depthPipe ??= pipeline('depth-estimation', DEPTH_MODEL, { device: dev, dtype: dev === 'webgpu' ? 'fp16' : 'q8', progress_callback: progress('Depth model') });
  const out = await (await depthPipe)(await RawImage.fromBlob(image));
  return { blob: await toPng(out.depth), device: dev };
}

async function samModel() {
  const dev = await deviceFor('sam');
  sam ??= (async () => ({
    model: await SamModel.from_pretrained(SAM_MODEL, { device: dev, dtype: dev === 'webgpu' ? 'fp32' : 'q8', progress_callback: progress('Object selector') }),
    processor: await AutoProcessor.from_pretrained(SAM_MODEL),
  }))();
  return sam;
}

async function embed(key: string, image: Blob) {
  if (embeddings.has(key)) return { ok: true, device: await deviceFor('sam') };
  const { model, processor } = await samModel();
  const img = await RawImage.fromBlob(image);
  const inputs = await processor(img);
  embeddings.set(key, { image: img, emb: await model.get_image_embeddings(inputs) });
  while (embeddings.size > 3) embeddings.delete(embeddings.keys().next().value!);
  return { ok: true, device: await deviceFor('sam') };
}

async function mask(key: string, points: [number, number][], labels: number[]) {
  const { model, processor } = await samModel();
  const e = embeddings.get(key);
  if (!e) throw new Error('Image not prepared');
  const { width: W, height: H } = e.image;
  const inputs = await processor(e.image, { input_points: [points.map(([x, y]) => [x * W, y * H])], input_labels: [labels] });
  const out = await model({ ...e.emb, input_points: inputs.input_points, input_labels: inputs.input_labels });
  const masks = await processor.post_process_masks(out.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
  const scores: Float32Array = out.iou_scores.data;
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  const m = masks[0];
  const [, , mh, mw] = m.dims;
  const data: Uint8Array = m.data;
  const rgba = new Uint8ClampedArray(mw * mh * 4);
  const off = best * mw * mh;
  for (let i = 0; i < mw * mh; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = data[off + i] ? 255 : 0;
  }
  const c = new OffscreenCanvas(mw, mh);
  c.getContext('2d')!.putImageData(new ImageData(rgba, mw, mh), 0, 0);
  return { blob: await c.convertToBlob({ type: 'image/png' }), score: scores[best] };
}

async function handle(r: Req) {
  if (r.type === 'depth') return depth(r.image);
  if (r.type === 'embed') return embed(r.key, r.image);
  return mask(r.key, r.points, r.labels);
}

self.onmessage = async (ev: MessageEvent<Req | { type: 'cpu' }>) => {
  const r = ev.data;
  // Once WebGPU fails, onnxruntime can't recover in this worker — the main thread restarts us in CPU mode.
  if (r.type === 'cpu') return void (forced.depth = forced.sam = 'wasm');
  try {
    post({ type: 'result', id: r.id, result: await handle(r) });
  } catch (e) {
    post({ type: 'error', id: r.id, error: (e as Error).message, gpu: (await deviceFor(r.type === 'depth' ? 'depth' : 'sam')) === 'webgpu' });
  }
};
