import { describe, expect, it, vi } from 'vitest';
import { defaultClip, importVisuals, newProject } from './project';
import { insertAssetAt, replaceClipAsset } from '../editor/MediaPanel';
import { applySfxCues, findSfxCues, normWord, removeScriptSounds } from '../audio/scriptsfx';
import type { Project } from '../types';

vi.mock('./db', async (orig) => ({ ...(await orig<typeof import('./db')>()), saveBlob: async () => {} }));
vi.stubGlobal('createImageBitmap', async () => ({ width: 100, height: 100, close() {} }));

const proj = (): Project => {
  const p = newProject();
  p.assets = [{ id: 'a', kind: 'image', name: 'a', mime: '' }, { id: 'b', kind: 'image', name: 'b', mime: '' }, { id: 'n', kind: 'image', name: 'n', mime: '' }, { id: 'v', kind: 'video', name: 'v', mime: '', duration: 6 }];
  p.clips = [{ ...defaultClip('a', 0), id: 'ca' }, { ...defaultClip('b', 10), id: 'cb' }];
  p.length = 20;
  return p;
};
const ends = (p: Project) => p.clips.map((c, i) => [c.assetId || 'blank', c.start, p.clips[i + 1]?.start ?? p.length]);

describe('v5.8 adding media', () => {
  it('inside a clip: goes in at the nearest cut and moves the later clips, nothing is stretched', () => {
    const p = proj();
    expect(insertAssetAt(p, 'n', 8)).toBe(4);
    expect(ends(p)).toEqual([['a', 0, 10], ['n', 10, 14], ['b', 14, 24]]);
    const q = proj();
    insertAssetAt(q, 'v', 1);
    expect(ends(q)).toEqual([['v', 0, 6], ['a', 6, 16], ['b', 16, 26]]);
  });
  it('after the end: appended, the gap becomes a blank section instead of a stretched clip', () => {
    const p = proj();
    expect(insertAssetAt(p, 'n', 20)).toBe(0);
    expect(ends(p)).toEqual([['a', 0, 10], ['b', 10, 20], ['n', 20, 24]]);
    const q = proj();
    insertAssetAt(q, 'n', 300);
    expect(ends(q)).toEqual([['a', 0, 10], ['b', 10, 20], ['blank', 20, 300], ['n', 300, 304]]);
    expect(q.clips[2].fill).toBeTruthy();
  });
  it('import: timed files far after the end leave a blank; "at the end" ignores the times', async () => {
    const f = (name: string) => ({ file: new Blob([''], { type: 'image/png' }), name, time: 5000 });
    const timed = await importVisuals(proj(), [f('x.png')]);
    expect(ends(timed).map((e) => e[0] === 'blank' ? 'blank' : 'img')).toEqual(['img', 'img', 'blank', 'img']);
    expect(timed.length).toBe(5004);
    const end = await importVisuals(proj(), [f('x.png'), f('y.png')], undefined, true);
    expect(ends(end).map((e) => [e[1], e[2]])).toEqual([[0, 10], [10, 20], [20, 24], [24, 28]]);
  });
  it('a fresh timed import still runs each picture until the next one', async () => {
    const p = newProject();
    const f = (name: string, time: number) => ({ file: new Blob([''], { type: 'image/png' }), name, time });
    const out = await importVisuals(p, [f('0-00.png', 0), f('0-10.png', 10)]);
    expect(out.clips.map((c) => c.fill)).toEqual([undefined, undefined]);
    expect(out.clips.map((c) => c.start)).toEqual([0, 10]);
  });
  it('replace keeps place and time, clears image-specific edits, and works for overlay clips', () => {
    const p = proj();
    p.clips[1].motion = 'zoomIn';
    p.clips[1].living = { pieces: [] } as never;
    replaceClipAsset(p, 'cb', 'v');
    expect(p.clips[1]).toMatchObject({ assetId: 'v', start: 10, motion: 'zoomIn', living: undefined });
    expect(p.assets.some((a) => a.id === 'b')).toBe(true);
    p.pips = [{ id: 'o', trackId: 't', assetId: 'a', start: 1, duration: 3, trimIn: 2 } as never];
    replaceClipAsset(p, 'o', 'n');
    expect(p.pips[0]).toMatchObject({ assetId: 'n', trimIn: 0, start: 1, duration: 3 });
  });
});

describe('v5.8 sounds from the script', () => {
  const words = (s: string) => s.split(' ').map((text, i) => ({ text, start: i, end: i + 0.8 }));
  it('finds sound words (English + Arabic) on the spoken word, sparse and without repeats', () => {
    const p = newProject();
    p.words = words('He walked home, sighed, then walked again. Someone screamed! A knock at the door. ثم صرخ');
    const cues = findSfxCues(p);
    expect(cues.map((c) => c.rule)).toEqual(['steps', 'breath', 'scream', 'knock']);
    expect(cues[0]).toMatchObject({ t: 1, word: 'walked', sound: 'steps', on: true });
    expect(cues.find((c) => c.rule === 'scream')).toMatchObject({ sound: undefined, on: false });
    for (let i = 1; i < cues.length; i++) expect(cues[i].t - cues[i - 1].t).toBeGreaterThanOrEqual(1.5);
    expect(normWord('Screamed!')).toBe('screamed');
    expect(normWord('صَرَخَ')).toBe('صرخ');
  });
  it('prefers a matching sound file from Media, by file name', () => {
    const p = newProject();
    p.assets = [{ id: 's1', kind: 'audio', name: 'Woman_Scream_01.mp3', mime: '', duration: 3 }, { id: 'm', kind: 'audio', name: 'calm piano.mp3', mime: '', duration: 90 }];
    p.words = words('she screamed');
    expect(findSfxCues(p)[0]).toMatchObject({ assetId: 's1', fileName: 'Woman_Scream_01.mp3', on: true });
  });
  it('adds the chosen cues on one "Script sounds" track without overlaps, and removes them again', () => {
    const p = newProject();
    p.words = words('rain fell thunder came');
    const cues = findSfxCues(p);
    expect(applySfxCues(p, cues)).toBe(2);
    const added = p.audio.filter((c) => c.id.startsWith('asfx_'));
    expect(added[0].start + added[0].duration).toBeLessThanOrEqual(added[1].start);
    expect(new Set(added.map((c) => c.trackId)).size).toBe(1);
    expect(applySfxCues(p, cues)).toBe(2);
    expect(p.audio.filter((c) => c.id.startsWith('asfx_'))).toHaveLength(2);
    removeScriptSounds(p);
    expect(p.audio.some((c) => c.id.startsWith('asfx_'))).toBe(false);
  });
});
