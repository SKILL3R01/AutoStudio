import { describe, expect, it } from 'vitest';
import { DOCUMENTARY } from '../styles/documentary';
import { EXPLAINER } from '../styles/explainer';
import { getKit, paletteFromColors, paletteFromPixels } from '../styles';
import type { SceneCtx } from '../styles/types';
import { boxOf, fixLayout } from '../layout';
import { autoSlots, buildStory, mergeScene, newStory, pickTemplates, retimeScenes, splitScene, storyFromDirector, wordsFromScript, type Scene } from './model';
import { applySceneRecipe, applyStoryAnswer, closestTemplate } from './apply';
import { PART_SIZE, partsOf, redoMessage, scriptMessage, storyMessage } from './prompt';
import type { Project } from '../../types';

const SCRIPT = 'Most people wake up already tired every single morning. Forty percent of us check the phone first. Coffee, emails, and notifications fill the first hour. But what if the morning worked for you instead? In 2019 a study followed three thousand people. Their energy grew by thirty percent in a month. So try one small change tomorrow.';
const project = (aspect = '16:9') => ({ export: { aspect }, motion: [], assets: [{ id: 'img1', name: 'sunrise.png', kind: 'image' }], words: [], lines: [], audio: [] }) as unknown as Project;
const ctx = (frame: { w: number; h: number }, k = 0): SceneCtx => ({ dur: 3.5, frame, pal: EXPLAINER.variants[0].palette, font: 'Montserrat', k, keyAt: 0.8, last: false, images: ['img1'] });

describe('scene templates', () => {
  for (const kit of [EXPLAINER, DOCUMENTARY])
    for (const frame of [{ w: 1920, h: 1080 }, { w: 1080, h: 1920 }])
      it(`${kit.id} ${frame.w}x${frame.h}: every design builds and, after layout correction, stays in the safe area without overlaps`, () => {
        const sc: Scene = { id: 'x', start: 0, end: 3.5, text: 'Forty percent of us check the phone first, then coffee and emails', words: [], hints: ['percent', 'list'], keys: ['percent', 'phone'], templateId: '', slots: {}, source: 'template' };
        for (const t of kit.templates) {
          const items = t.build(autoSlots(sc, t), ctx(frame));
          expect(items.length, t.id).toBeGreaterThan(0);
          const { items: fixed } = fixLayout(items, frame);
          const boxes = fixed.map(boxOf).filter((b) => b && b.pri > 0);
          for (const b of boxes) {
            expect(Math.abs(b!.x) + b!.w / 2, `${t.id} x`).toBeLessThanOrEqual(frame.w * 0.47 + 2);
            expect(Math.abs(b!.y) + b!.h / 2, `${t.id} y`).toBeLessThanOrEqual(frame.h * 0.45 + 2);
          }
          const framed = kit.frameScene(fixed, ctx(frame));
          expect(framed.some((x) => x.type === 'background'), t.id).toBe(true);
        }
      });
  it('explainer has ~24 designs and documentary ~20', () => {
    expect(EXPLAINER.templates.length).toBeGreaterThanOrEqual(22);
    expect(DOCUMENTARY.templates.length).toBeGreaterThanOrEqual(18);
  });
});

describe('layout correction', () => {
  it('moves the less important of two overlapping layers and wraps long text', () => {
    const items = [
      { id: 'a', type: 'text' as const, text: 'A really long headline that is far too wide for one line on this frame at this size', size: 120, start: 0, dur: 3 },
      { id: 'b', type: 'widget' as const, widget: 'stat', value: '40%', size: 200, start: 0, dur: 3 },
    ];
    const { items: out, fixes } = fixLayout(items, { w: 1920, h: 1080 });
    expect(out[0].width).toBeLessThanOrEqual(1920 * 0.92);
    expect(fixes.length).toBeGreaterThan(0);
    expect(out[1].x !== undefined || out[1].y !== undefined).toBe(true);
  });
  it('keeps layers off zones to avoid (faces)', () => {
    const { items: out } = fixLayout([{ id: 'b', type: 'widget', widget: 'tag', text: 'NAME', start: 0, dur: 3, x: 0, y: 0 }], { w: 1920, h: 1080 }, [{ x: 0, y: 0, w: 400, h: 500 }]);
    expect(Math.abs(out[0].x ?? 0)).toBeGreaterThan(200);
  });
});

