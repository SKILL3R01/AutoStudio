/** Timeline actions used by the toolbar, keyboard shortcuts and the Properties panel. */
import { useEditor, findAsset } from '../store';
import { media } from '../render/media';
import { cutBuffer, encodeWav } from '../audio/silence';
import { probe } from '../lib/project';
import { toast } from '../components/Toast';
import {
  applyCuts, clipboardEnd, copyItems, detachAudio, pasteItems, rippleDeleteClips, splitClipAt, splitMusic, splitOverlay, splitVoice, voiceSegments,
  type ClipboardData,
} from './edit';

let clipboard: ClipboardData | null = null;
export const hasClipboard = () => !!clipboard;

const voiceDuration = () => {
  const p = useEditor.getState().project!;
  return (p.voiceover && findAsset(p, p.voiceover.assetId)?.duration) || 0;
};

/** S: split the selected music / text / narration at the playhead, otherwise the clip under the playhead. */
export function splitAtPlayhead() {
  const { project: p, time, selection: sel, update } = useEditor.getState();
  if (!p) return;
  let ok = false;
  update((d) => {
    if (sel?.kind === 'music') ok = splitMusic(d, sel.id, time);
    else if (sel?.kind === 'overlay') ok = splitOverlay(d, sel.id, time);
    else if (sel?.kind === 'voice') ok = splitVoice(d, time, voiceDuration());
    else ok = splitClipAt(d, time);
  });
  if (!ok) toast('Move the playhead inside the item to split it', 'info');
}

/** Split the narration at the playhead (from the voice lane). */
export function splitVoiceAtPlayhead() {
  const { time, update } = useEditor.getState();
  update((d) => void splitVoice(d, time, voiceDuration()));
}

/** Shift+Delete: remove and close the gap (clips), or cut the selected narration segment out. */
export async function rippleDelete() {
  const { project: p, selection: sel, multi, update, select } = useEditor.getState();
  if (!p) return;
  if (sel?.kind === 'voice') return void (await deleteVoiceSegment(+sel.id));
  const ids = new Set([...(sel?.kind === 'clip' ? [sel.id] : []), ...multi]);
  if (!ids.size) return toast('Select clips to ripple-delete', 'info');
  if (ids.size >= p.clips.length) return toast('Keep at least one clip', 'info');
  update((d) => rippleDeleteClips(d, ids));
  select(null);
  toast(p.voiceover ? 'Removed — following clips moved earlier (the narration stays)' : 'Removed — everything after moved earlier', 'ok');
}

/** Cut a narration segment out of the voice file; everything after it moves earlier (one undo step). */
export async function deleteVoiceSegment(index: number) {
  const p = useEditor.getState().project!;
  const vo = p.voiceover && findAsset(p, p.voiceover.assetId);
  if (!vo) return;
  const seg = voiceSegments(p, vo.duration ?? 0)[index];
  const buf = await media.audioBuffer(vo.id);
  if (!seg || !buf) return toast('Could not read the voiceover', 'error');
  if (seg.end - seg.start >= buf.duration - 0.05) return toast('Split the narration first, then delete a part', 'info');
  const asset = await probe(encodeWav(cutBuffer(buf, [seg])), vo.name.replace(/(_cut)?(\.[^.]+)?$/, '_cut.wav'), 'audio');
  useEditor.getState().update((d) => {
    d.assets.push(asset);
    applyCuts(d, [seg], asset.id);
  });
  useEditor.getState().select(null);
  toast(`Cut ${(seg.end - seg.start).toFixed(1)} s of narration — captions and clips moved with it (Undo restores)`, 'ok');
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
    select({ kind: 'music', id });
    toast('Sound moved to the music lane — trim, fade or delete it there', 'ok');
  } else toast('Only video clips with sound can be detached', 'info');
}
