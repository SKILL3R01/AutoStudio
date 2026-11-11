import { describe, expect, it } from 'vitest';
import { recipeToGroup, repairJson } from './recipe';

// The same damage as the pasted ChatGPT answer: curly quotes and a line break before every colour code.
const PASTED = `{“haVisualRecipe”:2,”palette”:{“bg”:”
#1d1a22",”card”:”
#2a2630",”text”:”
#f6efe4",”muted”:”
#a89fa8",”accents”:[“
#ff6b4a”,”
#e8b86a”],”font”:”Montserrat”},”items”:[{“type”:”background”,”kind”:”flat”,”colors”:[“
#1d1a22”],”start”:0,”dur”:3.6},{“type”:”text”,”text”:”He can do it all.”,”start”:0.3,”dur”:3.2,”x”:140,”y”:-90,”size”:96,”font”:”Montserrat”,”weight”:800,”color”:”
#f6efe4",”in”:”cinematic-rise”},{“type”:”widget”,”id”:”wipe”,”start”:3.0,”dur”:1.0,”dir”:”left”,”colors”:[“
#ff6b4a”]}]}`;

describe('recipe import', () => {
  it('repairs the pasted answer and imports every item', () => {
    const { text, report } = repairJson(PASTED);
    expect(report.error).toBeUndefined();
    expect(report.fixes.join(' ')).toMatch(/curly/);
    const r = JSON.parse(text);
    expect(r.palette.bg).toBe('#1d1a22');
    const g = recipeToGroup(PASTED, 5, 'full', 'how the man need a woman').group!;
    expect(g.items.map((i) => i.type)).toEqual(['background', 'text', 'widget']);
    expect(g.start).toBe(5);
    expect(g.dur).toBeCloseTo(4);
    expect(g.palette.accents[0]).toBe('#ff6b4a');
  });
  it('keeps the complete items of a cut-off answer and strips fences / trailing commas', () => {
    const cut = '```json\n{"haVisualRecipe":2,"palette":"dark","items":[{"type":"text","text":"A","start":0,"dur":1,},{"type":"text","text":"B","sta';
    const { text, report } = repairJson(cut);
    expect(report.truncated).toBe(true);
    expect(JSON.parse(text).items).toHaveLength(1);
  });
});
