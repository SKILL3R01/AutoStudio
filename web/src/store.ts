import { create } from 'zustand';
import type { Project } from './types';
import { saveProject } from './lib/db';

export type Selection = { kind: 'clip' | 'overlay' | 'music' | 'sfx' | 'keyword'; id: string } | null;

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
  setZoom: (z: number) => void;
}

let saveTimer: number | undefined;
let lastCoalesce = '';
let lastCoalesceAt = 0;

const persist = (p: Project) => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveProject(p), 400);
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
  setZoom: (zoom) => set({ zoom }),
}));

/** Narration end on the timeline (0 without a voiceover). */
export const voiceEnd = (p: Project) => {
  const vo = p.voiceover && p.assets.find((a) => a.id === p.voiceover!.assetId);
  return vo?.duration ? (p.voiceStart ?? 0) + vo.duration : 0;
};

/** Total length: intro + narration + outro, or the explicit length when there is no voiceover. */
export const projectLength = (p: Project) => {
  const ve = voiceEnd(p);
  return Math.max(0.1, ve ? ve + (p.tail ?? 0) : p.length);
};

/** Clip i spans [clips[i].start, clips[i+1].start) — the last one runs to the project end. */
export const clipEnd = (p: Project, i: number) => (i + 1 < p.clips.length ? p.clips[i + 1].start : projectLength(p));

export const findAsset = (p: Project, id: string) => p.assets.find((a) => a.id === id);
