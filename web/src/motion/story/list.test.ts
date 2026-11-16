import { describe, expect, it } from 'vitest';
import { parseCaptionFile, stripAds } from '../../lib/captions';
import { copyText } from '../../lib/clipboard';
import { insertScene, pasteScenes, removeScene, retimeFromText, setSceneText, type StoryState } from './model';
import { PART_SIZE, partsOf } from './prompt';

const story = (texts: string[], timing: 'script' | 'voice' = 'script'): StoryState => {
  const st: StoryState = { styleId: 'explainer', variantId: 'dark', script: '', timing, createdAt: 0, scenes: texts.map((text, i) => ({ id: `s${i}`, start: i * 3, end: i * 3 + 3, text, words: [], hints: ['plain'], keys: [], templateId: 'x', slots: {}, source: 'template' })) };
  if (timing === 'script') retimeFromText(st);
  return st;
};

describe('voiceover subtitles', () => {
  it('removes transcription adverts', () => {
    expect(stripAds('(Transcribed by TurboScribe. Go Unlimited to remove this message.) If you want her to chase you, stop').trim()).toBe('If you want her to chase you, stop');
  });
  it('an ElevenLabs / TurboScribe .srt becomes timed lines without the advert', () => {
    const srt = '1\n00:00:00,230 --> 00:00:02,110\n(Transcribed by TurboScribe. Go Unlimited to remove this message.) If you want her to chase you, stop\n\n2\n00:00:02,110 --> 00:00:03,230\nchasing her attention.\n';
    const r = parseCaptionFile('voice.srt', srt, 10);
    const words = r.lines.flatMap((l) => l.words);
    expect(words[0].text).toBe('If');
    expect(words.map((w) => w.text).join(' ')).toBe('If you want her to chase you, stop chasing her attention.');
    expect(words[words.length - 1].end).toBeCloseTo(3.23, 2);
  });
});

describe('scene list editing', () => {
  it('edits, inserts and removes scenes; script timing follows the words', () => {
    const st = story(['Meet Sam.', 'Every morning he was late.', 'Then it clicked.']);
    expect(setSceneText(st, 's1', 'Every single morning he ran to work, late again.')).toBe(true);
    expect(st.scenes[1].templateId).toBe('');
    expect(st.scenes[1].end - st.scenes[1].start).toBeGreaterThan(st.scenes[0].end - st.scenes[0].start);
    const id = insertScene(st, 's0', 'A new idea.');
    expect(st.scenes[1].id).toBe(id);
    expect(st.scenes.map((s) => s.text)).toEqual(['Meet Sam.', 'A new idea.', 'Every single morning he ran to work, late again.', 'Then it clicked.']);
    for (let i = 1; i < st.scenes.length; i++) expect(st.scenes[i].start).toBeCloseTo(st.scenes[i - 1].end, 5);
    expect(removeScene(st, id)).toBe(true);
    expect(st.scenes).toHaveLength(3);
  });
  it('voice timing: an inserted scene takes half of its neighbour, a removed one gives its time back', () => {
    const st = story(['One.', 'Two.'], 'voice');
    insertScene(st, 's0', 'Half.');
    expect(st.scenes[0].end).toBeCloseTo(1.5, 5);
    expect(st.scenes[1].start).toBeCloseTo(1.5, 5);
    expect(st.scenes[1].end).toBeCloseTo(3, 5);
    removeScene(st, st.scenes[1].id);
    expect(st.scenes[0].end).toBeCloseTo(3, 5);
  });
  it('pastes a numbered / bulleted list', () => {
    const st = story(['Old scene.']);
    expect(pasteScenes(st, '1. Meet Sam.\n2) He was late.\n- Then it clicked.\n\n', 'replace')).toBe(3);
    expect(st.scenes.map((s) => s.text)).toEqual(['Meet Sam.', 'He was late.', 'Then it clicked.']);
    expect(pasteScenes(st, 'Scene 4: The end.', 'append')).toBe(1);
    expect(st.scenes[3].text).toBe('The end.');
  });
  it('all scenes in one message', () => {
    const st = story(Array.from({ length: PART_SIZE + 12 }, (_, i) => `Scene number ${i}.`));
    expect(partsOf(st)).toHaveLength(2);
    st.onePart = true;
    expect(partsOf(st)).toEqual([{ i: 0, from: 0, to: PART_SIZE + 12 }]);
  });
});

describe('copy', () => {
  it('reports failure honestly when there is no clipboard', async () => {
    expect(await copyText('hello')).toBe(false);
  });
});
