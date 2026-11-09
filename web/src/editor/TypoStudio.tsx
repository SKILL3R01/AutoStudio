import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store';
import { useProject } from './hooks';
import { Section, Select, Slider, Seg } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { uid } from '../lib/util';
import { drawTypography, palOf, pairOf } from '../render/typography';
import { FONT_PAIRS, TYPO_PALETTES } from '../lib/typography';
import { CAPTION_FONTS } from '../render/captions';
import { DESIGN_GROUPS, TYPO_DESIGNS, applyDesign, designOf, loadMyDesigns, saveMyDesigns, type TypoDesign } from '../lib/typostyles';
import { TYPO_ENTERS, TYPO_EXITS, type TypoBlock } from '../types';

const SAMPLE: TypoBlock['words'] = [
  { text: 'Your', start: 0.1, end: 0.3, role: 'minor' },
  { text: 'story', start: 0.35, end: 0.7, role: 'script' },
  { text: 'starts', start: 0.75, end: 1.0, role: 'main' },
  { text: 'today', start: 1.05, end: 1.4, role: 'main' },
];
const FONTS = [...new Set([...Object.values(FONT_PAIRS).flatMap((p) => [p.main.family, p.minor.family, p.script.family, p.side.family]), ...CAPTION_FONTS])].sort();

const sampleBlock = (x: Partial<TypoBlock>): TypoBlock => ({ id: 's', start: 0, end: 2.2, template: 'stack', x: 0.5, y: 0.5, scale: 1, rotate: 0, palette: 'mono-yellow', fontPair: 'spartan-pacifico', bg: 'shadow', words: SAMPLE, locked: false, ...x });

/** Animated thumbnail: plays the design on a sample phrase, in a loop. */
function DesignThumb({ block, animate }: { block: TypoBlock; animate: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    const draw = () => {
      const t = animate ? ((performance.now() - t0) / 1000) % 2.8 : 1.6;
      const gr = g.createLinearGradient(0, 0, c.width, c.height);
      gr.addColorStop(0, '#22304a');
      gr.addColorStop(1, '#4a3657');
      g.fillStyle = gr;
      g.fillRect(0, 0, c.width, c.height);
      drawTypography(g, [block], t, c.width, c.height, [0.4, 0.8, 1.2]);
      if (animate) raf = requestAnimationFrame(draw);
    };
    void document.fonts.ready.then(draw);
    return () => cancelAnimationFrame(raf);
  }, [block, animate]);
  return <canvas ref={ref} width={192} height={108} />;
}

