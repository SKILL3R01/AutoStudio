import { describe, expect, it } from 'vitest';
import { keywordsFrom, siteLinks } from './stocklinks';

describe('stock links', () => {
  it('keeps the strong words', () => expect(keywordsFrom('Have you ever gone to bed full of plans for the morning?')).toBe('gone bed full plans'));
  it('builds Pexels / Pixabay searches', () => {
    expect(siteLinks('city night', 'video').map((l) => l.url)).toEqual(['https://www.pexels.com/search/videos/city%20night/', 'https://pixabay.com/videos/search/city-night/']);
  });
});
