import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../store';
import { useProject } from './hooks';
import { Section, Seg, Slider } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { FONT_PAIRS, TEMPLATE_LABELS, TYPO_PALETTES, aiBlocks, autoBlocks, blockText, makeBlock, restyle } from '../lib/typography';
import { drawTypography, ensureTypoFonts } from '../render/typography';
import { useLlm } from '../lib/llm';
import { TYPO_TEMPLATES, type TypoBg, type TypoSettings, type TypoTemplate, type Word } from '../types';

const SAMPLES: Record<Exclude<TypoTemplate, 'random'>, string[]> = {
  stack: ['let', 'us', 'create'],
  stackSide: ['motion', 'with', 'let', 'us', 'create'],
  mixed: ['intro', 'outro', 'kinetic', 'typography'],
  scriptCaps: ['doodle', 'whimsy'],
  punch: ['boom'],
};

/** Live thumbnail of a template with the current font pair / palette / background. */
function TemplatePreview({ template, s }: { template: TypoTemplate; s: TypoSettings }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const draw = () => {
      const g = c.getContext('2d')!;
      g.fillStyle = '#20242e';
      g.fillRect(0, 0, c.width, c.height);
      const tpl = template === 'random' ? 'stackSide' : template;
      const words: Word[] = SAMPLES[tpl].map((text, i) => ({ text, start: i * 0.1, end: i * 0.1 + 0.1 }));
      const b = makeBlock(words, { ...s, template: tpl, hold: 5 }, 1, tpl === 'stackSide' ? [0.5, 0, 2, 2, 2] : tpl === 'scriptCaps' ? [0, 2] : tpl === 'mixed' ? [2, 2, 2, 0.5] : undefined);
      b.x = 0.5;
      b.y = 0.5;
      if (tpl === 'scriptCaps') b.words[0].role = 'script';
      if (tpl === 'stackSide') (b.words[0].role = 'side'), (b.words[1].role = 'script');
      drawTypography(g, [b], 3, c.width, c.height);
    };
    draw();
    void ensureTypoFonts().then(draw);
  }, [template, s.fontPair, s.palette, s.bg]);
  return <canvas ref={ref} width={320} height={180} />;
}

