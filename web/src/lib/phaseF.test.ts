import { describe, expect, it } from 'vitest';
import { decodeVec, dot, encodeVec, matchPercent, rank, unindexed } from './mediasearch';
import { creditsText, isNoCredit, keywordsFrom, pickVideoUrl, siteLinks } from './freemedia';
import { readiness } from './growth';
import { newProject } from './project';
import type { Asset } from '../types';

const unit = (xs: number[]) => {
  const n = Math.hypot(...xs);
  return Float32Array.from(xs, (x) => x / n);
};

describe('media search', () => {
  it('round-trips vectors and ranks by similarity', () => {
    const v = unit([1, 2, 3]);
    expect(Array.from(decodeVec(encodeVec(v)))).toEqual(Array.from(v));
    const p = newProject();
    p.assets = [
      { id: 'beach', kind: 'image', name: 'beach.jpg' } as Asset,
      { id: 'city', kind: 'video', name: 'city.mp4' } as Asset,
      { id: 'depth', kind: 'image', name: '__depth_x' } as Asset,
      { id: 'new', kind: 'image', name: 'new.png' } as Asset,
    ];
    p.embeddings = { beach: encodeVec(unit([1, 0, 0])), city: encodeVec(unit([0, 1, 0])) };
    const r = rank(p, unit([0.2, 1, 0]));
    expect(r.map((x) => x.asset.id)).toEqual(['city', 'beach']);
    expect(unindexed(p).map((a) => a.id)).toEqual(['new']);
    expect(dot(unit([1, 0]), unit([1, 0]))).toBeCloseTo(1);
    expect(matchPercent(0.32)).toBe(100);
    expect(matchPercent(0.1)).toBe(0);
  });
});

describe('free media', () => {
  it('recognises licences that need no credit', () => {
    expect(isNoCredit('Public domain')).toBe(true);
    expect(isNoCredit('CC0')).toBe(true);
    expect(isNoCredit('pdm')).toBe(true);
    expect(isNoCredit('CC BY-SA 4.0')).toBe(false);
  });
  it('prefers a ≤1080p WebM transcode for video', () => {
    const d = [
      { src: 'a.240.webm', type: 'video/webm; codecs="vp9"', height: 240 },
      { src: 'a.1080.webm', type: 'video/webm; codecs="vp9"', height: 1080 },
      { src: 'a.2160.webm', type: 'video/webm', height: 2160 },
      { src: 'a.360.mov', type: 'video/quicktime', height: 360 },
    ];
    expect(pickVideoUrl({ url: 'orig.webm', size: 5e8, mime: 'video/webm' }, d)).toBe('a.1080.webm');
    expect(pickVideoUrl({ url: 'orig.webm', size: 5e6, mime: 'video/webm' }, [])).toBe('orig.webm');
    expect(pickVideoUrl({ url: 'orig.ogv', size: 5e6, mime: 'video/ogg' }, [])).toBeNull();
  });
  it('turns narration into search words and builds credit lines', () => {
    expect(keywordsFrom('Have you ever gone to bed full of plans for the morning?')).toBe('gone bed full plans');
    expect(siteLinks('city night', 'video')[0].url).toBe('https://www.pexels.com/search/videos/city%20night/');
    expect(creditsText([{ assetId: 'a', title: 'Rain', creator: 'Ann', license: 'CC BY 4.0', page: 'https://x', required: true }])).toBe('“Rain” by Ann — CC BY 4.0 — https://x');
  });
  it('readiness counts credited free footage as licensed and reminds about credits', () => {
    const p = newProject('Rainy night');
    p.assets = [{ id: 'v', kind: 'video', name: 'rain.webm', duration: 10 } as Asset];
    p.clips = [{ id: 'c', assetId: 'v', start: 0, trimIn: 0, motion: 'none', transition: 'none', volume: 1, fit: 'cover' }];
    expect(readiness(p).some((i) => i.id === 'rights')).toBe(true);
    p.credits = [{ assetId: 'v', title: 'Rain', creator: 'Ann', license: 'CC BY 4.0', page: 'x', required: true }];
    const items = readiness(p);
    expect(items.some((i) => i.id === 'rights')).toBe(false);
    expect(items.find((i) => i.id === 'credits')?.status).toBe('info');
  });
});
