import { describe, expect, it } from 'vitest';
import { shiftErrorLines, BUILTIN_SHADERS } from './shaderfx';
import { PARTICLE_PRESETS, drawParticles } from './particles';
import { extractShader } from '../editor/EffectsLab';
import { EFFECTS } from '../types';
import { EFFECT_COST, EFFECT_LABELS } from './effects';

/** Records the drawing calls so particle output can be compared between runs. */
function fakeCtx() {
  const log: string[] = [];
  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (t, k) => (k in t ? t[k as string] : (...a: unknown[]) => void log.push(`${String(k)}(${a.map((x) => (typeof x === 'number' ? x.toFixed(2) : String(x))).join(',')})`)),
    set: (t, k, v) => ((t[k as string] = v), log.push(`${String(k)}=${typeof v === 'number' ? v.toFixed(3) : v}`), true),
  };
  const g = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) } as Record<string, unknown>, handler);
  return { g: g as unknown as CanvasRenderingContext2D, log };
}

describe('v1.13 effects', () => {
  it('particles are deterministic per time (preview = export) and thin with quality', () => {
    const a = fakeCtx(), b = fakeCtx(), c = fakeCtx();
    drawParticles(a.g, PARTICLE_PRESETS.sparks.spec, 1, 3.7, 1920, 1080);
    drawParticles(b.g, PARTICLE_PRESETS.sparks.spec, 1, 3.7, 1920, 1080);
    drawParticles(c.g, PARTICLE_PRESETS.sparks.spec, 1, 3.7, 1920, 1080, 0.5);
    expect(a.log).toEqual(b.log);
    expect(c.log.length).toBeLessThan(a.log.length * 0.7);
  });
  it('extracts a shader function from chatty / fenced AI answers', () => {
    const body = 'vec4 effect(vec2 uv, vec4 frame) { if (uv.x > 0.5) { return frame; } return vec4(1.0); }';
    expect(extractShader('Sure! Here it is:\n```glsl\n' + body + '\n```\nEnjoy')).toBe(body);
    expect(extractShader('precision x;\n' + body + '\nvoid other(){}')).toBe(body);
  });
  it('maps compile errors to the user\'s line numbers', () => {
    expect(shiftErrorLines('ERROR: 0:20: syntax error', 17)).toBe('line 3: syntax error');
  });
  it('every effect has a label and a cost; shader built-ins define effect()', () => {
    for (const k of EFFECTS) expect(EFFECT_LABELS[k] && EFFECT_COST[k], k).toBeTruthy();
    for (const [k, src] of Object.entries(BUILTIN_SHADERS)) expect(src, k).toMatch(/vec4 effect\(vec2 uv, vec4 frame\)/);
  });
});
