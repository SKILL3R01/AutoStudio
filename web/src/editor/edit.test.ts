import { describe, expect, it } from 'vitest';
import { addVoiceTake, newProject, normalizeProject } from '../lib/project';
import { clipEnd, projectLength } from '../store';
import { TRACK_IDS, moveAudioClip, narrationClips, newAudioClip, voiceStartOf } from '../lib/audiotracks';
import type { Asset, Clip, Project } from '../types';
import {
  applyCuts, clipboardEnd, copyItems, detachAudio, insertClips, pasteItems, rippleDeleteClips, splitAudio, splitClipAt, splitOverlay,
} from './edit';

const asset = (id: string, kind: Asset['kind'], duration?: number) => ({ id, kind, name: id, mime: '', duration }) as Asset;
const clip = (id: string, start: number, assetId = 'img'): Clip => ({ id, assetId, start, trimIn: 0, motion: 'none', transition: 'crossfade', volume: 1, fit: 'cover' });

/** 3 image clips at 0 / 3 / 6, 9 s long, no narration; one overlay, one music bed and one SFX. */
function fixture(): Project {
  const p = newProject();
  p.assets = [asset('img', 'image'), asset('vid', 'video', 20), asset('mus', 'audio', 30), asset('vo', 'audio', 9)];
  p.clips = [clip('a', 0), clip('b', 3), clip('c', 6)];
  p.length = 9;
  p.overlays = [{ id: 'o', text: 'Hi', start: 6.5, duration: 2 } as Project['overlays'][number]];
  p.audio = [
    { ...newAudioClip(TRACK_IDS.music, 'mus', 0, 9, 'music'), id: 'm' },
    { ...newAudioClip(TRACK_IDS.sfx, '', 6, 1, 'sfx', { sound: 'whoosh', volume: 1 }), id: 's' },
  ];
  return p;
}
const sfx = (p: Project) => p.audio.find((c) => c.id === 's')!;

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
  it('splits audio and overlays into two parts with continuous source / fades only on the outer edges', () => {
    const p = fixture();
    expect(splitAudio(p, 'm', 4)).toBe(true);
    expect(p.audio.filter((c) => c.trackId === TRACK_IDS.music).map((m) => [m.start, m.duration, m.trimIn, m.fadeIn, m.fadeOut])).toEqual([[0, 4, 0, 1, 0], [4, 5, 4, 0, 2]]);
    expect(splitOverlay(p, 'o', 7)).toBe(true);
    expect(p.overlays.map((o) => [o.start, o.duration])).toEqual([[6.5, 0.5], [7, 1.5]]);
  });
});

describe('audio tracks', () => {
  it('migrates voiceover + splits / music / sfx into track clips with the same length', () => {
    const old = { ...newProject(), assets: [asset('vo', 'audio', 9), asset('mus', 'audio', 30)], voiceover: { assetId: 'vo', volume: 0.8, splits: [3] }, voiceStart: 2, tail: 1, music: [{ id: 'm', assetId: 'mus', start: 0, duration: 12, trimIn: 0, volume: 0.3, fadeIn: 1, fadeOut: 2, duck: true }], sfx: [{ id: 's', sound: 'pop', start: 5, volume: 0.7 }] } as unknown as Project;
    delete (old as Partial<Project>).audioTracks;
    delete (old as Partial<Project>).audio;
    const p = normalizeProject(old);
    expect(narrationClips(p).map((c) => [c.start, c.duration, c.trimIn])).toEqual([[2, 3, 0], [5, 6, 3]]);
    expect(p.audioTracks.find((t) => t.id === TRACK_IDS.voice)!.volume).toBe(0.8);
    expect(p.audio.find((c) => c.id === 's')!.sound).toBe('pop');
    expect(p.length).toBe(12);
    expect('voiceover' in p).toBe(false);
  });
  it('a new voice never replaces the old one: it gets its own track, the old one is muted', () => {
    const p = fixture();
    addVoiceTake(p, 'vo', 9);
    const r = addVoiceTake(p, 'vo2', 8);
    expect(p.audio.filter((c) => c.assetId.startsWith('vo'))).toHaveLength(2);
    expect(r.replacedName).toBe('Voice');
    expect(p.audioTracks.find((t) => t.id === TRACK_IDS.voice)!.muted).toBe(true);
    expect(narrationClips(p)[0].assetId).toBe('vo2');
  });
  it('captions follow a moved narration clip; length = the last item on any track', () => {
    const p = fixture();
    addVoiceTake(p, 'vo', 9);
    p.words = [{ text: 'hi', start: 1, end: 1.5 }];
    moveAudioClip(p, narrationClips(p)[0].id, 4);
    expect(p.words[0].start).toBe(5);
    expect(voiceStartOf(p)).toBe(4);
    expect(projectLength(p)).toBe(13);
  });
});