export function TypoStudio() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const sel = useEditor((s) => s.selection);
  const [mine, setMine] = useState<TypoDesign[]>(loadMyDesigns);
  const [group, setGroup] = useState('All');
  const [hover, setHover] = useState<string | null>(null);
  const selected = sel?.kind === 'keyword' ? p.typo.find((b) => b.id === sel.id) : undefined;
  const target = selected ?? p.typo[0];
  const designs = [...mine, ...TYPO_DESIGNS].filter((x) => group === 'All' || x.group === group);

  /** Apply to the selected block, or to every unlocked block when none is selected. */
  const apply = (x: TypoDesign, all = !selected) => update((d) => {
    for (const b of d.typo) if ((all ? !b.locked : b.id === selected?.id)) applyDesign(b, x);
    d.typoSettings.template = x.template;
    d.typoSettings.palette = x.palette;
    d.typoSettings.fontPair = x.fontPair;
    d.typoSettings.bg = x.bg;
  });
  const edit = (fn: (b: TypoBlock) => void, key: string) => update((d) => {
    for (const b of d.typo) if (selected ? b.id === selected.id : !b.locked) fn(b);
  }, key);
  const saveMine = () => {
    if (!target) return;
    const name = prompt('Name this style', 'My style');
    if (!name) return;
    const next = [designOf(target, name, uid()), ...mine];
    setMine(next);
    saveMyDesigns(next);
    toast(`Saved “${name}” to My styles — available in every project`, 'ok');
  };
  const removeMine = (id: string) => {
    const next = mine.filter((x) => x.id !== id);
    setMine(next);
    saveMyDesigns(next);
  };

  const pal = target && palOf(target);
  const pair = target && pairOf(target);
  return (
    <>
      <Section title="Style library" hint={selected ? 'Click a style to apply it to the selected block.' : 'Click a style to apply it to all blocks (select a block on the timeline to style just that one).'}>
        <div className="row wrap">{['All', ...(mine.length ? ['My styles'] : []), ...DESIGN_GROUPS].map((g) => <button key={g} className={`chip ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>{g}</button>)}</div>
        <div className="typo-gallery">
          {designs.map((x) => (
            <div key={x.id} className="typo-style" onMouseEnter={() => setHover(x.id)} onMouseLeave={() => setHover(null)} onClick={() => apply(x)} title={`${x.name} · ${x.group}`}>
              <DesignThumb block={sampleBlock({ ...x, style: x.style })} animate={hover === x.id} />
              <span>{x.name}</span>
              {x.group === 'My styles' && <em onClick={(e) => (e.stopPropagation(), removeMine(x.id))} title="Delete">×</em>}
            </div>
          ))}
        </div>
        {!p.typo.length && <p className="hint">Pick the phrases below first — styles apply to typography blocks.</p>}
      </Section>
      {target && pal && pair && (
        <Section title={selected ? 'Design · selected block' : 'Design · all blocks'} hint="Fine-tune the look. Save it as your own style to reuse it in any project.">
          <div className="typo-live"><DesignThumb block={{ ...target, start: 0, end: 2.2, words: SAMPLE }} animate /></div>
          <Select label="Layout" value={target.template} options={[['stack', 'Stack'], ['stackSide', 'Stack + side'], ['mixed', 'Mixed'], ['scriptCaps', 'Script + caps'], ['punch', 'Punch']]} onChange={(v) => edit((b) => void (b.template = v as TypoBlock['template']), 'ts-l')} />
          <Select label="Palette" value={target.palette} options={Object.entries(TYPO_PALETTES).map(([k, v]) => [k, v.name] as [string, string])} onChange={(v) => edit((b) => void ((b.palette = v), b.style && delete b.style.colors), 'ts-p')} />
          <div className="row wrap colors">
            {(['text', 'minor', 'accent', 'card'] as const).map((k) => (
              <label key={k} className="field"><span>{{ text: 'Main', minor: 'Minor', accent: 'Accent', card: 'Card' }[k]}</span>
                <input type="color" value={/^#/.test(pal[k]) ? pal[k].slice(0, 7) : '#000000'} onChange={(e) => edit((b) => void (b.style = { ...b.style, colors: { ...b.style?.colors, [k]: e.target.value } }), `ts-c${k}`)} />
              </label>
            ))}
          </div>
          <Select label="Font pair" value={target.fontPair} options={Object.entries(FONT_PAIRS).map(([k, v]) => [k, v.name] as [string, string])} onChange={(v) => edit((b) => void ((b.fontPair = v), b.style && delete b.style.fonts), 'ts-f')} />
          {(['main', 'script'] as const).map((role) => (
            <Select key={role} label={role === 'main' ? 'Main font' : 'Accent font'} value={pair[role].family} options={FONTS.map((f) => [f, f] as [string, string])} onChange={(v) => edit((b) => void (b.style = { ...b.style, fonts: { ...b.style?.fonts, [role]: { family: v, weight: pairOf(b)[role].weight } } }), `ts-ff${role}`)} />
          ))}
          <Seg options={[['auto', 'Auto case'], ['upper', 'ALL CAPS'], ['none', 'As typed']] as const} value={target.style?.caps ?? 'auto'} onChange={(v) => edit((b) => void (b.style = { ...b.style, caps: v }), 'ts-caps')} />
          <Select label="Background" value={target.bg} options={[['none', 'None'], ['shadow', 'Soft shadow'], ['card', 'Card'], ['frame', 'Full frame']]} onChange={(v) => edit((b) => void (b.bg = v as TypoBlock['bg']), 'ts-bg')} />
          <Slider label="Glow" value={target.style?.glow ?? 0} min={0} max={1} onChange={(v) => edit((b) => void (b.style = { ...b.style, glow: v }), 'ts-glow')} />
          <Select label="Entrance" value={target.enter ?? 'auto'} options={TYPO_ENTERS.map((e) => [e, e] as [string, string])} onChange={(v) => edit((b) => void (b.enter = v as TypoBlock['enter']), 'ts-en')} />
          <Select label="Exit" value={target.exit ?? 'auto'} options={TYPO_EXITS.map((e) => [e, e] as [string, string])} onChange={(v) => edit((b) => void (b.exit = v as TypoBlock['exit']), 'ts-ex')} />
          <Slider label="Speed" value={target.speed ?? 1} min={0.5} max={2} step={0.05} onChange={(v) => edit((b) => void (b.speed = v), 'ts-sp')} fmt={(v) => `${v.toFixed(2)}×`} />
          <Seg options={[['word', 'On the word'], ['lead', 'Lead-in'], ['beat', 'On the beat']] as const} value={target.timing ?? 'word'} onChange={(v) => edit((b) => void (b.timing = v), 'ts-tm')} />
          {target.timing === 'beat' && !p.audio.some((c) => p.audioTracks.find((t) => t.id === c.trackId)?.kind === 'music') && <p className="hint">“On the beat” uses the music track — add music in Voice → Audio.</p>}
          <div className="row wrap">
            <button className="btn sm primary" onClick={saveMine}><Icon name="plus" /> Save as my style</button>
            {selected && <button className="btn sm ghost" onClick={() => apply(designOf(selected, 'tmp', 'tmp'), true)}>Apply this design to all blocks</button>}
          </div>
        </Section>
      )}
    </>
  );
}
