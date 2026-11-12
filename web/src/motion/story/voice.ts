/** A draft voice (Kokoro, English) for a story script, with word timings spread over each spoken paragraph. */
import { speakDraft } from '../../ai/vision';
import { joinParagraphs, paragraphsOf } from '../../voice/library';
import { probe, addVoiceTake } from '../../lib/project';
import { useEditor } from '../../store';
import type { Word } from '../../types';
import { buildStory, retimeScenes } from './model';

const PAUSE = 0.45;
/** Syllable-ish weight of a word (longer words take longer to say; punctuation adds a small pause). */
const weight = (w: string) => Math.max(1, (w.match(/[aeiouyàâäéèêëîïôöùûüاأإآويى]+/gi) ?? []).length) + (/[.!?؟,;:،]$/.test(w) ? 0.6 : 0);

export function spreadWords(text: string, t0: number, dur: number): Word[] {
  const ws = text.split(/\s+/).filter(Boolean);
  const total = ws.reduce((a, w) => a + weight(w), 0) || 1;
  const span = Math.max(0.2, dur - 0.1);
  let t = t0 + 0.05;
  return ws.map((w) => {
    const d = (weight(w) / total) * span;
    const out = { text: w, start: t, end: t + d * 0.92 };
    t += d;
    return out;
  });
}

async function seconds(b: Blob) {
  const ctx = new OfflineAudioContext(1, 1, 48000);
  return (await ctx.decodeAudioData(await b.arrayBuffer())).duration;
}

/** Speak the script, add it as the narration, set word timings and move the scenes onto them. */
export async function makeDraftVoice(script: string, voice: string, onStep?: (s: string) => void) {
  const paras = paragraphsOf(script);
  const parts: Blob[] = [];
  const words: Word[] = [];
  let t = 0;
  for (const [i, para] of paras.entries()) {
    onStep?.(`Speaking paragraph ${i + 1} of ${paras.length}…`);
    const { wav } = await speakDraft(para, voice);
    const d = await seconds(wav);
    words.push(...spreadWords(para, t, d));
    parts.push(wav);
    t += d + PAUSE;
  }
  onStep?.('Joining…');
  const file = new File([await joinParagraphs(parts, PAUSE)], 'story_voice.wav', { type: 'audio/wav' });
  const a = await probe(file, file.name, 'audio');
  useEditor.getState().update((d) => {
    d.assets.push(a);
    addVoiceTake(d, a.id, a.duration ?? t, 0);
    d.words = words;
    d.lines = [];
    if (d.story) {
      retimeScenes(d.story, words.map((w) => ({ w: w.text, t: w.start, end: w.end })));
      buildStory(d);
    }
  });
  return { seconds: t, words: words.length };
}
