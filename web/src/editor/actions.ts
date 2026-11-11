/** Timeline actions used by the toolbar, keyboard shortcuts and the Properties panel. */
import { splitGroup } from '../motion/edit';
import { addVideoTrack, newPip, splitPip } from '../lib/pip';
import { addTrack, newAudioClip, resolveOverlap } from '../lib/audiotracks';
import { insertAssetAt } from './MediaPanel';
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
    if (sel?.kind === 'audio') ok = !d.audioTracks.find((x) => x.id === d.audio.find((c) => c.id === sel.id)?.trackId)?.locked && splitAudio(d, sel.id, t);
    else if (sel?.kind === 'overlay') ok = splitOverlay(d, sel.id, t);
    else if (sel?.kind === 'pip') ok = splitPip(d, sel.id, t);
    else if (sel?.kind === 'motion') ok = !!splitGroup(d, sel.id.split('/')[0], t);
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
    for (const c of [...d.audio]) if (!d.audioTracks.find((t) => t.id === c.trackId)?.locked && c.start < time - 0.05 && c.start + c.duration > time + 0.05 && splitAudio(d, c.id, time)) n++;
    for (const o of [...d.overlays]) if (o.start < time - 0.1 && o.start + o.duration > time + 0.1 && splitOverlay(d, o.id, time)) n++;
    for (const o of [...d.pips]) if (o.start < time - 0.1 && o.start + o.duration > time + 0.1 && splitPip(d, o.id, time)) n++;
    for (const g of [...(d.motion ?? [])]) if (splitGroup(d, g.id, time)) n++;
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
  update((d) => void (id = detachAudio(d, selection.id, true)));
  if (id) {
    select({ kind: 'audio', id });
    toast('Sound separated onto its own track, linked to the video (it follows the clip). Unlink it in Properties to move it freely.', 'ok');
  } else toast('Only video clips with sound can be detached', 'info');
}

export const ASSET_MIME = 'application/x-asset';

/** After "Remove music / keep voice": the clip plays the voice; the background goes to a muted track right under it. */
export async function splitVoiceBackground(clipId: string, vocals: Blob, background: Blob) {
  const p = useEditor.getState().project!;
  const c = p.audio.find((x) => x.id === clipId)!;
  const base = (findAsset(p, c.assetId)?.name ?? 'audio').replace(/\.[^.]+$/, '');
  const va = await probe(vocals, `${base}_voice.wav`, 'audio');
  const ba = await probe(background, `${base}_background.wav`, 'audio');
  useEditor.getState().update((d) => {
    d.assets.push(va, ba);
    const x = d.audio.find((y) => y.id === clipId)!;
    const tid = addTrack(d, 'other', 'Background', x.trackId);
    d.audioTracks.find((t) => t.id === tid)!.muted = true;
    d.audio.push({ ...newAudioClip(tid, ba.id, x.start, x.duration, 'other'), trimIn: 0, volume: x.volume, duck: false });
    Object.assign(x, { assetId: va.id, trimIn: 0, rate: undefined });
  });
  toast('Voice kept on this clip; the background (music / ambience) is on a muted “Background” track under it.', 'ok');
}

/** The part of a clip's file that is heard on the timeline, as WAV bytes. */
export async function clipAudioWav(clipId: string): Promise<ArrayBuffer | null> {
  const p = useEditor.getState().project!;
  const c = p.audio.find((x) => x.id === clipId);
  const buf = c && (await media.audioBuffer(c.assetId));
  if (!c || !buf) return null;
  const sr = buf.sampleRate, a = Math.floor(c.trimIn * sr), n = Math.min(buf.length - a, Math.ceil(c.duration * (c.rate ?? 1) * sr));
  const out = new AudioBuffer({ length: Math.max(1, n), numberOfChannels: buf.numberOfChannels, sampleRate: sr });
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.copyToChannel(buf.getChannelData(ch).subarray(a, a + n), ch);
  return encodeWav(out).arrayBuffer();
}

