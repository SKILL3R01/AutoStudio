/** Face detection on this PC (MediaPipe Face Detector, Apache-2.0; wasm + BlazeFace model bundled with the app, CPU). */
import { FaceDetector } from '@mediapipe/tasks-vision';

// The wasm runtime is copied to public/mediapipe (the package does not export it); the model to public/models.
const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
const wasmLoaderPath = `${base}mediapipe/vision_wasm_internal.js`, wasmBinaryPath = `${base}mediapipe/vision_wasm_internal.wasm`;

export type FaceBox = [x: number, y: number, w: number, h: number, score: number];

let det: Promise<FaceDetector> | null = null;
function detector() {
  det ??= FaceDetector.createFromOptions({ wasmLoaderPath, wasmBinaryPath }, {
    baseOptions: { modelAssetPath: `${base}models/blaze_face_short_range.tflite`, delegate: 'CPU' },
    runningMode: 'IMAGE',
    minDetectionConfidence: 0.5,
  }).catch((e) => {
    det = null;
    throw e;
  });
  return det;
}

/** Faces in a canvas: boxes normalised to 0..1 (left, top, width, height, score), biggest first. */
export async function detectFaces(c: HTMLCanvasElement | OffscreenCanvas): Promise<FaceBox[]> {
  const d = await detector();
  const W = c.width, H = c.height;
  const r = d.detect(c as HTMLCanvasElement);
  return r.detections
    .map((x) => x.boundingBox && ([x.boundingBox.originX / W, x.boundingBox.originY / H, x.boundingBox.width / W, x.boundingBox.height / H, x.categories[0]?.score ?? 0] as FaceBox))
    .filter((b): b is FaceBox => !!b && b[2] > 0.02)
    .sort((a, b) => b[2] * b[3] - a[2] * a[3]);
}
