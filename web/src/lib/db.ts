import { get, set, del, keys } from 'idb-keyval';
import type { Project } from '../types';

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  length: number;
  clips: number;
  aspect: string;
  thumb?: Blob;
}

export const saveBlob = (id: string, blob: Blob) => set(`asset:${id}`, blob);
export const loadBlob = (id: string) => get<Blob>(`asset:${id}`);

export const saveThumb = (projectId: string, blob: Blob) => set(`thumb:${projectId}`, blob);

export async function saveProject(p: Project) {
  await set(`project:${p.id}`, p);
}

export const loadProject = (id: string) => get<Project>(`project:${id}`);

export async function listProjects(): Promise<ProjectMeta[]> {
  const ks = (await keys()).filter((k) => String(k).startsWith('project:'));
  const ps = await Promise.all(ks.map((k) => get<Project>(k)));
  const metas = await Promise.all(
    ps.filter((p): p is Project => !!p).map(async (p) => ({
      id: p.id, name: p.name, updatedAt: p.updatedAt, length: p.length, clips: p.clips.length, aspect: p.export.aspect,
      thumb: await get<Blob>(`thumb:${p.id}`),
    })),
  );
  return metas.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string) {
  await set(`history:${id}`, undefined);
  const p = await loadProject(id);
  if (p) await Promise.all(p.assets.map((a) => del(`asset:${a.id}`)));
  await del(`project:${id}`);
  await del(`thumb:${id}`);
}

/** Copy a project; media blobs are shared by id so duplicates are cheap, but deleting one keeps the other's media. */
export async function duplicateProject(id: string, newId: string) {
  const p = await loadProject(id);
  if (!p) return;
  const copy: Project = { ...structuredClone(p), id: newId, name: `${p.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() };
  const remap = new Map<string, string>();
  for (const a of copy.assets) {
    const nid = `${a.id}_${newId.slice(-4)}`;
    const b = await loadBlob(a.id);
    if (b) await saveBlob(nid, b);
    remap.set(a.id, nid);
    a.id = nid;
  }
  const r = (x: string) => remap.get(x) ?? x;
  copy.clips.forEach((c) => (c.assetId = r(c.assetId)));
  copy.audio.forEach((m) => m.assetId && (m.assetId = r(m.assetId)));
  copy.pips.forEach((m) => (m.assetId = r(m.assetId)));
  copy.overlays.forEach((o) => o.assetId && (o.assetId = r(o.assetId)));
  await saveProject(copy);
  const t = await get<Blob>(`thumb:${id}`);
  if (t) await saveThumb(newId, t);
}

const MAGIC = 'AUTOSTD1';

/** Pack a project and all its media into one `.autostudio` file: magic · JSON length · JSON · blobs. */
export async function exportProjectFile(id: string): Promise<Blob | undefined> {
  const p = await loadProject(id);
  if (!p) return undefined;
  const blobs = await Promise.all(p.assets.map((a) => loadBlob(a.id)));
  const index = p.assets.map((a, i) => ({ id: a.id, size: blobs[i]?.size ?? 0, type: blobs[i]?.type ?? '' }));
  const json = new TextEncoder().encode(JSON.stringify({ project: p, index, thumb: null }));
  const head = new DataView(new ArrayBuffer(12));
  [...MAGIC].forEach((c, i) => head.setUint8(i, c.charCodeAt(0)));
  head.setUint32(8, json.length, true);
  return new Blob([head.buffer, json, ...blobs.filter((b): b is Blob => !!b)], { type: 'application/octet-stream' });
}

/** Restore a `.autostudio` backup as a new project (ids are kept, so re-importing replaces it). */
export async function importProjectFile(file: Blob): Promise<Project> {
  const head = new DataView(await file.slice(0, 12).arrayBuffer());
  const magic = String.fromCharCode(...Array.from({ length: 8 }, (_, i) => head.getUint8(i)));
  if (magic !== MAGIC) throw new Error('Not an AutoStudio backup file');
  const len = head.getUint32(8, true);
  const meta = JSON.parse(await file.slice(12, 12 + len).text()) as { project: Project; index: { id: string; size: number; type: string }[] };
  let off = 12 + len;
  for (const e of meta.index) {
    if (e.size) await saveBlob(e.id, file.slice(off, off + e.size, e.type));
    off += e.size;
  }
  await saveProject({ ...meta.project, updatedAt: Date.now() });
  return meta.project;
}

export async function renameProject(id: string, name: string) {
  const p = await loadProject(id);
  if (p) await saveProject({ ...p, name, updatedAt: Date.now() });
}