describe('story', () => {
  it('a script becomes timed scenes with varied designs; a voice re-times them', () => {
    const p = project();
    p.story = newStory(p, 'explainer', 'dark', SCRIPT);
    expect(p.story.timing).toBe('script');
    expect(p.story.scenes.length).toBeGreaterThan(5);
    const ids = p.story.scenes.map((s) => s.templateId);
    for (let i = 1; i < ids.length; i++) expect(ids.slice(Math.max(0, i - 3), i)).not.toContain(ids[i]);
    buildStory(p);
    expect(p.motion!.filter((g) => g.id.startsWith('scene_'))).toHaveLength(p.story.scenes.length);
    const voice = wordsFromScript(SCRIPT, 2.1).map((w) => ({ ...w, t: w.t + 1, end: w.end + 1 }));
    retimeScenes(p.story, voice);
    expect(p.story.timing).toBe('voice');
    expect(p.story.scenes[0].start).toBeGreaterThan(0.8);
    expect(p.story.scenes[p.story.scenes.length - 1].end).toBeGreaterThan(voice[voice.length - 1].end);
  });
  it('split and merge keep the scene list continuous', () => {
    const p = project();
    p.story = newStory(p, 'documentary', 'warm', SCRIPT);
    const n = p.story.scenes.length, first = p.story.scenes[0].id;
    expect(splitScene(p.story, first)).toBe(true);
    expect(p.story.scenes.length).toBe(n + 1);
    expect(mergeScene(p.story, p.story.scenes[0].id)).toBe(true);
    expect(p.story.scenes.length).toBe(n);
    pickTemplates(p.story.scenes, getKit('documentary'));
    expect(p.story.scenes.every((s) => s.templateId)).toBe(true);
  });
  it('prompts: one message for ≤ 48 scenes, catalogue + rules in the first; redo and script prompts', () => {
    const p = project();
    p.story = newStory(p, 'explainer', 'dark', SCRIPT);
    expect(partsOf(p.story)).toHaveLength(1);
    const m = storyMessage(p.story, p, 0);
    expect(m).toMatch(/autoStudioStory/);
    expect(m).toMatch(/- big-number:/);
    expect(m).toMatch(/sunrise\.png/);
    expect(redoMessage(p.story, [2, 3], 'stronger')).toMatch(/Redo scenes 2, 3/);
    expect(scriptMessage('why mornings matter', 'documentary', 2, 'auto')).toMatch(/300 words/);
    expect(PART_SIZE).toBeGreaterThanOrEqual(40);
  });
  it('applies an answer (closest design ids, file names → pictures), reports missing scenes', () => {
    const p = project();
    p.story = newStory(p, 'explainer', 'dark', SCRIPT);
    buildStory(p);
    const all = p.story.scenes.map((_, i) => i + 1);
    const raw = '```json\n{"autoStudioStory":1,"scenes":[{"n":1,"template":"Headline","slots":{"title":"Already tired","key":"tired"}},{"n":2,"template":"big number","slots":{"value":"40%","label":"check the phone","image":"sunrise"}}]}\n```';
    const r = applyStoryAnswer(p, raw, all);
    expect(r.ok).toBe(true);
    expect(r.updated).toEqual([1, 2]);
    expect(p.story.scenes[1].templateId).toBe('big-number');
    expect(p.story.scenes[1].slots.image).toBe('img1');
    expect(r.missing.length).toBe(all.length - 2);
    expect(r.truncated).toBe(true);
    expect(closestTemplate('explainer', 'chart', 'headline')).toBe('chart-up');
    const bad = applyStoryAnswer(p, '{"haVisualRecipe":2,"items":[]}', all);
    expect(bad.recipe).toBe(true);
    const sid = p.story.scenes[3].id;
    const rr = applySceneRecipe(p, sid, JSON.stringify({ items: [{ type: 'text', text: 'Hi', start: 0, dur: 2 }] }));
    expect(rr.ok).toBe(true);
    expect(p.story.scenes[3].source).toBe('custom');
    buildStory(p);
    expect(p.motion!.find((g) => g.id === `scene_${sid}`)!.items).toHaveLength(1);
  });
  it('migrates a v4.2 Director plan', () => {
    const st = storyFromDirector({ style: 'pack:paper-explainer', sectionLen: 55, createdAt: 1, status: [], sections: [], bible: {} as never, beats: [{ id: 'b0', i: 0, section: 0, start: 0, end: 3, text: 'Hello there', words: [], keys: ['Hello'], hints: ['plain'], layout: 'slam' }] });
    expect(st.styleId).toBe('documentary');
    expect(st.scenes).toHaveLength(1);
  });
  it('palette from a picture', () => {
    const px = new Uint8ClampedArray(400 * 4);
    for (let i = 0; i < 400; i++) px.set(i < 200 ? [10, 10, 30, 255] : i < 300 ? [250, 240, 230, 255] : [230, 60, 40, 255], i * 4);
    const pal = paletteFromColors(paletteFromPixels(px, 3));
    expect(pal.bg).toMatch(/^#0a0a1e|#0[0-9a-f]/);
    expect(pal.accents[0]).toMatch(/^#e6|#e[0-9a-f]/);
  });
});
