import type { ParallaxCamera } from './motion';

let cv: HTMLCanvasElement | undefined;
/** How far the background moves compared with the subject (0 = still, 1 = same as the subject). */
export const BG_FOLLOW = 0.18;

/**
 * Layers mode: the filled-in background moves a little, the cut-out subject moves as a rigid layer — nothing is
 * stretched. Same camera as the depth shader (offset = fraction of the frame, push = extra scale of near things).
 */
export function renderLayers(bg: CanvasImageSource & { width: number; height: number }, fg: CanvasImageSource, cam: ParallaxCamera, maxDim = 1920) {
  const s = Math.min(1, Math.max(640, maxDim) / Math.max(bg.width, bg.height));
  const W = Math.round(bg.width * s), H = Math.round(bg.height * s);
  cv ??= document.createElement('canvas');
  if (cv.width !== W || cv.height !== H) (cv.width = W), (cv.height = H);
  const g = cv.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingQuality = 'high';
  const layer = (img: CanvasImageSource, follow: number, push: number) => {
    const z = cam.zoom * (1 + push);
    g.setTransform(z, 0, 0, z, W / 2 + cam.ox * follow * W, H / 2 + cam.oy * follow * H);
    g.drawImage(img, -W / 2, -H / 2, W, H);
  };
  layer(bg, BG_FOLLOW, cam.push * BG_FOLLOW);
  layer(fg, 1, cam.push);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return cv;
}
