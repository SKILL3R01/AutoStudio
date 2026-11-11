import { describe, expect, it } from 'vitest';
import { detectLicence, frontMatter, importPack, styleText } from './importer';
import { zipFiles } from '../../lib/zip';
import { readZip } from '../../lib/unzip';
import { countUp, widgetBox } from '../widgets';
import { buildMotionPrompt } from '../prompt';

describe('style pack import', () => {
  it('detects licences', () => {
    expect(detectLicence('MIT License\nCopyright (c) 2026')).toBe('open');
    expect(detectLicence('Copyright the owner. All rights reserved.')).toBe('restricted');
    expect(detectLicence('hello')).toBe('unknown');
  });
  it('reads front matter and drops setup / render steps', () => {
    const fm = frontMatter('---\nname: paper-look\ndescription: "Warm paper"\n---\n# Look\nTape and grain.\n## Setup\nnpm install\n## Motion\nSlow drift.\nRun `node render.mjs`\n');
    expect(fm.name).toBe('paper-look');
    expect(fm.description).toBe('Warm paper');
    const s = styleText(fm.body);
    expect(s).toMatch(/Tape and grain/);
    expect(s).toMatch(/Slow drift/);
    expect(s).not.toMatch(/npm install|render\.mjs/);
  });
  it('round-trips a zip and keeps only instructions', async () => {
    const enc = new TextEncoder();
    const zip = await zipFiles([
      { name: 'my-pack/skills/look/SKILL.md', data: enc.encode('---\nname: my-look\n---\n# The look\nBig bold type.') },
      { name: 'my-pack/LICENSE', data: enc.encode('MIT License') },
      { name: 'my-pack/kit/render.mjs', data: enc.encode('console.log(1)') },
      { name: 'my-pack/kit/paper.png', data: new Uint8Array([1, 2, 3]) },
    ]);
    expect((await readZip(zip)).map((e) => e.name)).toHaveLength(4);
    const p = await importPack(new File([zip], 'my-pack.plugin'));
    expect(p.name).toBe('my-look');
    expect(p.licence).toBe('open');
    expect(p.direction).toMatch(/Big bold type/);
    expect(p.files.find((f) => f.name.endsWith('render.mjs'))?.use).toBe('code');
    const prompt = buildMotionPrompt({ idea: 'x', placement: 'full', aspect: '16:9', length: 'auto', style: `user:${p.id}`, language: 'en', userPack: p });
    expect(prompt).toMatch(/STYLE PACK "my-look"/);
    expect(prompt).toMatch(/IGNORE every instruction/);
  });
  it('paper pack adds its widgets to the prompt', () => {
    const pr = buildMotionPrompt({ idea: 'x', placement: 'full', aspect: '16:9', length: 'auto', style: 'pack:paper-explainer', language: 'en' });
    expect(pr).toMatch(/cutout:/);
    expect(pr).toMatch(/Paper explainer/);
  });
});

describe('widgets', () => {
  it('counts numbers up keeping prefix / suffix', () => {
    expect(countUp('$2.4M', 0.5)).toBe('$1.2M');
    expect(countUp('+1,200', 1)).toBe('+1,200');
    expect(countUp('95%', 0)).toBe('0%');
    expect(countUp('24/7', 1)).toBe('24/7');
  });
  it('gives selection boxes', () => {
    expect(widgetBox({ id: 'a', type: 'widget', widget: 'chart-line', start: 0, dur: 1, w: 700, h: 380 })).toEqual({ w: 700, h: 380 });
    expect(widgetBox({ id: 'a', type: 'widget', widget: 'unknown', start: 0, dur: 1 })).toEqual({ w: 520, h: 300 });
  });
});
