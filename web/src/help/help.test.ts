import { describe, expect, it } from 'vitest';
import { TOPICS } from './topics';
import { TIPS } from './tips';
import { WHATS_NEW } from './whatsnew';

describe('in-app help', () => {
  it('every topic has a title and description in English and Arabic, and tips in both', () => {
    for (const t of TOPICS) {
      expect(t.title.en && t.title.ar, t.id).toBeTruthy();
      expect(t.what.en && t.what.ar, t.id).toBeTruthy();
      expect(t.tips.en.length, t.id).toBeGreaterThan(0);
      expect(t.tips.ar.length, t.id).toBeGreaterThan(0);
    }
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
  });
  it('tours point at unique data-tour targets with both languages', () => {
    for (const t of TOPICS.filter((x) => x.tour)) {
      const sels = t.tour!.map((s) => s.sel);
      expect(new Set(sels).size, t.id).toBe(sels.length);
      for (const s of t.tour!) expect(s.sel).toMatch(/^\[data-tour="[a-z-]+"\]$/), expect(s.en && s.ar).toBeTruthy();
    }
  });
  it('tips and what is new are filled in', () => {
    for (const [id, tip] of Object.entries(TIPS)) expect(tip.en && tip.ar, id).toBeTruthy();
    expect(WHATS_NEW.map((n) => n.version)).toContain('5.0.0');
    for (const n of WHATS_NEW) expect(n.items.length).toBeGreaterThan(0);
  });
});
