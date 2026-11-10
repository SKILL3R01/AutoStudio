import { clipEndOf, narrationEnd, syncLinkedAudio, tidyTracks } from './lib/audiotracks';
import { create } from 'zustand';
import type { Project } from './types';
import { saveProject } from './lib/db';
import { snapshot } from './lib/history';

/** `voice` selections use the segment index as id. */
export type Selection = { kind: 'clip' | 'overlay' | 'audio' | 'keyword' | 'pip'; id: string } | null;

interface EditorState {
  project: Project | null;
  past: Project[];
  future: Project[];
  selection: Selection;
  /** Extra clip ids selected with Shift/Ctrl-click (bulk edits). */
  multi: string[];
  toggleMulti: (id: string) => void;
  time: number;
  playing: boolean;
  zoom: number;
  load: (p: Project) => void;
  close: () => void;
  /** Mutate a draft copy of the project. `coalesce` merges rapid slider edits into one undo step. */
  update: (fn: (draft: Project) => void, coalesce?: string) => void;
  undo: () => void;
  redo: () => void;
  select: (s: Selection) => void;
  setTime: (t: number) => void;
  /** User-initiated jump; restarts the playback clock when playing. */
  seek: (t: number) => void;
  seekId: number;
  setPlaying: (p: boolean) => void;
  /** Snap dragged edges to the playhead, cuts and other items. */
  snap: boolean;
  setSnap: (on: boolean) => void;
  setZoom: (z: number) => void;
}

let saveTimer: number | undefined;
let lastCoalesce = '';
let lastCoalesceAt = 0;

const persist = (p: Project) => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveProject(p).then(() => snapshot(p)), 400);
};

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  past: [],
  future: [],
  selection: null,
  multi: [],
  toggleMulti: (id) => set((s) => ({ multi: s.multi.includes(id) ? s.multi.filter((x) => x !== id) : [...s.multi, id] })),
  time: 0,
  playing: false,
  zoom: 40,
  load: (p) => set({ project: p, past: [], future: [], selection: null, multi: [], time: 0, playing: false }),
  close: () => set({ project: null, past: [], future: [], selection: null, multi: [], playing: false }),
  update: (fn, coalesce) => {
    const cur = get().project;
    if (!cur) return;
    const draft = structuredClone(cur);
    fn(draft);
    syncLinkedAudio(draft);
    tidyTracks(draft);
    draft.updatedAt = Date.now();
    const now = Date.now();
    const merge = coalesce && coalesce === lastCoalesce && now - lastCoalesceAt < 800;
    lastCoalesce = coalesce ?? '';
    lastCoalesceAt = now;
    set((s) => ({ project: draft, past: merge ? s.past : [...s.past.slice(-60), cur], future: [] }));
    persist(draft);
  },
  undo: () => {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future] });
    persist(prev);
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length || !project) return;
    const next = future[0];
    set({ project: next, past: [...past, project], future: future.slice(1) });
    persist(next);
  },
  select: (selection) => set({ selection, multi: [] }),
  setTime: (time) => set({ time }),
  seekId: 0,
  seek: (t) => {
    const p = get().project;
    set((s) => ({ time: Math.max(0, Math.min(p ? projectLength(p) : t, t)), seekId: s.seekId + 1 }));
  },
  setPlaying: (playing) => set({ playing }),
  snap: globalThis.localStorage?.getItem('snap') !== '0',
  setSnap: (snap) => (localStorage.setItem('snap', snap ? '1' : '0'), set({ snap })),
  setZoom: (zoom) => set({ zoom }),
}));

/** Narration end on the timeline (0 without a voiceover). */
export const voiceEnd = (p: Project) => narrationEnd(p);

/** Total length = the end of the last item on any track (main video, overlays, audio, text). */
export const projectLength = (p: Project) =>
  Math.max(
    0.1,
    p.clips.length ? p.length : 0,
    ...p.audio.map(clipEndOf),
    ...p.overlays.map((o) => o.start + o.duration),
    ...(p.pips ?? []).map((o) => o.start + o.duration),
    ...p.typo.map((b) => b.end),
  );

/** Clip i spans [clips[i].start, clips[i+1].start) — the last one runs to the end of the main track (`p.length`). */
export const clipEnd = (p: Project, i: number) => (i + 1 < p.clips.length ? p.clips[i + 1].start : Math.max(p.length, p.clips[i].start + 0.1));

export const findAsset = (p: Project, id: string) => p.assets.find((a) => a.id === id);
