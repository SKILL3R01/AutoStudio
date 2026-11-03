import { describe, expect, it } from 'vitest';
import { newProject } from '../lib/project';
import { clipEnd, projectLength } from '../store';
import type { Asset, Clip, Project } from '../types';
import {
  applyCuts, clipboardEnd, copyItems, detachAudio, insertClips, pasteItems, rippleDeleteClips, splitClipAt, splitMusic, splitOverlay, splitVoice, voiceSegments,
} from './edit';

const asset = (id: string, kind: Asset['kind'], duration?: number) => ({ id, kind, name: id, mime: '', duration }) as Asset;
const clip = (id: string, start: number, assetId = 'img'): Clip => ({ id, assetId, start, trimIn: 0, motion: 'none', transition: 'crossfade', volume: 1, fit: 'cover' });

/** 3 image clips at 0 / 3 / 6, 9 s long, no voiceover; one overlay, one music bed and one SFX. */
function fixture(): Project {
  const p = newProject();
  p.assets = [asset('img', 'image'), asset('vid', 'video', 20), asset('mus', 'audio', 30), asset('vo', 'audio', 9)];
  p.clips = [clip('a', 0), clip('b', 3), clip('c', 6)];
  p.length = 9;
  p.overlays = [{ id: 'o', text: 'Hi', start: 6.5, duration: 2 } as Project['overlays'][number]];
  p.music = [{ id: 'm', assetId: 'mus', start: 0, duration: 9, trimIn: 0, volume: 0.3, fadeIn: 1, fadeOut: 2, duck: true }];
  p.sfx = [{ id: 's', sound: 'whoosh', start: 6, volume: 1 }];
  return p;
}

describe('split', () => {
  it('splits the clip under the playhead; video continues at the speed-aware source time', () => {
    const p = fixture();
    p.clips[1].assetId = 'vid';
    p.clips[1].trimIn = 2;
    p.clips[1].speed = 2;
    expect(splitClipAt(p, 4)).toBe(true);
    expect(p.clips.map((c) => c.start)).toEqual([0, 3, 4, 6]);
    expect(p.clips[2].trimIn).toBe(4);
    expect(p.clips[2].transition).toBe('none');
    expect(splitClipAt(p, 4.05)).toBe(false);
  });
  it('splits music and overlays into two parts with continuous source / fades only on the outer edges', () => {
    const p = fixture();
    expect(splitMusic(p, 'm', 4)).toBe(true);
    expect(p.music.map((m) => [m.start, m.duration, m.trimIn, m.fadeIn, m.fadeOut])).toEqual([[0, 4, 0, 1, 0], [4, 5, 4, 0, 2]]);
    expect(splitOverlay(p, 'o', 7)).toBe(true);
    expect(p.overlays.map((o) => [o.start, o.duration])).toEqual([[6.5, 0.5], [7, 1.5]]);
  });
  it('voice split points make selectable segments', () => {
    const p = fixture();
    p.voiceover = { assetId: 'vo', volume: 1 };
    p.voiceStart = 1;
    expect(splitVoice(p, 4, 9)).toBe(true);
    expect(splitVoice(p, 2, 9)).toBe(true);
    expect(voiceSegments(p, 9)).toEqual([{ start: 0, end: 1 }, { start: 1, end: 3 }, { start: 3, end: 9 }]);
  });
});

describe('ripple delete', () => {
  it('without a voiceover the whole timeline closes the gap', () => {
    const p = fixture();
    rippleDeleteClips(p, new Set(['b']));
    expect(p.clips.map((c) => [c.id, c.start])).toEqual([['a', 0], ['c', 3]]);
    expect(projectLength(p)).toBe(6);
    expect(p.overlays[0].start).toBe(3.5);
    expect(p.sfx[0].start).toBe(3);
  });
  it('with a voiceover only the visuals move', () => {
    const p = fixture();
    p.voiceover = { assetId: 'vo', volume: 1 };
    rippleDeleteClips(p, new Set(['a']));
    expect(p.clips.map((c) => [c.id, c.start])).toEqual([['b', 0], ['c', 3]]);
    expect(clipEnd(p, 1)).toBe(9);
    expect(p.sfx[0].start).toBe(6);
  });
  it('voice segment cuts move everything after and keep the other split points', () => {
    const p = fixture();
    p.voiceover = { assetId: 'vo', volume: 1, splits: [2, 4, 6] };
    applyCuts(p, [{ start: 2, end: 4 }], 'vo2');
    expect(p.voiceover.assetId).toBe('vo2');
    expect(p.voiceover.splits).toEqual([2, 4]);
    expect(p.sfx[0].start).toBe(4);
  });
});

describe('copy / paste / duplicate / detach', () => {
  it('pastes clips at the playhead and pushes the rest right', () => {
    const p = fixture();
    const data = copyItems(p, { kind: 'clip', id: 'a' }, [])!;
    insertClips(p, 4.5, data.kind === 'clips' ? data.items : []);
    expect(p.clips.map((c) => c.start)).toEqual([0, 3, 4.5, 7.5, 9]);
    expect(projectLength(p)).toBe(12);
  });
  it('duplicates an overlay right after itself', () => {
    const p = fixture();
    const data = copyItems(p, { kind: 'overlay', id: 'o' }, [])!;
    const ids = pasteItems(p, data, clipboardEnd(p, data));
    expect(p.overlays).toHaveLength(2);
    expect(p.overlays.find((o) => o.id === ids[0])!.start).toBe(8.5);
  });
  it('detaches a video clip sound onto the music lane', () => {
    const p = fixture();
    p.clips[1].assetId = 'vid';
    p.clips[1].trimIn = 1;
    const id = detachAudio(p, 'b')!;
    const m = p.music.find((x) => x.id === id)!;
    expect([m.start, m.duration, m.trimIn, m.duck]).toEqual([3, 3, 1, false]);
    expect(p.clips[1].volume).toBe(0);
    expect(detachAudio(p, 'a')).toBeNull();
  });
});
