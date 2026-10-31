import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store';
import { useProject } from './hooks';
import { Section, Seg, Slider, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { FONT_COMBOS, PALETTES, layoutKeywords, pickKeywords } from '../lib/keywords';
import { drawKeyword } from '../render/keywordsRender';
import { chatJson, useLlm } from '../lib/llm';
import { KEYWORD_ANIMS, type KeywordAnim, type KeywordItem, type KeywordSettings } from '../types';
import { uid } from '../lib/util';

function ComboPreview({ fonts, colors }: { fonts: string[]; colors: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const draw = () => {
      const g = c.getContext('2d')!;
      g.fillStyle = '#1c2029';
      g.fillRect(0, 0, c.width, c.height);
      const words = ['BIG', 'idea', 'NOW'];
      words.forEach((w, i) => {
        const k: KeywordItem = { id: '', text: w, start: -1, end: 9, x: 0.2 + i * 0.3, y: i === 1 ? 0.64 : 0.36, font: fonts[i % fonts.length], color: colors[i % colors.length], size: 3.2, rotate: i === 1 ? -6 : 4, anim: 'pop', locked: false };
        drawKeyword(g, k, 1, { stroke: true, shadow: false }, c.width, c.height);
      });
    };
    draw();
    void document.fonts.ready.then(draw);
  }, [fonts, colors]);
  return <canvas ref={ref} width={180} height={64} />;
}

