import type { CaptionLine, Project } from '../types';
import { media } from '../render/media';
import { activeClipIndices, makeModel, outputSize, renderFrame, type Drawable, type FrameSource } from '../render/renderer';
import { saveThumb } from './db';

/** Render a small poster frame of the project and store it for the projects gallery. */
export async function updateThumbnail(p: Project, lines: CaptionLine[]) {
  if (!p.clips.length) return;
  const m = makeModel(p, lines);
  const t = Math.min(m.length * 0.3, Math.max(1.2, p.sceneFades.fadeIn + 0.3));
  const { W, H } = outputSize(p, 480);
  const videoFrames = new Map<string, Drawable>();
  for (const i of activeClipIndices(m, t)) {
    const a = m.assets.get(p.clips[i].assetId);
    if (a?.kind === 'image') await media.ensureImage(a.id);
    if (a?.kind === 'video') {
      const url = await media.thumb(a.id, 'video');
      if (url) {
        const img = new Image();
        img.src = url;
        await img.decode().catch(() => {});
        videoFrames.set(a.id, await createImageBitmap(img));
      }
    }
  }
  const src: FrameSource = {
    clip: (_c, asset) => (asset.kind === 'video' ? videoFrames.get(asset.id) : media.image(asset.id)),
    image: (id) => media.image(id),
  };
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  renderFrame(c.getContext('2d')!, m, t, src, W, H);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.78));
  if (blob) await saveThumb(p.id, blob);
}
