/** Timeline actions used by the toolbar, keyboard shortcuts and the Properties panel. */
import { splitPip } from '../lib/pip';
import { useEditor, findAsset } from '../store';
import { media } from '../render/media';
import { cutBuffer, encodeWav } from '../audio/silence';
import { probe } from '../lib/project';
import { toast } from '../components/Toast';
import {
  applyCuts, clipboardEnd, copyItems, detachAudio, pasteItems, rippleDeleteClips, splitAudio, splitClipAt, splitOverlay,
  type ClipboardData,
} from './edit';

let clipboard: ClipboardData | null = null;
export const hasClipboard = () => !!clipboard;

/** S: split the selected audio / text at the playhead, otherwise the clip under the playhead. */
export function splitAtPlayhead(at?: number) {
  const { project: p, time, selection: sel, update } = useEditor.getState();
  if (!p) return;
  const t = at ?? time;
  let ok = false;
  update((d) => {
    if (sel?.kind === 'audio') ok = splitAudio(d, sel.id, t);
    else if (sel?.kind === 'overlay') ok = splitOverlay(d, sel.id, t);
    else if (sel?.kind === 'pip') ok = splitPip(d, sel.id, t);
    else ok = splitClipAt(d, t);
  });
  if (!ok) toast('Put the playhead (or the mouse) inside the item to split it', 'info');
}

/** Scissors: split every item under the playhead on every track (main clip, audio, text). */
export function splitAllAtPlayhead() {
  const { project: p, time, update } = useEditor.getState();
  if (!p) return;
  let n = 0;
  update((d) => {
    if (splitClipAt(d, time)) n++;
    for (const c of [...d.audio]) if (c.start < time - 0.05 && c.start + c.duration > time + 0.05 && splitAudio(d, c.id, time)) n++;
    for (const o of [...d.overlays]) if (o.start < time - 0.1 && o.start + o.duration > time + 0.1 && splitOverlay(d, o.id, time)) n++;
    for (const o of [...d.pips]) if (o.start < time - 0.1 && o.start + o.duration > time + 0.1 && splitPip(d, o.id, time)) n++;
  });
  toast(n ? `Split ${n} item${n > 1 ? 's' : ''} at the playhead` : 'Nothing under the playhead to split', n ? 'ok' : 'info');
}

/** Shift+Delete: remove clips and close the gap; audio clips are removed and the following audio on that track moves earlier. */
export async function rippleDelete() {
  const { project: p, selection: sel, multi, update, select } = useEditor.getState();
  if (!p) return;
  if (sel?.kind === 'audio') {
    const c = p.audio.find((x) => x.id === sel.id);
    if (!c) return;
    update((d) => {
      d.audio = d.audio.filter((x) => x.id !== c.id);
      d.audio.forEach((x) => x.trackId === c.trackId && x.start >= c.start + c.duration - 0.01 && (x.start -= c.duration));
    });
    select(null);
    return toast('Removed — later audio on that track moved earlier', 'ok');
  }
  const ids = new Set([...(sel?.kind === 'clip' ? [sel.id] : []), ...multi]);
  if (!ids.size) return toast('Select clips to ripple-delete', 'info');
  if (ids.size >= p.clips.length) return toast('Keep at least one clip', 'info');
  update((d) => rippleDeleteClips(d, ids));
  select(null);
  toast('Removed — following clips moved earlier', 'ok');
}

/** Cut a part of a narration file out (Remove silences etc.): everything after it moves earlier. */
export async function cutNarration(assetId: string, cuts: { start: number; end: number }[]) {
  const p = useEditor.getState().project!;
  const vo = findAsset(p, assetId);
  const buf = vo && (await media.audioBuffer(vo.id));
  if (!vo || !buf) return toast('Could not read the voice file', 'error');
  const asset = await probe(encodeWav(cutBuffer(buf, cuts)), vo.name.replace(/(_cut)?(\.[^.]+)?$/, '_cut.wav'), 'audio');
  useEditor.getState().update((d) => {
    d.assets.push(asset);
    applyCuts(d, cuts, asset.id, vo.id);
  });
}

export function copySelection(): boolean {
  const { project: p, selection, multi } = useEditor.getState();
  if (!p) return false;
  const data = copyItems(p, selection, multi);
  if (!data) return false;
  clipboard = data;
  toast(`Copied ${data.items.length} ${data.kind === 'clips' ? 'clip' : 'item'}${data.items.length > 1 ? 's' : ''}`, 'info');
  return true;
}

export function paste(at?: number) {
  const { time, update } = useEditor.getState();
  const data = clipboard;
  if (!data) return toast('Nothing copied yet (Ctrl+C)', 'info');
  update((d) => void pasteItems(d, data, at ?? time));
}

/** Ctrl+D: copy the selection and paste it right after itself. */
export function duplicate() {
  const { project: p, selection, multi, update } = useEditor.getState();
  if (!p) return;
  const data = copyItems(p, selection, multi);
  if (!data) return toast('Select something to duplicate', 'info');
  update((d) => void pasteItems(d, data, clipboardEnd(d, data)));
}

export function detachSelectedAudio() {
  const { selection, update, select } = useEditor.getState();
  if (selection?.kind !== 'clip') return;
  let id: string | null = null;
  update((d) => void (id = detachAudio(d, selection.id)));
  if (id) {
    select({ kind: 'audio', id });
    toast('Sound moved to an audio track — trim, fade or delete it there', 'ok');
  } else toast('Only video clips with sound can be detached', 'info');
}
