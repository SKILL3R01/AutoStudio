import { describe, expect, it } from 'vitest';
import { paragraphKey, type GenSettings } from './library';

describe('instant drafts', () => {
  it('cache drafts separately from cloned paragraphs and per draft voice', async () => {
    const s: GenSettings = { language: 'en', exaggeration: 0.5, cfg: 0.5, seed: 0, draftVoice: 'af_heart' };
    const local = await paragraphKey('Hello world.', s, 'local');
    const draft = await paragraphKey('Hello world.', s, 'draft');
    const draft2 = await paragraphKey('Hello world.', { ...s, draftVoice: 'am_michael' }, 'draft');
    expect(new Set([local, draft, draft2]).size).toBe(3);
  });
});
