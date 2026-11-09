import { useEffect, useMemo, useState } from 'react';
import { useEditor } from '../store';
import { buildLines } from '../lib/captions';
import { makeModel } from '../render/renderer';
import { media } from '../render/media';
import { beatsFor } from '../audio/beats';
import type { Project } from '../types';

export const useProject = () => useEditor((s) => s.project!);

export function useLines() {
  const p = useProject();
  return useMemo(() => buildLines(p.words, p.lines, p.captions), [p.words, p.lines, p.captions]);
}

export function useBeats() {
  const p = useProject();
  const [beats, setBeats] = useState<number[]>([]);
  const key = `${p.audio.map((c) => `${c.assetId}@${c.start}`).join(',')}|${p.clips.some((c) => c.regions?.some((r) => r.trigger === 'beats'))}`;
  useEffect(() => {
    let live = true;
    beatsFor(p).then((b) => live && setBeats(b));
    return () => void (live = false);
  }, [key]);
  return beats;
}

export function useModel() {
  const p = useProject();
  const lines = useLines();
  const beats = useBeats();
  return useMemo(() => makeModel(p, lines, beats), [p, lines, beats]);
}

/** Apply an edit to the selected clip(s), or to every clip when none is selected. */
export function useClipTarget() {
  const sel = useEditor((s) => s.selection);
  const multi = useEditor((s) => s.multi);
  const update = useEditor((s) => s.update);
  const ids = sel?.kind === 'clip' ? new Set([sel.id, ...multi]) : new Set(multi);
  const selectedId = sel?.kind === 'clip' ? sel.id : null;
  return {
    selectedId,
    count: ids.size,
    apply: (fn: (c: Project['clips'][number]) => void, all = ids.size === 0, key?: string) =>
      update((p) => p.clips.forEach((c) => (all || ids.has(c.id)) && fn(c)), key),
  };
}

export function useThumb(id: string | undefined, kind: 'image' | 'video' | 'audio' | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!id || (kind !== 'image' && kind !== 'video')) return;
    let live = true;
    media.thumb(id, kind).then((u) => live && setUrl(u)).catch(() => {});
    return () => void (live = false);
  }, [id, kind]);
  return url;
}
