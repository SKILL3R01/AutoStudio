import { describe, expect, it } from 'vitest';
import { CHARACTER_WIDGETS } from './index';
import { FACES, POSES, PROPS, SETS } from './stick';
import { CARTOON, frameCartoon } from '../styles/cartoon';
import type { MotionItem } from '../types';
import type { WidgetApi } from '../widgets';

/** A canvas context that accepts every call and records non-finite numbers passed to drawing methods. */
function mockCtx() {
  const bad: string[] = [];
  let calls = 0;
  const grad = { addColorStop: () => {} };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (o, k: string) => {
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return (s: string) => ({ width: s.length * 10 });
      return (...args: unknown[]) => {
        calls++;
        if (args.some((a) => typeof a === 'number' && !Number.isFinite(a))) bad.push(k);
      };
    },
    set: (o, k: string, v) => ((o[k] = v), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, bad, calls: () => calls };
}
const pal = CARTOON.variants[0].palette;
const api = (talkWords = false): WidgetApi => ({
  pal, frame: { w: 1920, h: 1080 }, text: () => {}, icon: () => {}, image: () => undefined, cover: () => {}, shade: (h) => h,
  words: talkWords ? [{ w: 'hello', t: 0.2 }, { w: 'there', t: 0.6 }] : [],
});
const draw = (it: Partial<MotionItem>, t: number, talk = false) => {
  const m = mockCtx();
  CHARACTER_WIDGETS[String(it.widget)](m.ctx, { id: 'x', type: 'widget', start: 0, dur: 4, ...it } as MotionItem, t, api(talk));
  return m;
};

describe('character drawing (mock canvas)', () => {
  it('every pose × face × look draws without errors or NaN', () => {
    for (const look of ['stick', 'cartoon'])
      for (const pose of POSES)
        for (const face of FACES)
          for (const t of [0, 0.4, 1.3]) {
            const m = draw({ widget: 'character', look, pose, face, talk: true, wear: ['', 'tie', 'ponytail', 'hat', 'glasses', 'cap', 'scarf'][(t * 10) % 7 | 0], hold: pose === 'present' ? 'phone' : undefined }, t, true);
            expect(m.bad, `${look} ${pose} ${face}`).toEqual([]);
            expect(m.calls()).toBeGreaterThan(10);
          }
  });
  it('every set (both looks), prop and bubble draws', () => {
    for (const look of ['stick', 'cartoon']) for (const kind of SETS) expect(draw({ widget: 'set', kind, look }, 1).bad, `${look} ${kind}`).toEqual([]);
    for (const kind of PROPS) expect(draw({ widget: 'prop', kind, size: 300 }, 1).bad, kind).toEqual([]);
    for (const kind of ['speech', 'thought']) expect(draw({ widget: 'bubble', kind, text: 'Hello there' }, 0.5).bad, kind).toEqual([]);
  });
});

describe('cartoon style', () => {
  it('has the 18 story designs, and framing turns characters and sets into the cartoon look', () => {
    expect(CARTOON.status).toBe('ready');
    expect(CARTOON.templates.length).toBe(18);
    const c = { dur: 4, frame: { w: 1920, h: 1080 }, pal, font: 'Poppins', k: 1, keyAt: 1, last: false, images: [] };
    for (const tpl of CARTOON.templates) {
      const out = frameCartoon(tpl.build({ title: 'Max found the key', key: 'key', value: '3', items: ['a', 'b'], left: ['x'], right: ['y'] }, c), c);
      const cast = out.filter((x) => x.widget === 'character' || x.widget === 'set');
      expect(cast.length, tpl.id).toBeGreaterThan(1);
      for (const x of cast) expect(x.look, tpl.id).toBe('cartoon');
      expect(out.some((x) => x.widget === 'burst' || x.widget === 'wipe'), `${tpl.id} transition`).toBe(true);
    }
  });
});
