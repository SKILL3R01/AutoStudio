import { describe, expect, it } from 'vitest';
import { channelPulse, isoDuration, outlierScore, parseChannelRef, scoreKeyword, seoChecks, type Video } from './youtube';
import { earnings, fingerprint, readiness } from './growth';
import { newProject } from './project';

const NOW = Date.parse('2026-11-01T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86400_000).toISOString();
const vid = (o: Partial<Video>): Video => ({ id: 'v', title: '', description: '', tags: [], categoryId: '22', channelId: 'c', channelTitle: '', publishedAt: daysAgo(30), thumb: '', views: 0, likes: 0, comments: 0, duration: 600, ...o });

describe('YouTube helpers', () => {
  it('parses durations and channel references', () => {
    expect(isoDuration('PT1H2M3S')).toBe(3723);
    expect(isoDuration('PT45S')).toBe(45);
    expect(parseChannelRef('https://www.youtube.com/@MrBeast/videos')).toEqual({ handle: '@MrBeast' });
    expect(parseChannelRef('https://youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA')).toEqual({ id: 'UCX6OQ3DkcsbYNE6H8uQQuVA' });
    expect(parseChannelRef('stoicwisdom')).toEqual({ handle: '@stoicwisdom' });
    expect(parseChannelRef('')).toBeNull();
  });
  it('scores keywords: big demand + small channels = opportunity', () => {
    const easy = Array.from({ length: 10 }, (_, i) => vid({ id: `e${i}`, channelId: 'small', views: 300_000, publishedAt: daysAgo(60) }));
    const hard = Array.from({ length: 10 }, (_, i) => vid({ id: `h${i}`, channelId: 'big', views: 20_000, publishedAt: daysAgo(900) }));
    const subs = (c: string) => (c === 'small' ? 20_000 : 8_000_000);
    const a = scoreKeyword(easy, subs, NOW), b = scoreKeyword(hard, subs, NOW);
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.smallChannelWins).toBe(10);
    expect(b.label).toBe('Hard');
    expect(outlierScore(250_000, 10_000)).toBe(25);
  });
  it('channel pulse counts uploads per week and Shorts share', () => {
    const ups = [vid({ publishedAt: daysAgo(2), views: 100, duration: 50 }), vid({ publishedAt: daysAgo(9), views: 300 }), vid({ publishedAt: daysAgo(40), views: 200 })];
    const p = channelPulse(ups, NOW);
    expect(p.perWeek).toBe(0.5);
    expect(p.avgViewsLast10).toBe(200);
    expect(p.shortsShare).toBeCloseTo(1 / 3);
  });
  it('SEO checklist', () => {
    const good = seoChecks({ title: 'Stoic mindset: 7 habits that change your life', description: `Stoic mindset habits for calm.\n\n${'Real summary. '.repeat(25)}\n0:00 Intro\n1:20 Habit one\n#stoicism #mindset`, tags: ['stoic mindset', 'stoicism', 'marcus aurelius', 'discipline', 'habits'] }, 'stoic mindset');
    expect(good.score).toBe(100);
    const bad = seoChecks({ title: 'video', description: '', tags: [] }, 'stoic mindset');
    expect(bad.score).toBeLessThan(20);
  });
});

describe('Growth: earnings and readiness', () => {
  it('estimates earnings from views and RPM', () => {
    expect(earnings(100_000, [2, 6])).toEqual([200, 600]);
  });
  it('flags missing narration, low variety and repeated templates', () => {
    const p = newProject('Untitled project');
    p.assets = [{ id: 'img', kind: 'image', name: 'a.png', mime: 'image/png' } as never];
    p.clips = [{ id: 'c', assetId: 'img', start: 0, trimIn: 0, motion: 'zoomIn', transition: 'none', volume: 1, fit: 'cover' }];
    p.length = 120;
    const twins = [{ ...structuredClone(p), id: 'x' }, { ...structuredClone(p), id: 'y' }];
    const items = Object.fromEntries(readiness(p, twins).map((i) => [i.id, i.status]));
    expect(items.voice).toBe('warn');
    expect(items.variety).toBe('warn');
    expect(items.template).toBe('warn');
    expect(items.title).toBe('warn');
    expect(fingerprint(p)).toBe(fingerprint(twins[0]));
  });
});
