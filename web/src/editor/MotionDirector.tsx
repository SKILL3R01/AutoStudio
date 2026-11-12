/** Motion Director: a full pure-motion video from the voiceover — analyse → storyboard → build section by section → check. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../store';
import { useProject } from './hooks';
import { Seg, Select, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { fmtTime } from '../lib/util';
import { handOff } from '../tools/PromptStudio';
import { chat, useLlm } from '../lib/llm';
import { PALETTES, repairJson } from '../motion/recipe';
import { STYLE_PACKS } from '../motion/packs/paper';
import { loadUserPacks } from '../motion/packs/importer';
import { drawGroup } from '../motion/render';
import { applyChapterCards, applyMotionSound, thumbnailPicks } from '../motion/finish';
import { analyzeVoice } from '../motion/director/analyze';
import { LAYOUTS, PAPER_LAYOUTS, assignLayouts, makeBible } from '../motion/director/templates';
import { applySectionAnswer, directorChecks, fillTemplates, firstMessage, localPrompt, redoMessage, sectionMessage, type DirectorState } from '../motion/director/director';
import type { Project } from '../types';

type Tab = 'setup' | 'board' | 'build' | 'check';
const looksLikeRecipe = (s: string) => /^\s*(```[a-z]*\s*)?\{[\s\S]*"items"/.test(s);

export function MotionDirector({ onClose }: { onClose: () => void }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const seek = useEditor((s) => s.seek);
  const st = p.director;
  const [tab, setTab] = useState<Tab>(st ? 'build' : 'setup');
  const [style, setStyle] = useState(st?.style ?? 'pack:paper-explainer');
  const [secLen, setSecLen] = useState(st?.sectionLen ?? 55);
  const [cur, setCur] = useState(() => Math.max(0, st?.status.findIndex((x) => x === 'empty' || x === 'template') ?? 0));
  const [paste, setPaste] = useState('');
  const [report, setReport] = useState<string[]>([]);
  const [autoCopy, setAutoCopy] = useState(true);
  const [watch, setWatch] = useState(false);
  const [busy, setBusy] = useState<{ i: number; n: number } | null>(null);
  const stop = useRef(false);
  const llmOk = useLlm((s) => !!s.model);
  const userPacks = useMemo(loadUserPacks, []);
  const userPack = userPacks.find((x) => style === `user:${x.id}`);
  const words = useMemo(() => (p.words?.length ? p.words : p.lines.flatMap((l) => l.words)).map((w) => ({ w: w.text, t: w.start, end: w.end })), [p.words, p.lines]);
  const setSt = (fn: (s: DirectorState, d: Project) => void) => update((d) => d.director && fn(d.director, d));

  const analyse = () => {
    if (words.length < 10) return toast('The Director needs captions with word timings — Captions panel → Transcribe the voiceover first', 'info');
    const { beats, sections } = analyzeVoice(words, secLen);
    const bible = makeBible(style);
    assignLayouts(beats, sections, bible);
    update((d) => {
      // Keep sections that were already built by the AI? A new analysis replaces the plan, so remove the old blocks.
      d.motion = (d.motion ?? []).filter((g) => !g.id.startsWith('dir_s'));
      d.director = { style, sectionLen: secLen, bible, beats, sections, status: sections.map(() => 'empty'), createdAt: Date.now() };
      fillTemplates(d, d.director);
    });
    setCur(0);
    setTab('board');
    toast(`${sections.length} sections · ${beats.length} beats — every section is already filled from templates; improve them with the AI`, 'ok');
  };

  const message = (i: number) => (!st ? '' : i === 0 ? firstMessage(st, p, userPack) : sectionMessage(st, i));
  const copy = async (i: number) => {
    await navigator.clipboard.writeText(message(i)).catch(() => {});
    toast(i === 0 ? 'First message copied — paste it into a NEW Claude / ChatGPT chat' : `Section ${i + 1} message copied — paste it into the SAME chat`, 'ok');
  };
  const apply = (i: number, raw: string) => {
    if (!st) return;
    let res: ReturnType<typeof applySectionAnswer> | undefined;
    update((d) => void (res = applySectionAnswer(d, d.director!, i, raw)));
    if (!res) return;
    const r = res;
    if (!r.ok) {
      setReport([`✗ ${r.report.error ?? 'Could not read the answer'}`, ...r.report.fixes.map((f) => `Fixed: ${f}`)]);
      return void navigator.clipboard.writeText(`Your answer for section ${i + 1} was not valid JSON (${r.report.error}). Send the complete recipe for section ${i + 1} again as ONE valid JSON object only.`).then(() => toast('Not readable — a “please resend” message is on the clipboard for the chat', 'error'));
    }
    const cut = r.report.truncated;
    setReport([`✓ Section ${i + 1} built by the AI`, ...r.report.fixes.map((f) => `Fixed: ${f}`), ...r.fixes.map((f) => `Variety: ${f}`), ...r.warnings.slice(0, 5).map((w) => `⚠ ${w}`)]);
    setPaste('');
    if (cut) void navigator.clipboard.writeText(`Your answer for section ${i + 1} was cut off. Continue: send the complete recipe for section ${i + 1} again, shorter (fewer items), as ONE JSON object.`).then(() => toast('The answer was cut off — a “please resend shorter” message is on the clipboard', 'info'));
    else if (i + 1 < st.sections.length) {
      setCur(i + 1);
      if (autoCopy) void navigator.clipboard.writeText(sectionMessage(st, i + 1)).then(() => toast(`Section ${i + 1} applied · section ${i + 2} message copied — paste it into the same chat`, 'ok'));
    } else toast('Last section applied — check the result', 'ok');
  };

  // Clipboard watch (desktop app / allowed browsers): a copied recipe is applied to the current section on return.
  const lastClip = useRef('');
  useEffect(() => {
    if (!watch) return;
    const h = () => void navigator.clipboard.readText().then((t) => {
      if (t && t !== lastClip.current && looksLikeRecipe(t)) (lastClip.current = t), apply(cur, t);
    }).catch(() => {});
    window.addEventListener('focus', h);
    return () => window.removeEventListener('focus', h);
  });

  const runLocal = async () => {
    if (!st) return;
    stop.current = false;
    const todo = st.sections.map((_, i) => i).filter((i) => st.status[i] !== 'locked' && st.status[i] !== 'ai');
    for (let k = 0; k < todo.length && !stop.current; k++) {
      const i = todo[k];
      setBusy({ i, n: todo.length });
      setCur(i);
      try {
        const prompt = localPrompt(useEditor.getState().project!.director!, i, useEditor.getState().project!, userPack);
        let reply = await chat([{ role: 'user', content: prompt }], { maxTokens: 7000, temperature: 0.7, timeoutMs: 600000 });
        if (repairJson(reply).report.error) reply = await chat([{ role: 'user', content: prompt }, { role: 'assistant', content: reply }, { role: 'user', content: 'Answer again with ONE valid JSON recipe only.' }], { maxTokens: 7000, temperature: 0.4, timeoutMs: 600000 });
        apply(i, reply);
      } catch (e) {
        toast(`Section ${i + 1}: ${(e as Error).message} — kept the template`, 'error');
      }
    }
    setBusy(null);
  };

  const layouts: readonly string[] = st?.bible.layouts.length ? st.bible.layouts : style === 'pack:paper-explainer' ? PAPER_LAYOUTS : LAYOUTS;
  const styles: [string, string][] = [...STYLE_PACKS.map((x) => [`pack:${x.id}`, `★ ${x.name}`] as [string, string]), ...userPacks.map((x) => [`user:${x.id}`, `◆ ${x.name}`] as [string, string]), ...Object.keys(PALETTES).map((k) => [k, k[0].toUpperCase() + k.slice(1)] as [string, string])];
  const checks = useMemo(() => (st && tab === 'check' ? directorChecks(p, st) : []), [p, st, tab]);
  const total = st?.sections[st.sections.length - 1]?.end ?? 0;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide director" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Motion Director {st ? `· ${fmtTime(total)} · ${st.sections.length} sections · ${st.beats.length} beats` : ''}</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        <div className="panel-tabs">
          {(['setup', 'board', 'build', 'check'] as Tab[]).map((t) => (
            <button key={t} className={t === tab ? 'on' : ''} disabled={t !== 'setup' && !st} onClick={() => setTab(t)}>{{ setup: '1 · Voice & style', board: '2 · Storyboard', build: '3 · Build', check: '4 · Check' }[t]}</button>
          ))}
        </div>

        {tab === 'setup' && (
          <div className="dir-body">
            <p>A whole video of motion graphics, timed to your voiceover. The voice is split into sections (about a minute each) and beats (one idea every 2.5–4 s). Every section is filled from templates straight away, so the video is never empty; then the AI designs each section in one chat.</p>
            <p className="hint">{words.length ? `Narration: ${words.length} words with timings, ${fmtTime(words[words.length - 1].end)}.` : 'No captions yet — transcribe the voiceover first (Captions panel).'}</p>
            <div className="row wrap">
              <Select label="Style (locked for the whole video)" value={style} options={styles} onChange={setStyle} />
              <div><label className="lbl">Section length</label><Seg options={[[45, '45 s'], [55, '~1 min'], [90, '90 s']] as const} value={secLen as 45 | 55 | 90} onChange={(v) => setSecLen(v)} /></div>
            </div>
            <p className="hint">Longer sections = fewer copy-pastes, but each AI answer gets longer (Claude / GPT handle ~1 min well).</p>
            <button className="btn primary" disabled={words.length < 10} onClick={analyse}><Icon name="wand" /> {st ? 'Analyse again (replaces the plan)' : 'Analyse the voice'}</button>
          </div>
        )}

        {tab === 'board' && st && (
          <div className="dir-body">
            <div className="row wrap">
              <button className="btn sm" onClick={() => setSt((s) => assignLayouts(s.beats, s.sections, s.bible))}>Re-pick layouts (keeps locked)</button>
              <button className="btn sm" onClick={() => (setSt((s, d) => fillTemplates(d, s)), toast('Template sections rebuilt from the storyboard', 'ok'))}>Rebuild template sections</button>
              <span className="hint">Change a beat’s layout or add a note for the AI (“show a cracked phone”). Locked beats keep their layout.</span>
            </div>
            <div className="dir-board">
              {st.sections.map((s) => (
                <div key={s.i}>
                  <div className="dir-sec">Section {s.i + 1} · {fmtTime(s.start)}–{fmtTime(s.end)} · {s.mood}{s.title ? ` · “${s.title}”` : ''}</div>
                  {st.beats.filter((b) => b.section === s.i).map((b) => (
                    <div key={b.id} className="dir-beat">
                      <button className="link" onClick={() => seek(b.start + 0.3)}>{fmtTime(b.start)}</button>
                      <span className="dir-text" title={b.text}>{b.text}</span>
                      <select value={b.layout} onChange={(e) => setSt((x) => { const bb = x.beats.find((y) => y.id === b.id)!; bb.layout = e.target.value; bb.locked = true; })}>
                        {[...new Set([b.layout, ...layouts])].map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <input placeholder="note for the AI" value={b.note ?? ''} onChange={(e) => setSt((x) => void (x.beats.find((y) => y.id === b.id)!.note = e.target.value))} />
                      <label className="dir-lock" title="Keep this layout"><input type="checkbox" checked={!!b.locked} onChange={(e) => setSt((x) => void (x.beats.find((y) => y.id === b.id)!.locked = e.target.checked))} />🔒</label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'build' && st && (
          <div className="dir-body">
            <div className="dir-steps">
              <b>Claude / ChatGPT (one chat for the whole video):</b> ① copy the first message into a <i>new</i> chat → ② copy the answer → ③ paste it below (or turn on clipboard watch) → the next section’s message is copied for you → paste it into the <i>same</i> chat → repeat.
            </div>
            <div className="row wrap">
              <button className="btn sm primary" onClick={() => void handOff(firstMessage(st, p, userPack), 'claude')}><Icon name="link" /> Claude (first message)</button>
              <button className="btn sm" onClick={() => void handOff(firstMessage(st, p, userPack), 'chatgpt')}><Icon name="link" /> ChatGPT</button>
              <button className="btn sm" onClick={() => void handOff(firstMessage(st, p, userPack), 'gemini')}><Icon name="link" /> Gemini</button>
              <button className="btn sm" disabled={!llmOk || !!busy} title={llmOk ? 'Every section, one after another, with your connected assistant' : 'Connect an AI assistant first'} onClick={() => void runLocal()}><Icon name="wand" /> {busy ? `Designing section ${busy.i + 1}…` : 'All sections with my AI assistant'}</button>
              {busy && <button className="btn sm ghost" onClick={() => (stop.current = true)}>Stop after this section</button>}
            </div>
            <div className="dir-queue">
              {st.sections.map((s, i) => (
                <div key={i} className={`dir-q ${i === cur ? 'on' : ''}`} onClick={() => setCur(i)}>
                  <b>{i + 1}</b>
                  <span>{fmtTime(s.start)}–{fmtTime(s.end)} · {st.beats.filter((b) => b.section === i).length} beats{s.title ? ` · ${s.title}` : ''}</span>
                  <span className={`chip st-${st.status[i]}`}>{{ empty: 'empty', template: 'template', ai: '✦ AI', locked: '🔒 locked' }[st.status[i]]}</span>
                  <button className="btn sm ghost" onClick={(e) => (e.stopPropagation(), void copy(i))}><Icon name="copy" /> {i === 0 ? 'First message' : 'Message'}</button>
                  <button className="btn sm ghost" title="Back to the template version" onClick={(e) => (e.stopPropagation(), setSt((x, d) => { x.status[i] = 'empty'; fillTemplates(d, x, [i]); }))}>Template</button>
                  <button className="btn sm ghost" title={st.status[i] === 'locked' ? 'Unlock' : 'Lock (never replaced)'} onClick={(e) => (e.stopPropagation(), setSt((x) => void (x.status[i] = x.status[i] === 'locked' ? 'ai' : 'locked')))}>🔒</button>
                  <button className="btn sm ghost" onClick={(e) => (e.stopPropagation(), seek(s.start + 0.2))}>▶</button>
                </div>
              ))}
            </div>
            <textarea rows={5} placeholder={`Paste the AI answer for section ${cur + 1} here (starts with {)`} value={paste} onChange={(e) => setPaste(e.target.value)} />
            <div className="row wrap">
              <button className="btn primary" disabled={!paste.trim()} onClick={() => apply(cur, paste)}>Apply to section {cur + 1}</button>
              <select value="" onChange={(e) => e.target.value && st && void navigator.clipboard.writeText(redoMessage(st, cur, e.target.value)).then(() => toast(`“Redo section ${cur + 1}” message copied — paste it into the same chat`, 'ok'))}>
                <option value="">Ask the chat to redo section {cur + 1}…</option>
                <option value="stronger">… stronger</option>
                <option value="simpler">… simpler</option>
                <option value="different">… with different layouts</option>
              </select>
              <Toggle label="Copy the next section’s message after applying" value={autoCopy} onChange={setAutoCopy} />
              <Toggle label="Clipboard watch (apply a copied answer when I come back)" value={watch} onChange={setWatch} />
            </div>
            {report.length > 0 && <div className="mgfx-report ok">{report.map((r) => <p key={r}>{r}</p>)}</div>}
          </div>
        )}

        {tab === 'check' && st && (
          <div className="dir-body">
            <div className="row wrap">
              <button className="btn sm" onClick={() => (update((d) => void (d.chapters = st.sections.map((s, i) => ({ id: `ch_dir${i}`, t: i === 0 ? 0 : s.start, title: s.title ? s.title[0].toUpperCase() + s.title.slice(1) : `Part ${i + 1}` })))), toast('Sections are now chapters on the ruler (More → Copy YouTube chapters)', 'ok'))}>Use sections as chapters</button>
              <span className="hint">{checks.length ? `${checks.length} things to look at` : '✓ No problems found: every second is covered, texts are short, nothing outside the frame.'}</span>
            </div>
            <div className="row wrap">
              <button className="btn sm" onClick={() => { let n = 0; update((d) => void (n = applyMotionSound(d))); toast(n ? `${n} sound effects placed on the SFX track (whooshes on transitions, hits on headlines, clicks, pops…) — run again after changes` : 'No motion layers with sounds yet', n ? 'ok' : 'info'); }}><Icon name="sfx" /> Add sound effects from the motion</button>
              <button className="btn sm ghost" onClick={() => (update((d) => void (d.audio = d.audio.filter((c) => !c.id.startsWith('msfx_')))), toast('Motion sound effects removed', 'ok'))}>Remove them</button>
              <Toggle label="Chapter title cards between sections" value={!!p.motion?.some((g) => g.id.startsWith('dir_ch'))} onChange={(on) => update((d) => void applyChapterCards(d, d.director!, on))} />
            </div>
            {checks.length > 0 && <div className="mgfx-report bad">{checks.slice(0, 30).map((c) => <p key={c}>⚠ {c}</p>)}</div>}
            <Thumbnails st={st} p={p} />
            <ContactSheet st={st} p={p} onPick={(t) => seek(t)} />
          </div>
        )}
      </div>
    </div>
  );
}

/** One small frame per beat (motion layers only), click to jump there. */
function ContactSheet({ st, p, onPick }: { st: DirectorState; p: Project; onPick: (t: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const words = p.words?.length ? p.words : p.lines.flatMap((l) => l.words);
    ref.current?.querySelectorAll('canvas').forEach((c) => {
      const t = +c.dataset.t!;
      const g = p.motion?.find((x) => !x.hidden && x.id.startsWith('dir_s') && t >= x.start && t < x.start + x.dur);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, c.width, c.height);
      if (g) drawGroup(ctx, g, t - g.start, c.width, c.height, { words });
    });
  });
  const [w, h] = p.export.aspect === '9:16' ? [108, 192] : p.export.aspect === '1:1' ? [150, 150] : [240, 135];
  return (
    <div className="dir-sheet" ref={ref}>
      {st.beats.slice(0, 400).map((b) => (
        <figure key={b.id} onClick={() => onPick((b.start + b.end) / 2)} title={b.text}>
          <canvas width={w} height={h} data-t={Math.min(b.end - 0.05, b.start + Math.min(1.6, (b.end - b.start) * 0.6))} />
          <figcaption>{fmtTime(b.start)} · {b.layout}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Two thumbnail options from the strongest beats (the motion frame, plus an optional big title), downloaded as JPG. */
function Thumbnails({ st, p }: { st: DirectorState; p: Project }) {
  const [title, setTitle] = useState(p.name === 'Demo project' ? '' : p.name);
  const picks = useMemo(() => thumbnailPicks(st), [st]);
  const ref = useRef<HTMLDivElement>(null);
  const vertical = p.export.aspect === '9:16';
  const [W, H] = vertical ? [720, 1280] : [1280, 720];
  useEffect(() => {
    const words = p.words?.length ? p.words : p.lines.flatMap((l) => l.words);
    ref.current?.querySelectorAll('canvas').forEach((c, i) => {
      const b = picks[i];
      if (!b) return;
      const t = Math.min(b.end - 0.05, b.start + Math.min(1.8, (b.end - b.start) * 0.7));
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      for (const g of p.motion ?? []) if (!g.hidden && t >= g.start && t < g.start + g.dur && g.placement !== 'overlay') drawGroup(ctx, g, t - g.start, W, H, { words });
      if (title.trim()) {
        const size = Math.round(W * (vertical ? 0.11 : 0.075));
        ctx.font = `900 ${size}px "${st.bible.font}", Montserrat`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.lineJoin = 'round';
        const lines = title.toUpperCase().split(/\s+/).reduce<string[]>((acc, w) => {
          const last = acc[acc.length - 1];
          if (last && ctx.measureText(last + ' ' + w).width < W * 0.86) acc[acc.length - 1] = last + ' ' + w;
          else acc.push(w);
          return acc;
        }, []).slice(0, 3);
        lines.forEach((l, k) => {
          const y = H - W * 0.05 - (lines.length - 1 - k) * size * 1.05;
          ctx.lineWidth = size * 0.16;
          ctx.strokeStyle = '#000';
          ctx.strokeText(l, W * 0.06, y);
          ctx.fillStyle = k === lines.length - 1 ? st.bible.palette.accents[1] ?? '#ffd23f' : '#ffffff';
          ctx.fillText(l, W * 0.06, y);
        });
      }
    });
  });
  const save = (i: number) => ref.current?.querySelectorAll('canvas')[i]?.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `${(p.name || 'video').replace(/[^\w\- ]+/g, '')} thumbnail ${'AB'[i]}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/jpeg', 0.92);
  return (
    <div className="dir-thumbs">
      <div className="row wrap">
        <b>Thumbnails</b>
        <label className="field"><span>Title on the thumbnail</span><input value={title} placeholder="e.g. WHY MORNINGS WIN" onChange={(e) => setTitle(e.target.value)} /></label>
      </div>
      <div className="row wrap" ref={ref}>
        {picks.map((b, i) => (
          <figure key={b.id}>
            <canvas width={W} height={H} style={{ width: vertical ? 160 : 320, height: vertical ? 284 : 180 }} />
            <figcaption>{'AB'[i]} · {fmtTime(b.start)} · {b.layout} <button className="btn sm ghost" onClick={() => save(i)}><Icon name="download" /> JPG</button></figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
