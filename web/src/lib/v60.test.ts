import { describe, expect, it } from 'vitest';
import { EFFECT_CONTROLS, EFFECT_GROUPS, effectOpts, shaderInputs } from '../render/effectcontrols';
import { EFFECT_COST, EFFECT_LABELS } from '../render/effects';
import { BUILTIN_SHADERS } from '../render/shaderfx';
import { PARTICLE_PRESETS, tuneSpec } from '../render/particles';
import { EFFECTS } from '../types';
import { depthSpread, refineDepth, safetyFactor } from '../render/depthrefine';
import { depthLimits, applyLimits } from '../render/depthsafety';
import { parallaxCamera } from '../render/motion';
import { otsu, pushPullFill } from '../ai/layers3d';
import { defaultClip } from './project';

describe('v6.0 effects 2.0', () => {
  it('every effect has a label, a cost and a way to draw; the gallery lists each one once', () => {
    const listed = EFFECT_GROUPS.flatMap(([, k]) => k);
    expect(new Set(listed).size).toBe(listed.length);
    for (const k of EFFECTS.filter((e) => e !== 'none' && e !== 'custom')) {
      expect(EFFECT_LABELS[k], k).toBeTruthy();
      expect(EFFECT_COST[k], k).toBeTruthy();
      expect(listed, k).toContain(k);
    }
    for (const k of ['tealOrange', 'duotone', 'halftone', 'rainGlass', 'neonEdges']) expect(BUILTIN_SHADERS[k], k).toContain('vec4 effect');
    for (const k of ['petals', 'leaves', 'bubbles', 'fireflies', 'lightDust']) expect(PARTICLE_PRESETS[k], k).toBeTruthy();
  });
  it('opts: defaults, then old params (shader slots), then saved values', () => {
    expect(effectOpts({ kind: 'glowPulse' }).speed).toBe(0.5);
    expect(effectOpts({ kind: 'glowPulse', params: [0.9] }).speed).toBe(0.9);
    expect(effectOpts({ kind: 'glowPulse', params: [0.9], opts: { speed: 0.2 } }).speed).toBe(0.2);
    const si = shaderInputs('duotone', effectOpts({ kind: 'duotone', opts: { c2: '#00ff00' } }));
    expect(si.colors).toEqual(['#1b1464', '#00ff00']);
    expect(shaderInputs('fire', { height: 0.8 }).params[0]).toBe(0.8);
    for (const [k, ctl] of Object.entries(EFFECT_CONTROLS)) for (const c of ctl!) expect(c.kind === 'color' ? /^#[0-9a-f]{6}$/i.test(String(c.def)) : typeof c.def === 'number', `${k}.${c.key}`).toBe(true);
  });
  it('particle controls change colours, size, speed and direction (0.5 = the preset)', () => {
    const base = PARTICLE_PRESETS.sparks.spec;
    expect(tuneSpec(base, {})).toMatchObject({ size: base.size, speed: base.speed, direction: base.direction });
    const t = tuneSpec(base, { c1: '#112233', c2: '#445566', size: 1, speed: 0, direction: 1 });
    expect(t.colors).toEqual(['#112233', '#445566']);
    expect(t.size).toBeCloseTo(base.size * 1.75);
    expect(t.speed).toBeCloseTo(base.speed * 0.25);
    expect(t.direction).toBe(base.direction + 90);
  });
});

/** A picture with a bright square, and a soft, offset depth map of it (like the small depth model). */
function scene(w = 96, h = 64) {
  const guide = new Uint8ClampedArray(w * h), depth = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = x >= 30 && x < 60 && y >= 16 && y < 48;
    guide[y * w + x] = inside ? 220 : 40;
    const dx = Math.max(0, 34 - x, x - 64), dy = Math.max(0, 16 - y, y - 48);
    depth[y * w + x] = Math.max(20, 230 - Math.hypot(dx, dy) * 22) + ((x * 7 + y * 13) % 9 === 0 ? 40 : 0);
  }
  return { guide, depth, w, h };
}

describe('v6.0 clean 3D depth', () => {
  it('refinement removes speckles, follows the picture edge and grows the subject slightly', () => {
    const { guide, depth, w, h } = scene();
    const out = refineDepth(depth, guide, w, h);
    const row = 32 * w;
    expect(out[row + 31]).toBeGreaterThan(180);
    expect(out[row + 10]).toBeLessThan(80);
    let speck = 0;
    for (let x = 5; x < 20; x++) speck = Math.max(speck, out[5 * w + x]);
    expect(speck).toBeLessThan(80);
  });
  it('the safety limit keeps the near / far slide under 3 % of the frame (6 % for strong)', () => {
    const { depth } = scene();
    const spread = depthSpread(depth);
    expect(spread).toBeGreaterThan(0.6);
    const f = safetyFactor(spread, 0.07, 0.05, 'safe');
    expect(spread * (0.07 + 0.025) * f).toBeLessThanOrEqual(0.03 + 1e-9);
    expect(safetyFactor(spread, 0.07, 0.05, 'strong')).toBeCloseTo(Math.min(1, 2 * f));
    expect(safetyFactor(spread, 0.035, 0.025, 'safe')).toBeGreaterThan(0.7);
    expect(safetyFactor(0, 0.035, 0.03)).toBe(1);
  });
  it('limits scale the camera and zoom in just enough to hide the frame edge', () => {
    const clip = { ...defaultClip('a', 0), id: 'c' };
    const l = depthLimits(clip, 'parallaxPanLeft', 5, 0.24, 0, 0.9);
    expect(l.factor).toBeLessThan(1);
    const cam = applyLimits(parallaxCamera('parallaxPanLeft', 0, 0, 0.24, 0), l);
    expect(Math.abs(cam.ox)).toBeLessThanOrEqual(0.07 * l.factor + 1e-9);
    expect(cam.zoom).toBeGreaterThan(1);
    expect(0.5 / cam.zoom + Math.abs(cam.ox)).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(depthLimits({ ...clip, depth: { quality: 'strong' } }, 'parallaxPanLeft', 5, 0.24, 0, 0.9).factor).toBeGreaterThan(l.factor);
  });
  it('layers: Otsu splits near from far, and push-pull fills a hole with the surrounding colour', () => {
    const g = new Uint8ClampedArray(1000).map((_, i) => (i < 700 ? 30 + (i % 10) : 200 + (i % 10)));
    const t = otsu(g);
    expect(t).toBeGreaterThanOrEqual(39);
    expect(t).toBeLessThan(200);
    const w = 16, h = 16, rgba = new Uint8ClampedArray(w * h * 4), known = new Uint8Array(w * h).fill(1);
    for (let i = 0; i < w * h; i++) (rgba[i * 4] = 100), (rgba[i * 4 + 1] = 150), (rgba[i * 4 + 2] = 200), (rgba[i * 4 + 3] = 255);
    for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) (known[y * w + x] = 0), (rgba[(y * w + x) * 4] = 0);
    pushPullFill(rgba, known, w, h);
    expect(rgba[(8 * w + 8) * 4]).toBe(100);
    expect(rgba[(8 * w + 8) * 4 + 2]).toBe(200);
  });
});
