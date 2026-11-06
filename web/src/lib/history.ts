/**
 * Version history: automatic project snapshots (at most one every 2 minutes while editing, last 30 kept) plus named
 * ones before risky actions. Media blobs are shared, so a snapshot is just the project JSON.
 */
import { get, set } from 'idb-keyval';
import type { Project } from '../types';

export interface Snapshot {
  at: number;
  label: string;
  clips: number;
  length: number;
  project: Project;
}

const KEY = (id: string) => `history:${id}`;
export const MAX_SNAPSHOTS = 30;
export const MIN_INTERVAL = 2 * 60_000;

const lengthOf = (p: Project) => Math.max(0, ...p.clips.map((c) => c.start + 3), p.words.at(-1)?.end ?? 0);

/** Pure: add a snapshot to a list (throttled unless `force`), newest first, pruned to MAX_SNAPSHOTS. */
export function addSnapshot(list: Snapshot[], p: Project, label: string, now: number, force = false): Snapshot[] | null {
  if (!force && list[0] && now - list[0].at < MIN_INTERVAL) return null;
  const json = JSON.stringify(p);
  if (list[0] && JSON.stringify(list[0].project) === json) return null;
  return [{ at: now, label, clips: p.clips.length, length: lengthOf(p), project: JSON.parse(json) }, ...list].slice(0, MAX_SNAPSHOTS);
}

export const listSnapshots = async (id: string) => (await get<Snapshot[]>(KEY(id))) ?? [];

export async function snapshot(p: Project, label = 'Auto-save', force = false) {
  const next = addSnapshot(await listSnapshots(p.id), p, label, Date.now(), force);
  if (next) await set(KEY(p.id), next);
}

export const clearHistory = (id: string) => set(KEY(id), undefined);