/** Put a new rendering of a clip (re-voice / re-generate) on a new track right under it; the original is kept silent. */
export async function addReplacementTake(clipId: string, wav: Blob, name: string) {
  const asset = await probe(wav, name, 'audio');
  let tname = '';
  useEditor.getState().update((d) => {
    d.assets.push(asset);
    const src = d.audio.find((x) => x.id === clipId)!;
    const kind = d.audioTracks.find((t) => t.id === src.trackId)?.kind ?? 'voice';
    const tid = addTrack(d, kind, undefined, src.trackId);
    d.audio.push(newAudioClip(tid, asset.id, src.start, asset.duration ?? src.duration, kind));
    if (d.narrationTrackId === src.trackId && !d.audio.some((o) => o.trackId === src.trackId && o.id !== src.id)) d.narrationTrackId = tid;
    src.volume = 0;
    tname = d.audioTracks.find((t) => t.id === tid)!.name;
  });
  toast(`New version added on “${tname}” — the original is kept (volume 0). Check captions with “Fix” if they drift.`, 'ok');
}

/** Replace the audio of one clip with a processed copy of its file (the original file stays; Undo restores). */
export async function processClipAudio(clipId: string, label: string, fn: (b: AudioBuffer) => Promise<AudioBuffer>) {
  const p = useEditor.getState().project!;
  const c = p.audio.find((x) => x.id === clipId);
  const a = c && findAsset(p, c.assetId);
  const buf = a && (await media.audioBuffer(a.id));
  if (!c || !a || !buf) return toast('Could not read this audio', 'error');
  const out = await fn(buf);
  const asset = await probe(encodeWav(out), a.name.replace(/(_[a-z]+)?(\.[^.]+)?$/, `_${label}.wav`), 'audio');
  useEditor.getState().update((d) => {
    d.assets.push(asset);
    const x = d.audio.find((y) => y.id === clipId);
    if (!x) return;
    // Same timing, new file: captions bound to this clip's file follow the new id.
    for (const w of [...d.words, ...d.lines.flatMap((l) => l.words), ...d.typo.flatMap((b) => b.words)]) if (w.src?.a === x.assetId && !d.audio.some((o) => o.id !== x.id && o.assetId === x.assetId)) w.src.a = asset.id;
    x.assetId = asset.id;
  });
}

/**
 * Put a media item where it was dropped. `target`: 'video' (main track), 'v:<id>' (overlay track) or an audio track id;
 * unknown / mismatched targets fall back to the main track (visuals) or the first track of the right kind (audio).
 */
export function dropAssetAt(assetId: string, t: number, target?: string) {
  const { project: p, update, select } = useEditor.getState();
  const a = p && findAsset(p, assetId);
  if (!p || !a) return;
  const time = Math.max(0, t);
  if (a.kind !== 'audio') {
    if (target?.startsWith('v:')) {
      const tid = target.slice(2);
      let id = '';
      update((d) => {
        const c = newPip(tid, a.id, time, a.kind === 'video' ? Math.min(a.duration ?? 4, 8) : 4, 'corner');
        if (d.pips.some((o) => o.trackId === tid && o.start < c.start + c.duration && o.start + o.duration > c.start)) c.trackId = addVideoTrack(d, tid);
        d.pips.push(c);
        id = c.id;
      });
      return select({ kind: 'pip', id });
    }
    return update((d) => insertAssetAt(d, a.id, time));
  }
  let moved = '';
  let id = '';
  update((d) => {
    const tr = d.audioTracks.find((x) => x.id === target) ?? d.audioTracks.find((x) => x.kind === 'music') ?? d.audioTracks[0];
    const c = newAudioClip(tr.id, a.id, time, a.duration ?? 5, tr.kind);
    d.audio.push(c);
    id = c.id;
    moved = resolveOverlap(d, c.id);
  });
  select({ kind: 'audio', id });
  if (moved) toast(`That spot was taken — added on “${moved}”`, 'info');
}
