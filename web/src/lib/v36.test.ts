import { describe, expect, it } from 'vitest';
import { chromaAlpha } from '../render/chroma';
import { dragFocus, pipHitBox } from './previewEdit';
import { newPip } from './pip';
import { defaultClip, newProject } from './project';
import { insertAssetAt } from '../editor/MediaPanel';

describe('v3.6', () => {
  it('chroma key removes the key colour and keeps others', () => {
    const green: [number, number, number] = [0, 0.69, 0.25];
    expect(chromaAlpha([0.02, 0.7, 0.24], green, 0.25, 0.3)).toBeLessThan(0.05);
    expect(chromaAlpha([0.9, 0.7, 0.6], green, 0.25, 0.3)).toBeGreaterThan(0.95);
    expect(chromaAlpha([0.05, 0.05, 0.05], [0, 0, 0], 0.25, 0.3)).toBeLessThan(0.05);
    expect(chromaAlpha([0.9, 0.9, 0.9], [0, 0, 0], 0.25, 0.3)).toBeGreaterThan(0.95);
  });
  it('dragging the main clip right reveals its left side, clamped at the edge', () => {
    const f = dragFocus({ x: 0.5, y: 0.5, zoom: 1 }, 0.1, 0, { width: 1920, height: 1080 }, 1080, 1920);
    expect(f.x).toBeLessThan(0.5);
    expect(dragFocus({ x: 0.5, y: 0.5 }, 5, 0, { width: 1920, height: 1080 }, 1080, 1920).x).toBe(0);
  });
  it('picture-in-picture hit box matches its drawn box', () => {
    const b = pipHitBox(newPip('t', 'a', 0, 1, 'corner'), { id: 'a', kind: 'image', name: '', mime: '', width: 1600, height: 900 }, 1920, 1080);
    expect(b.x).toBeCloseTo(0.8);
    expect(b.w).toBeCloseTo(0.32);
    expect(b.h).toBeCloseTo((0.32 * 1920) / (16 / 9) / 1080);
  });
  it('auto-separate: inserting a video puts its sound on a linked track', () => {
    const store: Record<string, string> = { autoSeparate: '1' };
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] };
    const p = newProject();
    p.assets = [{ id: 'v', kind: 'video', name: 'v', mime: '', duration: 6 }];
    p.clips = [{ ...defaultClip('v', 0), id: 'a' }];
    p.length = 6;
    insertAssetAt(p, 'v', 6);
    expect(p.audio.filter((a) => a.linkClipId)).toHaveLength(1);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
