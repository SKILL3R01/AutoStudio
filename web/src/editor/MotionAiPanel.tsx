/** Story panel (left rail): open Story Studio, add one motion moment at the playhead (AI hand-off), Add elements, motion blocks. */
import { useMemo, useState } from 'react';
import { useEditor } from '../store';
import { useProject } from './hooks';
import { Section, Seg, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { fmtTime } from '../lib/util';
import { buildMotionPrompt, frameFor } from '../motion/prompt';
import { recipeToGroup } from '../motion/recipe';
import { getKit, variantOf } from '../motion/styles';
import { LiveThumb } from './pickers/LiveThumb';
import { AddPanel, stylePreview } from './pickers/pickers';
import { HandoffPanel } from './HandoffPanel';
import type { MotionGroup } from '../motion/types';

type Place = 'full' | 'overlay' | 'band-top' | 'band-bottom';
const PLACES: [Place, string][] = [['full', 'Full frame'], ['overlay', 'Over video'], ['band-top', 'Top band'], ['band-bottom', 'Bottom band']];
const LENGTHS = ['auto', '8', '15', '25', '40', '60'];
/** Style tiles for one motion moment: "AI invents", Documentary, Explainer colour variants. */
const LOOKS: { id: string; name: string; kit: string; variant?: string; style: string }[] = [
  { id: 'free', name: 'AI invents', kit: 'explainer', variant: 'neon', style: 'free' },
  { id: 'paper', name: 'Documentary', kit: 'documentary', style: 'pack:paper-explainer' },
  ...['dark', 'brand', 'ocean', 'sunset', 'neon', 'hud'].map((v) => ({ id: v, name: getKit('explainer').variants.find((x) => x.id === v)?.name ?? v, kit: 'explainer', variant: v, style: v })),
];

export function MotionAiPanel() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const time = useEditor((s) => s.time);
  const select = useEditor((s) => s.select);
  const seek = useEditor((s) => s.seek);
  const [idea, setIdea] = useState(() => localStorage.getItem('mgfx:idea') ?? '');
  const [place, setPlace] = useState<Place>(() => (localStorage.getItem('mgfx:place') as Place) ?? 'full');
  const [length, setLength] = useState('auto');
  const [look, setLook] = useState(() => localStorage.getItem('mgfx:look') ?? 'free');
  const [useVoice, setUseVoice] = useState(true);
  const placement = place.startsWith('band') ? 'band' : (place as 'full' | 'overlay');
  const frame = frameFor(placement, p.export.aspect);
  const lk = LOOKS.find((l) => l.id === look) ?? LOOKS[0];
  const st = p.story;

  const narration = useMemo(() => {
    if (!useVoice) return [];
    const span = length === 'auto' ? 25 : +length;
    return (p.words?.length ? p.words : p.lines.flatMap((l) => l.words)).filter((w) => w.start >= time - 0.05 && w.start < time + span).map((w) => ({ t: Math.max(0, w.start - time), w: w.text }));
  }, [p.words, p.lines, time, length, useVoice]);
  const prompt = () => buildMotionPrompt({ idea, placement, aspect: p.export.aspect, length, style: lk.style, language: 'auto', narration, assets: p.assets.filter((a) => a.kind === 'image').slice(0, 30).map((a) => a.name) });

  const insert = (g: MotionGroup) => {
    if (place === 'band-bottom') g.band = { side: 'bottom', h: 0.5 };
    update((d) => void (d.motion = [...(d.motion ?? []), g]));
    select({ kind: 'motion', id: g.id });
  };
  const studio = () => window.dispatchEvent(new CustomEvent('autostudio:dialog', { detail: 'story' }));
  const studioThumb = useMemo(() => stylePreview(getKit(st?.styleId ?? 'documentary'), st?.variantId), [st?.styleId, st?.variantId]);

  return (
    <div className="mgfx">
      <div className="story-card" data-tour="story-card">
        <LiveThumb group={studioThumb} width={268} height={151} onClick={studio} title="Open Story Studio" />
        <b>{st ? `${getKit(st.styleId).name} · ${st.scenes.length} scenes` : 'Make a video from a script'}</b>
        <span className="hint">{st ? `${st.scenes.filter((s) => s.source === 'ai').length} designed by AI · ${fmtTime(st.scenes[st.scenes.length - 1]?.end ?? 0)}` : 'Script or voiceover → a style → every scene animated.'}</span>
        <button className="btn primary" onClick={studio}><Icon name="sparkles" /> {st ? 'Open Story Studio' : 'Start a story'}</button>
      </div>

      <Section title="Add motion here" help="handoff">
        <p className="hint">One animated moment at the playhead ({fmtTime(time)}), designed by the AI.</p>
        <textarea rows={3} placeholder="What should it show? e.g. 40% of people check the phone first" value={idea} onChange={(e) => (setIdea(e.target.value), localStorage.setItem('mgfx:idea', e.target.value))} />
        <label className="lbl">Where</label>
        <Seg options={PLACES} value={place} onChange={(v) => (setPlace(v), localStorage.setItem('mgfx:place', v))} />
        <label className="lbl">Look</label>
        <div className="look-grid">
          {LOOKS.map((l) => (
            <LiveThumb key={l.id} width={128} height={72} className={look === l.id ? 'on' : ''} title={l.name} onClick={() => (setLook(l.id), localStorage.setItem('mgfx:look', l.id))}
              group={stylePreview(getKit(l.kit), l.variant ?? variantOf(getKit(l.kit)).id)}>
              <span className="thumb-label">{l.name}</span>
            </LiveThumb>
          ))}
        </div>
        <label className="lbl">Length</label>
        <div className="chips-row">{LENGTHS.map((l) => <button key={l} className={`chip ${length === l ? 'on' : ''}`} onClick={() => setLength(l)}>{l === 'auto' ? 'As needed' : `${l} s`}</button>)}</div>
        <Toggle label={narration.length ? `Follow the voice (${narration.length} words from ${fmtTime(time)})` : 'Follow the voice (no words at the playhead)'} value={useVoice} onChange={setUseVoice} />
        <HandoffPanel parts={1} what={() => 'this moment'} message={prompt}
          apply={(_i, raw) => {
            const r = recipeToGroup(raw, time, placement, idea, frame);
            if (!r.group) return { ok: false, lines: [`✗ ${r.report.error}`], reply: `That was not valid JSON (${r.report.error}). Send the complete recipe again as ONE valid JSON object only.` };
            insert(r.group);
            return { ok: true, lines: [`✓ Added ${r.group.items.length} layers · ${fmtTime(r.group.dur)} at ${fmtTime(time)}`, ...r.report.fixes.map((f) => `Fixed: ${f}`), ...r.warnings.slice(0, 3).map((w) => `⚠ ${w}`)] };
          }} />
      </Section>

      <Section title="Add elements" help="add">
        <AddPanel pal={st ? variantOf(getKit(st.styleId), st.variantId).palette : getKit(lk.kit).variants[0].palette} />
      </Section>

      {!!p.motion?.length && (
        <Section title={`Motion blocks (${p.motion.length})`} help="motion-props">
          {p.motion.map((g) => (
            <div key={g.id} className="mgfx-row">
              <button className="link" onClick={() => (select({ kind: 'motion', id: g.id }), seek(g.start))}>{g.name}</button>
              <span className="hint">{fmtTime(g.start)} · {fmtTime(g.dur)}</span>
              <button className="icon-btn" title={g.hidden ? 'Show' : 'Hide'} onClick={() => update((d) => void d.motion!.forEach((x) => x.id === g.id && (x.hidden = !x.hidden)))}><Icon name={g.hidden ? 'eye-off' : 'eye'} size={14} /></button>
              <button className="icon-btn" title="Copy recipe JSON" onClick={() => void navigator.clipboard.writeText(JSON.stringify({ autoStudioRecipe: 1, palette: g.palette, items: g.items })).then(() => toast('Recipe copied', 'ok'))}><Icon name="copy" size={14} /></button>
              <button className="icon-btn" title="Delete" onClick={() => update((d) => void (d.motion = d.motion!.filter((x) => x.id !== g.id)))}><Icon name="trash" size={14} /></button>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