export function KeywordsPanel() {
  const p = useProject();
  const { update, select, selection, time } = useEditor();
  const llm = useLlm((s) => s.status);
  const [busy, setBusy] = useState(false);
  const s = p.keywordSettings;
  const words = p.words.length ? p.words : p.lines.flatMap((l) => l.words);
  const setS = (fn: (s: KeywordSettings) => void, key?: string) => update((d) => fn(d.keywordSettings), key);
  const relayout = (seed = s.seed) => update((d) => {
    d.keywordSettings.seed = seed;
    d.keywords = layoutKeywords(d.keywords, d.keywordSettings, d.export.aspect, d.keywords);
  });
  const autoPick = () => update((d) => {
    d.keywords = layoutKeywords(pickKeywords(words, d.keywordSettings), d.keywordSettings, d.export.aspect);
    if (d.captions.mode === 'full') d.captions.mode = 'keywords';
  });
  const aiPick = async () => {
    setBusy(true);
    try {
      const target = Math.max(3, Math.round((words[words.length - 1].end / 10) * s.density));
      const indexed = words.map((w, i) => `${i}:${w.text}`).join(' ');
      const res = await chatJson<{ index: number; text?: string }[]>(
        'You pick the most powerful, emotional or important single words from a voiceover transcript, to show as big animated keywords on screen. Avoid filler words. Spread picks across the whole transcript.',
        `Transcript (index:word): ${indexed}\n\nPick about ${target} keywords. Return a JSON array like [{"index": 12}, {"index": 40}].`,
        2000,
      );
      const picks = res.map((r) => words[r.index]).filter(Boolean).map((w) => ({ text: w.text.replace(/[.,;:!?،]+$/, ''), start: w.start, end: w.end }));
      if (!picks.length) throw new Error('No keywords returned');
      update((d) => {
        d.keywords = layoutKeywords(picks.sort((a, b) => a.start - b.start), d.keywordSettings, d.export.aspect);
        if (d.captions.mode === 'full') d.captions.mode = 'keywords';
      });
      toast(`AI picked ${picks.length} keywords`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const addAtPlayhead = () => {
    const w = words.find((x) => x.start <= time && x.end >= time) ?? { text: 'KEYWORD', start: time, end: time + 1 };
    const [k] = layoutKeywords([{ text: w.text, start: w.start, end: w.end }], { ...s, seed: s.seed + p.keywords.length + 7 }, p.export.aspect);
    update((d) => void (d.keywords = [...d.keywords, k].sort((a, b) => a.start - b.start)));
    select({ kind: 'keyword', id: k.id });
  };
  const toggleAnim = (a: KeywordAnim) => setS((x) => void (x.anims = x.anims.includes(a) ? x.anims.filter((y) => y !== a) : [...x.anims, a]));

  return (
    <>
      <Section title="Caption mode">
        <Seg options={[['full', 'Subtitles'], ['keywords', 'Keywords only'], ['both', 'Both']] as const} value={p.captions.mode} onChange={(v) => update((d) => void (d.captions.mode = v))} />
        <p className="hint">Keywords appear around the frame in artistic fonts, colours and motion — like the punchy “faceless” style.</p>
      </Section>
      <Section title="Pick keywords">
        {!words.length && <p className="warn">Add captions first (Captions panel → transcribe or upload a script) — keywords use word timings.</p>}
        <Slider label="Density" value={s.density} min={0.5} max={8} step={0.5} onChange={(v) => setS((x) => void (x.density = v), 'kd')} fmt={(v) => `${v}/10s`} />
        <Slider label="Hold" value={s.hold} min={0.4} max={4} step={0.1} onChange={(v) => setS((x) => void (x.hold = v), 'kh')} suffix="s" />
        <div className="row wrap">
          <button className="btn sm primary" disabled={!words.length} onClick={autoPick}><Icon name="bolt" /> Auto-pick</button>
          <button className="btn sm" disabled={!words.length || busy || llm !== 'ready'} onClick={aiPick} title={llm !== 'ready' ? 'Connect the LLM in the top bar' : ''}><Icon name="wand" /> {busy ? 'Thinking…' : 'AI pick'}</button>
          <button className="btn sm" onClick={addAtPlayhead}><Icon name="plus" /> At playhead</button>
        </div>
      </Section>
      <Section title="Look">
        <span className="hint">Font combination</span>
        <div className="combos">
          {Object.entries(FONT_COMBOS).map(([id, c]) => (
            <button key={id} className={`combo ${s.combo === id ? 'on' : ''}`} onClick={() => (setS((x) => void (x.combo = id)), setTimeout(() => relayout(), 0))}>
              <ComboPreview fonts={c.fonts} colors={PALETTES[s.palette]?.colors ?? ['#fff']} />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
        <span className="hint">Colour palette</span>
        <div className="palettes">
          {Object.entries(PALETTES).map(([id, pal]) => (
            <button key={id} className={`palette ${s.palette === id ? 'on' : ''}`} onClick={() => (setS((x) => void (x.palette = id)), setTimeout(() => relayout(), 0))} title={pal.name}>
              {pal.colors.map((c) => <i key={c} style={{ background: c }} />)}
            </button>
          ))}
        </div>
        <span className="hint">Placement</span>
        <Seg options={[['safe', 'Safe zones'], ['random', 'Random'], ['grid', 'Grid']] as const} value={s.placement} onChange={(v) => (setS((x) => void (x.placement = v)), setTimeout(() => relayout(), 0))} />
        <span className="hint">Animations (random mix of the selected)</span>
        <div className="chips">
          {KEYWORD_ANIMS.map((a) => <button key={a} className={`chipbtn ${s.anims.includes(a) ? 'on' : ''}`} onClick={() => toggleAnim(a)}>{a}</button>)}
        </div>
        <div className="row wrap">
          <Toggle label="UPPERCASE" value={s.uppercase} onChange={(v) => setS((x) => void (x.uppercase = v))} />
          <Toggle label="Outline" value={s.stroke} onChange={(v) => setS((x) => void (x.stroke = v))} />
          <Toggle label="Shadow" value={s.shadow} onChange={(v) => setS((x) => void (x.shadow = v))} />
        </div>
        <button className="btn" disabled={!p.keywords.length} onClick={() => relayout(s.seed + 1)}><Icon name="dice" /> Randomize fonts, colours & positions</button>
        <p className="hint">Locked keywords (moved by hand or with 🔒) keep their look.</p>
      </Section>
      <Section title={`Keywords (${p.keywords.length})`}>
        <div className="list tall">
          {p.keywords.map((k) => (
            <div key={k.id} className={`list-item kw-row ${selection?.id === k.id ? 'on' : ''}`} onClick={() => (select({ kind: 'keyword', id: k.id }), useEditor.getState().seek(k.start + 0.15))}>
              <span className="kw-dot" style={{ background: k.color }} />
              <span style={{ fontFamily: k.font }}>{k.text}</span>
              <span className="hint">{k.start.toFixed(1)}s</span>
              <button className="icon-btn" title={k.locked ? 'Unlock' : 'Lock look'} onClick={(e) => (e.stopPropagation(), update((d) => void (d.keywords.find((x) => x.id === k.id)!.locked = !k.locked)))}><Icon name="lock" className={k.locked ? 'on' : 'dim'} /></button>
              <button className="icon-btn" onClick={(e) => (e.stopPropagation(), update((d) => void (d.keywords = d.keywords.filter((x) => x.id !== k.id))))}><Icon name="x" /></button>
            </div>
          ))}
        </div>
        {p.keywords.length > 0 && <button className="btn sm ghost" onClick={() => update((d) => void (d.keywords = []))}>Remove all</button>}
      </Section>
    </>
  );
}

export const newKeyword = (text: string, t: number): KeywordItem => ({ id: uid(), text, start: t, end: t + 1.2, x: 0.5, y: 0.4, font: 'Bebas Neue', color: '#ffe600', size: 1, rotate: 0, anim: 'pop', locked: true });
