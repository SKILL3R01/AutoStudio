import { describe, expect, it } from 'vitest';
import { BUILTIN_TEMPLATES, TARGETS, fillTemplate, projectVariables } from './prompts';
import { mapWords, tryAiRequest } from './tryai';
import { newProject } from './project';

describe('Prompt Studio', () => {
  it('fills variables, marks missing ones and drops lines that are only an empty variable', () => {
    const out = fillTemplate('Topic: {{topic}}\n{{character}}\nFor {{audience}}.', { topic: 'focus', character: '' });
    expect(out).toBe('Topic: focus\nFor [audience].');
  });
  it('reads title, transcript and timed scenes from a project', () => {
    const p = newProject('My video');
    p.words = [{ text: 'Hello', start: 0, end: 0.4 }, { text: 'world.', start: 0.5, end: 1 }, { text: 'Next', start: 7, end: 7.4 }, { text: 'scene.', start: 7.5, end: 8 }];
    const v = projectVariables(p);
    expect(v.title).toBe('My video');
    expect(v.transcript).toBe('Hello world. Next scene.');
    expect(v.scenes.split('\n')[0]).toMatch(/^1\. \[0:00\] Hello world\./);
  });
  it('builds pre-filled links for Claude and ChatGPT only', () => {
    expect(TARGETS.claude.url('a b')).toBe('https://claude.ai/new?q=a%20b');
    expect(TARGETS.chatgpt.prefill && !TARGETS.gemini.prefill && !TARGETS.flow.prefill).toBe(true);
    expect(BUILTIN_TEMPLATES.every((t) => t.targets.length > 0 && t.body.includes('{{'))).toBe(true);
  });
});

describe('TryAIToday engine adapter', () => {
  it('maps our voiceover request to their Chatterbox form and refuses what they cannot do', () => {
    const f = new FormData();
    f.append('text', 'Hi.');
    f.append('language', 'en');
    expect(() => tryAiRequest('tts', f)).toThrow(/reference voice/);
    f.append('voice', new File([new Uint8Array(4)], 'me.wav'));
    const r = tryAiRequest('tts', f);
    expect(r.path).toBe('/chatterbox/start');
    expect(r.body.get('mode')).toBe('single');
    expect((r.body.get('script') as File).name).toBe('script.txt');
    expect(r.result('abc')).toEqual(['/file/abc/audio']);
    const fr = new FormData();
    fr.append('text', 'Bonjour');
    fr.append('language', 'fr');
    fr.append('voice', new File([new Uint8Array(4)], 'me.wav'));
    expect(() => tryAiRequest('tts', fr)).toThrow(/English only/);
    expect(() => tryAiRequest('imagegen', new FormData())).toThrow(/AutoStudio engine/);
  });
  it('maps their Whisper words to ours', () => {
    expect(mapWords([{ word: ' Hello', start: 0.1, end: 0.4 }, { word: ' ', start: 0.4, end: 0.5 }])).toEqual([{ text: 'Hello', start: 0.1, end: 0.4 }]);
  });
});
