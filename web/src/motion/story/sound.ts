/** Story sound (v5.4): music made for the style that follows the scenes, placed on the music track (ducks under the voice). */
import type { Project } from '../../types';
import { projectLength, useEditor } from '../../store';
import { probe } from '../../lib/project';
import { ensureTrack, newAudioClip } from '../../lib/audiotracks';
import { encodeWav } from '../../audio/silence';
import { composeMusic, musicCurve, renderMusic, sceneKind, type MusicScene, type MusicStyle } from '../../audio/music';

/** The story's scenes as music moments (or one "build" moment for a project without a story). */
export function musicScenes(p: Project): MusicScene[] {
  const sc = p.story?.scenes ?? [];
  if (!sc.length) return [{ start: 0, end: Math.max(1, projectLength(p)), kind: 'build' }];
  return sc.map((s, i) => ({ start: s.start, end: s.end, kind: sceneKind(s.templateId, i, sc.length) }));
}

/** Compose + render music for the whole project and put it on the music track (replaces earlier story music). */
export async function makeStoryMusic(style: MusicStyle, volume = 0.55, onProgress?: (k: number) => void) {
  const p = useEditor.getState().project!;
  const scenes = musicScenes(p), length = Math.max(2, Math.max(projectLength(p), scenes[scenes.length - 1].end));
  const buf = await renderMusic(composeMusic(style, scenes, length), length, onProgress);
  const file = new File([encodeWav(buf)], `music_${style.id}.wav`, { type: 'audio/wav' });
  const a = await probe(file, file.name, 'audio');
  useEditor.getState().update((d) => {
    d.assets.push(a);
    d.audio = d.audio.filter((c) => !c.id.startsWith('smusic_'));
    const tid = ensureTrack(d, 'music');
    d.audio.push(newAudioClip(tid, a.id, 0, length, 'music', { id: `smusic_${style.id}`, volume, duck: true, fadeIn: 0.4, fadeOut: 1.5, curve: musicCurve(scenes, length) }));
  });
  return { seconds: length, stops: scenes.filter((s, i) => i > 0 && s.kind === 'reveal').length };
}
