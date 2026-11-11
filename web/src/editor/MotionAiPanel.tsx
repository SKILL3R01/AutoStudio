/** Motion AI panel: describe → prompt for Claude / ChatGPT / Gemini (or the local assistant) → paste the recipe → editable motion layers. */
import { useMemo, useState } from 'react';
import { useEditor } from '../store';
import { useProject } from './hooks';
import { Section, Seg, Select, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { TARGETS, type Target } from '../lib/prompts';
import { handOff } from '../tools/PromptStudio';
import { chat, useLlm } from '../lib/llm';
import { fmtTime } from '../lib/util';
import { buildMotionPrompt, frameFor } from '../motion/prompt';
import { PALETTES, recipeToGroup } from '../motion/recipe';
import { STYLE_PACKS } from '../motion/packs/paper';
import { importPack, loadUserPacks, saveUserPacks, type UserPack } from '../motion/packs/importer';
import { FilePick } from '../components/ui';
import type { MotionGroup } from '../motion/types';

type Place = 'full' | 'overlay' | 'band-top' | 'band-bottom';
const PLACES: [Place, string][] = [['full', 'Full frame'], ['overlay', 'Over video'], ['band-top', 'Top band'], ['band-bottom', 'Bottom band']];
const LENGTHS: [string, string][] = [['auto', 'As needed'], ['8', '8 s'], ['15', '15 s'], ['25', '25 s'], ['40', '40 s'], ['60', '60 s']];

export function MotionAiPanel() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const time = useEditor((s) => s.time);
  const select = useEditor((s) => s.select);
  const seek = useEditor((s) => s.seek);
  const llmOk = useLlm((s) => !!s.model);
  const [idea, setIdea] = useState(() => localStorage.getItem('mgfx:idea') ?? '');
  const [place, setPlace] = useState<Place>(() => (localStorage.getItem('mgfx:place') as Place) ?? 'full');
  const [length, setLength] = useState('auto');
  const [style, setStyle] = useState('free');
  const [language, setLanguage] = useState<'auto' | 'en' | 'ar'>('auto');
  const [useVoice, setUseVoice] = useState(true);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [packs, setPacks] = useState<UserPack[]>(loadUserPacks);
  const [review, setReview] = useState<UserPack | null>(null);
  const [allowed, setAllowed] = useState(false);
  const userPack = packs.find((x) => style === `user:${x.id}`);
  const placement = place.startsWith('band') ? 'band' : (place as 'full' | 'overlay');
  const aspect = p.export.aspect;
  const frame = frameFor(placement, aspect);

  // Narration words from the playhead over the chosen length (times relative to the playhead).
  const narration = useMemo(() => {
    if (!useVoice) return [];
    const span = length === 'auto' ? 25 : +length;
    return p.lines.flatMap((l) => l.words).filter((w) => w.start >= time - 0.05 && w.start < time + span).map((w) => ({ t: Math.max(0, w.start - time), w: w.text }));
  }, [p.lines, time, length, useVoice]);
  const prompt = useMemo(() => buildMotionPrompt({ idea, placement, aspect, length, style, language, narration, assets: p.assets.filter((a) => a.kind === 'image').slice(0, 30).map((a) => a.name), userPack }), [idea, placement, aspect, length, style, language, narration, p.assets, userPack]);

  const check = useMemo(() => (paste.trim() ? recipeToGroup(paste, time, placement, idea, frame) : null), [paste, time, placement, idea, frame]);

  const insert = (g: MotionGroup) => {
    if (place === 'band-bottom') g.band = { side: 'bottom', h: 0.5 };
    update((d) => void (d.motion = [...(d.motion ?? []), g]));
    select({ kind: 'motion', id: g.id });
    toast(`Added "${g.name}" · ${g.items.length} layers · ${fmtTime(g.dur)}`, 'ok');
  };

  const remember = () => (localStorage.setItem('mgfx:idea', idea), localStorage.setItem('mgfx:place', place));
  const generate = async () => {
    remember();
    setBusy(true);
    try {
      let reply = await chat([{ role: 'user', content: prompt }], { maxTokens: 6000, temperature: 0.8, timeoutMs: 300000 });
      let r = recipeToGroup(reply, time, placement, idea, frame);
      if (!r.group) {
        // One repair round: send the error back.
        reply = await chat([{ role: 'user', content: prompt }, { role: 'assistant', content: reply }, { role: 'user', content: `That was not valid JSON (${r.report.error}). Answer again with the complete recipe as ONE valid JSON object only.` }], { maxTokens: 6000, temperature: 0.4, timeoutMs: 300000 });
        r = recipeToGroup(reply, time, placement, idea, frame);
      }
      if (r.group) insert(r.group);
      else (setPaste(reply), toast('The assistant’s answer could not be read — check it below', 'error'));
    } catch (e) {
      toast(`Assistant error: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mgfx">
      <Section title="1 · Describe">
        <textarea rows={4} placeholder="e.g. Why a man needs a partner in his life — calm, warm, hopeful" value={idea} onChange={(e) => setIdea(e.target.value)} />
        <label className="lbl">Where</label>
        <Seg options={PLACES} value={place} onChange={setPlace} />
        <div className="row wrap">
          <Select label="Length" value={length} options={LENGTHS} onChange={setLength} />
          <Select label="Style" value={style} options={[['free', 'Free (AI invents)'], ...STYLE_PACKS.map((x) => [`pack:${x.id}`, `★ ${x.name}`] as [string, string]), ...packs.map((x) => [`user:${x.id}`, `◆ ${x.name}`] as [string, string]), ...Object.keys(PALETTES).map((k) => [k, k[0].toUpperCase() + k.slice(1)] as [string, string])]} onChange={setStyle} />
          <Select label="Language" value={language} options={[['auto', 'Auto'], ['en', 'English'], ['ar', 'Arabic']]} onChange={setLanguage} />
        </div>
        <div className="row wrap">
          <FilePick className="btn sm" accept=".zip,.plugin,.md" onFiles={async ([f]) => {
            if (!f) return;
            try {
              setAllowed(false);
              setReview(await importPack(f));
            } catch (e) {
              toast(`Could not read the pack: ${(e as Error).message}`, 'error');
            }
          }}><Icon name="upload" /> Import style pack…</FilePick>
          {userPack && <button className="btn sm ghost" onClick={() => { const next = packs.filter((x) => x.id !== userPack.id); setPacks(next); saveUserPacks(next); setStyle('free'); }}><Icon name="trash" /> Remove “{userPack.name}”</button>}
        </div>
        {review && (
          <div className="mgfx-report ok">
            <p><b>{review.name}</b> · from {review.source}</p>
            {review.description && <p className="hint">{review.description.slice(0, 220)}</p>}
            <p>Licence: {review.licence === 'open' ? '✓ open (MIT / ISC / Apache / CC0…)' : review.licence === 'restricted' ? '⚠ restricted — “all rights reserved”' : '? not stated'}</p>
            <p className="hint">Kept: {review.files.filter((f) => f.use === 'kept').length} instruction files ({review.direction.length.toLocaleString()} characters) · ignored, never run: {review.files.filter((f) => f.use === 'code').length} code files, {review.files.filter((f) => f.use === 'asset').length} images / fonts / sounds.</p>
            {review.licence !== 'open' && <Toggle label={review.licence === 'restricted' ? 'I own this pack or have the owner’s permission to use it' : 'I am allowed to use this pack'} value={allowed} onChange={setAllowed} />}
            <div className="row wrap">
              <button className="btn sm primary" disabled={review.licence !== 'open' && !allowed} onClick={() => { const next = [...packs, review]; setPacks(next); saveUserPacks(next); setStyle(`user:${review.id}`); setReview(null); toast(`Style pack “${review.name}” added — it is now the style`, 'ok'); }}>Use this style</button>
              <button className="btn sm ghost" onClick={() => setReview(null)}>Cancel</button>
            </div>
          </div>
        )}
        <Toggle label={narration.length ? `Sync to the voice (${narration.length} words from ${fmtTime(time)})` : 'Sync to the voice (no captions at the playhead)'} value={useVoice} onChange={setUseVoice} />
        <p className="hint">Frame {frame.w}×{frame.h} · inserted at the playhead ({fmtTime(time)}).</p>
      </Section>
      <Section title="2 · Get the recipe">
        <div className="row wrap">
          {(['claude', 'chatgpt', 'gemini'] as Target[]).map((k) => (
            <button key={k} className={`btn sm ${k === 'claude' ? 'primary' : ''}`} onClick={() => (remember(), void handOff(prompt, k))}><Icon name="link" /> {TARGETS[k].label}</button>
          ))}
          <button className="btn sm ghost" onClick={() => (remember(), void navigator.clipboard.writeText(prompt).then(() => toast('Prompt copied', 'ok')))}><Icon name="copy" /> Copy prompt</button>
        </div>
        <button className="btn sm" disabled={!llmOk || busy} title={llmOk ? 'Uses your connected AI assistant' : 'Connect an AI assistant first (header → AI)'} onClick={() => void generate()}>
          <Icon name="wand" /> {busy ? 'Designing…' : 'Generate with my AI assistant'}
        </button>
        <p className="hint">Prompt: {prompt.length.toLocaleString()} characters. Claude / GPT-class models give the best designs.</p>
      </Section>
      <Section title="3 · Paste the answer">
        <textarea rows={6} placeholder='Paste the AI answer here (starts with {)' value={paste} onChange={(e) => setPaste(e.target.value)} />
        {check && (
          <div className={`mgfx-report ${check.group ? 'ok' : 'bad'}`}>
            {check.report.error ? <p>✗ {check.report.error}</p> : <p>✓ {check.group!.items.length} layers · {fmtTime(check.group!.dur)}</p>}
            {check.report.fixes.map((f) => <p key={f} className="hint">Fixed: {f}</p>)}
            {check.warnings.slice(0, 6).map((w) => <p key={w} className="hint">⚠ {w}</p>)}
          </div>
        )}
        <button className="btn primary" disabled={!check?.group} onClick={() => check?.group && (insert(check.group), setPaste(''))}><Icon name="plus" /> Insert at playhead</button>
      </Section>
      {!!p.motion?.length && (
        <Section title={`Motion blocks (${p.motion.length})`}>
          {p.motion.map((g) => (
            <div key={g.id} className="mgfx-row">
              <button className="link" onClick={() => (select({ kind: 'motion', id: g.id }), seek(g.start))}>{g.name}</button>
              <span className="hint">{fmtTime(g.start)} · {fmtTime(g.dur)} · {g.items.length}</span>
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
