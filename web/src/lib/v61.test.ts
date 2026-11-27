import { describe, expect, it } from 'vitest';
import { parseAic, parseCommons, parseMetObject, parseNasa, parseOpenverse, rankStock, stockQueries, type StockHit } from './stockimages';
import { wordTimes, LETTER_ANIMS } from '../motion/typowidgets';
import { TYPOGRAPHY } from '../motion/styles/typography';
import { BUILTIN_KITS, getKit } from '../motion/styles';
import { fixLayout } from '../motion/layout';
import type { SceneCtx } from '../motion/styles/types';

describe('v6.1 free stock images', () => {
  it('keeps only CC0 / public-domain results from every source', () => {
    const ov = parseOpenverse({ results: [{ id: 'a', title: 'Lighthouse', url: 'u1', thumbnail: 't1', license: 'cc0' }, { id: 'b', url: 'u2', license: 'pdm' }, { id: 'c', url: 'u3', license: 'by' }] });
    expect(ov.map((h) => [h.key, h.licence])).toEqual([['ov:a', 'CC0'], ['ov:b', 'Public domain']]);
    const wm = parseCommons({ query: { pages: { 1: { pageid: 1, title: 'File:Old map.jpg', imageinfo: [{ thumburl: 'https://up/x/480px-a.jpg', descriptionurl: 'd', extmetadata: { License: { value: 'pd' } } }] }, 2: { pageid: 2, title: 'File:B.jpg', imageinfo: [{ thumburl: 't', extmetadata: { License: { value: 'cc-by-sa-4.0' } } }] } } } });
    expect(wm).toHaveLength(1);
    expect(wm[0]).toMatchObject({ title: 'Old map', full: 'https://up/x/1920px-a.jpg', licence: 'Public domain' });
    expect(parseNasa({ collection: { items: [{ data: [{ nasa_id: 'n1', title: 'Moon' }], links: [{ href: 'https://i/n1~medium.jpg', render: 'image' }] }] } })[0]).toMatchObject({ full: 'https://i/n1~large.jpg', licence: 'Public domain' });
    expect(parseMetObject({ objectID: 1, isPublicDomain: false, primaryImageSmall: 'x' })).toEqual([]);
    expect(parseMetObject({ objectID: 2, isPublicDomain: true, primaryImageSmall: 's', primaryImage: 'f', title: 'Wave' })[0]).toMatchObject({ full: 'f', licence: 'CC0' });
    expect(parseAic({ data: [{ id: 5, title: 'Harbor', image_id: 'abc' }, { id: 6, title: 'No image' }], config: { iiif_url: 'https://iiif' } })[0]).toMatchObject({ thumb: 'https://iiif/abc/full/400,/0/default.jpg' });
  });
  it('search words come from the phrase, with a simpler retry', () => {
    expect(stockQueries('The old lighthouse stood alone in the storm')).toEqual(['old lighthouse stood', 'old']);
  });
  it('ranks results by meaning (CLIP similarity), unfetchable thumbnails last', async () => {
    const hits = ['a', 'b', 'c'].map((k): StockHit => ({ key: k, source: 'Openverse', title: k, thumb: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==#${k}`, full: '', page: '', licence: 'CC0' }));
    hits[2].thumb = 'http://localhost:1/missing.png';
    const vec = (x: number) => Float32Array.from([x, Math.sqrt(1 - x * x)]);
    const ranked = await rankStock(hits, 'phrase', { text: async () => vec(1), images: async (b) => b.map((_, i) => vec(i === 0 ? 0.2 : 0.3)) });
    expect(ranked.map((h) => h.key)).toEqual(['b', 'a', 'c']);
    expect(ranked[0].match).toBeGreaterThan(ranked[1].match!);
    expect(ranked[2].match).toBe(0);
  });
});

describe('v6.1 kinetic typography', () => {
  it('words appear on their spoken time, or evenly when the narration does not match', () => {
    expect(wordTimes(['EVERY', 'WORD', 'MOVES'], [{ w: 'every', t: 0.2 }, { w: 'word,', t: 0.6 }, { w: 'moves!', t: 1.1 }], 0.1, 1)).toEqual([0.2, 0.6, 1.1]);
    expect(wordTimes(['A', 'B'], [], 0.1, 1)).toEqual([0.1, 0.6]);
    expect(LETTER_ANIMS).toHaveLength(10);
  });
  it('the kit is registered with 20 layouts, every layout builds and stays inside the frame', () => {
    expect(BUILTIN_KITS.map((k) => k.id)).toContain('typography');
    expect(getKit('typography').templates).toHaveLength(20);
    for (const frame of [{ w: 1920, h: 1080 }, { w: 1080, h: 1920 }]) {
      for (const tpl of TYPOGRAPHY.templates) {
        const c: SceneCtx = { dur: 4, frame, pal: TYPOGRAPHY.variants[0].palette, font: 'Montserrat', k: 2, keyAt: 1.2, last: false, images: ['img1'] };
        const items = TYPOGRAPHY.frameScene(tpl.build({ title: 'Every word moves with your voice', key: 'voice', value: '40%', label: 'growth', items: ['one', 'two', 'three'], image: 'img1' }, c), c);
        expect(items.length, tpl.id).toBeGreaterThan(1);
        const { items: fixed } = fixLayout(items, frame);
        for (const it of fixed.filter((x) => x.type === 'widget' && x.widget === 'ktype')) {
          expect(Math.abs(it.x ?? 0), `${tpl.id} x`).toBeLessThanOrEqual(frame.w / 2);
          expect(Math.abs(it.y ?? 0), `${tpl.id} y`).toBeLessThanOrEqual(frame.h / 2);
          expect(String(it.text).length, tpl.id).toBeGreaterThan(0);
        }
      }
    }
  });
});