describe('ripple delete', () => {
  it('without narration the whole timeline closes the gap', () => {
    const p = fixture();
    rippleDeleteClips(p, new Set(['b']));
    expect(p.clips.map((c) => [c.id, c.start])).toEqual([['a', 0], ['c', 3]]);
    expect(p.length).toBe(6);
    expect(p.overlays[0].start).toBe(3.5);
    expect(sfx(p).start).toBe(3);
  });
  it('with narration only the visuals move', () => {
    const p = fixture();
    addVoiceTake(p, 'vo', 9);
    rippleDeleteClips(p, new Set(['a']));
    expect(p.clips.map((c) => [c.id, c.start])).toEqual([['b', 0], ['c', 3]]);
    expect(clipEnd(p, 1)).toBe(6);
    expect(sfx(p).start).toBe(6);
  });
  it('cutting part of the narration file moves everything after it', () => {
    const p = fixture();
    addVoiceTake(p, 'vo', 9);
    applyCuts(p, [{ start: 2, end: 4 }], 'vo2', 'vo');
    expect(narrationClips(p)[0].assetId).toBe('vo2');
    expect(narrationClips(p)[0].duration).toBe(7);
    expect(sfx(p).start).toBe(4);
  });
});

describe('copy / paste / duplicate / detach', () => {
  it('pastes clips at the playhead and pushes the rest right', () => {
    const p = fixture();
    const data = copyItems(p, { kind: 'clip', id: 'a' }, [])!;
    insertClips(p, 4.5, data.kind === 'clips' ? data.items : []);
    expect(p.clips.map((c) => c.start)).toEqual([0, 3, 4.5, 7.5, 9]);
    expect(p.length).toBe(12);
  });
  it('duplicates an overlay right after itself', () => {
    const p = fixture();
    const data = copyItems(p, { kind: 'overlay', id: 'o' }, [])!;
    const ids = pasteItems(p, data, clipboardEnd(p, data));
    expect(p.overlays).toHaveLength(2);
    expect(p.overlays.find((o) => o.id === ids[0])!.start).toBe(8.5);
  });
  it('copies a mixed selection (clips + audio + text) and pastes it keeping relative times', () => {
    const p = fixture();
    const data = copyItems(p, null, ['c', 's', 'o'])!;
    expect(data.kind).toBe('mixed');
    pasteItems(p, data, 9);
    expect(p.overlays.map((o) => o.start).sort()).toEqual([6.5, 9.5]);
    expect(p.audio.filter((c) => c.sound === 'whoosh').map((c) => c.start).sort()).toEqual([6, 9]);
    expect(p.clips).toHaveLength(4);
  });
  it('detaches a video clip sound onto an audio track', () => {
    const p = fixture();
    p.clips[1].assetId = 'vid';
    p.clips[1].trimIn = 1;
    const id = detachAudio(p, 'b')!;
    const m = p.audio.find((x) => x.id === id)!;
    expect([m.start, m.duration, m.trimIn, m.duck]).toEqual([3, 3, 1, false]);
    expect(p.clips[1].volume).toBe(0);
    expect(detachAudio(p, 'a')).toBeNull();
  });
});