export function KeywordsPanel() {
  const p = useProject();
  const { update, select, selection } = useEditor();
  const llm = useLlm((x) => x.status);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<[number, number] | null>(null);
  const s = p.typoSettings;
  const words = useMemo(() => (p.words.length ? p.words : p.lines.flatMap((l) => l.words)), [p.words, p.lines]);
  const setS = (fn: (s: TypoSettings) => void, key?: string) => update((d) => fn(d.typoSettings), key);
  const enableMode = (d: typeof p) => d.captions.mode === 'full' && (d.captions.mode = 'keywords');
  const used = useMemo(() => {
    const set = new Set<number>();
    p.typo.forEach((b) => words.forEach((w, i) => w.start >= b.words[0].start - 0.01 && w.end <= b.words[b.words.length - 1].end + 0.01 && set.add(i)));
    return set;
  }, [p.typo, words]);

  const auto = () => update((d) => {
    d.typo = autoBlocks(words, d.typoSettings);
    enableMode(d);
  });
  const ai = async () => {
    setBusy(true);
    try {
      const blocks = await aiBlocks(words, s);
      if (!blocks.length) throw new Error('The AI returned no phrases');
      update((d) => ((d.typo = blocks), enableMode(d)));
      toast(`AI picked ${blocks.length} phrases`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const createFromRange = () => {
    if (!range) return;
    const [a, b] = [Math.min(...range), Math.max(...range)];
    const blk = makeBlock(words.slice(a, b + 1), s, s.seed * 13 + a);
    update((d) => {
      d.typo = [...d.typo.filter((x) => x.end <= blk.start || x.start >= blk.end), blk].sort((x, y) => x.start - y.start);
      enableMode(d);
    });
    select({ kind: 'keyword', id: blk.id });
    useEditor.getState().seek(blk.start + 0.05);
    setRange(null);
  };
  const pick = (i: number, shift: boolean) => setRange((r) => (shift && r ? [r[0], i] : [i, i]));
  const inRange = (i: number) => range && i >= Math.min(...range) && i <= Math.max(...range);

  return (
    <>
      <Section title="Caption mode">
        <Seg options={[['full', 'Subtitles'], ['keywords', 'Typography'], ['both', 'Both']] as const} value={p.captions.mode} onChange={(v) => update((d) => void (d.captions.mode = v))} />
        <p className="hint">Kinetic typography: short phrases from your voiceover appear as artistic compositions — word by word, in sync with the voice.</p>
      </Section>
      <Section title="1 · Choose the phrases">
        {!words.length && <p className="warn">Add captions first (Captions panel → transcribe or upload a script). Typography uses the word timings.</p>}
        <Slider label="Density" value={s.density} min={0.3} max={6} step={0.1} onChange={(v) => setS((x) => void (x.density = v), 'td')} fmt={(v) => `${v.toFixed(1)}/10s`} />
        <Slider label="Max words" value={s.maxWords} min={1} max={6} step={1} onChange={(v) => setS((x) => void (x.maxWords = v), 'tw')} />
        <Slider label="Hold after" value={s.hold} min={0} max={3} step={0.1} onChange={(v) => setS((x) => void (x.hold = v), 'th')} suffix="s" />
        <div className="row wrap">
          <button className="btn sm primary" disabled={!words.length} onClick={auto}><Icon name="bolt" /> Auto-pick</button>
          <button className="btn sm" disabled={!words.length || busy || llm !== 'ready'} onClick={ai} title={llm !== 'ready' ? 'Connect the LLM in the top bar' : ''}><Icon name="wand" /> {busy ? 'Thinking…' : 'AI pick'}</button>
          {p.typo.length > 0 && <button className="btn sm ghost" onClick={() => update((d) => void (d.typo = []))}>Clear</button>}
        </div>
        {words.length > 0 && (
          <>
            <span className="hint">…or pick manually: click a word, Shift-click the last word, then create.</span>
            <div className="word-picker">
              {words.slice(0, 4000).map((w, i) => (
                <span key={i} className={`${used.has(i) ? 'used' : ''} ${inRange(i) ? 'pick' : ''}`} onClick={(e) => pick(i, e.shiftKey)} title={`${w.start.toFixed(2)}s`}>{w.text} </span>
              ))}
            </div>
            <button className="btn sm" disabled={!range} onClick={createFromRange}><Icon name="plus" /> Create typography{range ? ` (${Math.abs(range[1] - range[0]) + 1} words)` : ''}</button>
          </>
        )}
      </Section>
      <Section title="2 · Look">
        <span className="hint">Template</span>
        <div className="styles">
          {TYPO_TEMPLATES.map((tpl) => (
            <button key={tpl} className={`style ${s.template === tpl ? 'on' : ''}`} onClick={() => update((d) => ((d.typoSettings.template = tpl), (d.typo = restyle(d.typo, d.typoSettings))))}>
              <TemplatePreview template={tpl} s={s} />
              <span>{TEMPLATE_LABELS[tpl]}</span>
            </button>
          ))}
        </div>
        <span className="hint">Font pair</span>
        <div className="chips">
          {Object.entries(FONT_PAIRS).map(([id, fp]) => (
            <button key={id} className={`chipbtn ${s.fontPair === id ? 'on' : ''}`} style={{ fontFamily: fp.main.family, fontWeight: fp.main.weight }} onClick={() => update((d) => {
              d.typoSettings.fontPair = id;
              d.typo.forEach((b) => !b.locked && (b.fontPair = id));
            })}>{fp.name}</button>
          ))}
        </div>
        <span className="hint">Colours</span>
        <div className="palettes">
          {Object.entries(TYPO_PALETTES).map(([id, pal]) => (
            <button key={id} className={`palette ${s.palette === id ? 'on' : ''}`} title={pal.name} onClick={() => update((d) => {
              d.typoSettings.palette = id;
              d.typo.forEach((b) => !b.locked && (b.palette = id));
            })}>
              {[pal.card.startsWith('rgba') ? '#222' : pal.card, pal.text, pal.accent].map((c, k) => <i key={k} style={{ background: c }} />)}
            </button>
          ))}
        </div>
        <span className="hint">Background</span>
        <Seg options={[['none', 'None'], ['shadow', 'Shadow'], ['card', 'Card'], ['frame', 'Full frame']] as [TypoBg, string][]} value={s.bg} onChange={(v) => update((d) => {
          d.typoSettings.bg = v;
          d.typo.forEach((b) => !b.locked && (b.bg = v));
        })} />
        <button className="btn" disabled={!p.typo.length} onClick={() => update((d) => ((d.typoSettings.seed += 1), (d.typo = restyle(d.typo, d.typoSettings))))}><Icon name="dice" /> Shuffle layouts & positions</button>
        <p className="hint">Locked blocks (edited by hand or 🔒) keep their look.</p>
      </Section>
      <Section title={`Blocks (${p.typo.length})`}>
        <div className="list tall">
          {p.typo.map((b) => (
            <div key={b.id} className={`list-item kw-row ${selection?.id === b.id ? 'on' : ''}`} onClick={() => (select({ kind: 'keyword', id: b.id }), useEditor.getState().seek(b.start + 0.3))}>
              <span className="kw-dot" style={{ background: TYPO_PALETTES[b.palette]?.accent }} />
              <span style={{ fontFamily: FONT_PAIRS[b.fontPair]?.main.family }}>{blockText(b)}</span>
              <span className="hint">{b.start.toFixed(1)}s</span>
              <button className="icon-btn" title={b.locked ? 'Unlock' : 'Lock look'} onClick={(e) => (e.stopPropagation(), update((d) => void (d.typo.find((x) => x.id === b.id)!.locked = !b.locked)))}><Icon name="lock" className={b.locked ? 'on' : 'dim'} /></button>
              <button className="icon-btn" onClick={(e) => (e.stopPropagation(), update((d) => void (d.typo = d.typo.filter((x) => x.id !== b.id))))}><Icon name="x" /></button>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
