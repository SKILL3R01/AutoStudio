/** Story Studio: Script → Style → Storyboard → Make it → Polish. Visual everywhere (cards and thumbnails, no dropdowns). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../store';
import { useProject } from './hooks';
import { FilePick, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { fmtTime } from '../lib/util';
import { KOKORO_VOICES, speakDraft } from '../ai/vision';
import { suggestChapters } from '../lib/chapters';
import { LiveThumb, makeGroup } from './pickers/LiveThumb';
import { StyleCard, TemplateStrip, stylePreview } from './pickers/pickers';
import { SAMPLES, type Sample } from '../samples';
import { HandoffPanel, type HandoffResult } from './HandoffPanel';
import { HelpButton, useFirstTour } from '../components/HelpButton';
import { allKits, getKit, loadMyStyles, paletteFromColors, paletteFromPixels, saveMyStyles, variantOf, type MyStyle } from '../motion/styles';
import { importPack, userPackDirection } from '../motion/packs/importer';
import { buildStory, mergeScene, newStory, pickTemplates, sceneBlockId, splitScene, type Scene } from '../motion/story/model';
import { continueMessage, localStoryMessage, partsOf, redoMessage, resendMessage, scriptMessage, storyMessage } from '../motion/story/prompt';
import { applySceneRecipe, applyStoryAnswer, partNumbers } from '../motion/story/apply';
import { makeDraftVoice } from '../motion/story/voice';
import { buildMotionPrompt } from '../motion/prompt';
import { applyChapterCards, thumbnailPicks } from '../motion/finish';
import { SoundCard } from './SoundCard';
import { drawGroup } from '../motion/render';
import { tip } from '../help/tips';
import type { Project } from '../types';

type Step = 'script' | 'style' | 'board' | 'make' | 'polish';
const STEPS: [Step, string][] = [['script', 'Script'], ['style', 'Style'], ['board', 'Storyboard'], ['make', 'Make it'], ['polish', 'Polish']];
const GENRES: [string, string][] = [['all', 'All'], ['documentary', 'Documentary'], ['explainer', 'Explainer'], ['story', 'Story'], ['cartoon', 'Cartoon'], ['custom', 'Mine']];
const VOICES = KOKORO_VOICES.filter(([id]) => ['af_heart', 'af_bella', 'af_nicole', 'am_michael', 'am_fenrir', 'am_puck', 'bf_emma', 'bm_george'].includes(id));

const narrationWords = (p: Project) => (p.words?.length ? p.words : p.lines.flatMap((l) => l.words));
export const openStory = (scene?: string) => window.dispatchEvent(new CustomEvent('autostudio:dialog', { detail: 'story' })) && scene && setTimeout(() => window.dispatchEvent(new CustomEvent('autostudio:story-scene', { detail: scene })), 50);

export function StoryStudio({ onClose }: { onClose: () => void }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const st = p.story;
  const [step, setStep] = useState<Step>(st ? 'board' : 'script');
  const [mode, setMode] = useState<'paste' | 'voice' | 'idea'>(() => (narrationWords(p).length >= 5 ? 'voice' : 'paste'));
  const [script, setScript] = useState(st?.timing === 'script' ? st.script : '');
  const [idea, setIdea] = useState('');
  const [minutes, setMinutes] = useState(2);
  const [styleId, setStyleId] = useState(st?.styleId ?? 'documentary');
  const [variantId, setVariantId] = useState(st?.variantId ?? '');
  const [genre, setGenre] = useState('all');
  const [kitsVersion, setKitsVersion] = useState(0);
  const [selScene, setSelScene] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [voice, setVoice] = useState('af_heart');
  const [expect, setExpect] = useState<number[] | null>(null);
  const words = narrationWords(p);
  useFirstTour('story');
  useEffect(() => {
    const h = (e: Event) => (setStep('board'), setSelScene((e as CustomEvent<string>).detail));
    window.addEventListener('autostudio:story-scene', h);
    return () => window.removeEventListener('autostudio:story-scene', h);
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement).closest('textarea, input') && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const [samplesOpen, setSamplesOpen] = useState(false);
  /** A sample: its script and style, straight to the style step (then the voice from the storyboard). */
  const pickSample = (sm: Sample) => {
    setScript(sm.script);
    setMode('paste');
    setStyleId(sm.style);
    setVariantId(sm.variant);
    setSamplesOpen(false);
    setStep('style');
    toast(`Sample “${sm.title}” loaded — check the style, then build the storyboard`, 'ok');
  };
  const hasText = mode === 'voice' ? words.length >= 5 : script.trim().split(/\s+/).length >= 8;
  const kits = useMemo(() => allKits(), [kitsVersion]);
  const kit = getKit(styleId);

  /** Build (or rebuild) the story with the chosen script / voice and style. */
  const build = (forceNew = false) => {
    update((d) => {
      const sameText = d.story && (mode === 'voice' ? d.story.timing === 'voice' : d.story.script === script);
      if (!d.story || forceNew || !sameText) d.story = newStory(d, styleId, variantId || getKit(styleId).variants[0].id, mode === 'voice' ? '' : script);
      else if (d.story.styleId !== styleId || d.story.variantId !== variantId) {
        d.story.styleId = styleId;
        d.story.variantId = variantId || getKit(styleId).variants[0].id;
        pickTemplates(d.story.scenes.filter((s) => !s.locked), getKit(styleId), true);
        d.story.scenes.forEach((s) => s.source === 'ai' && ((s.source = 'template'), (s.slots = {})));
      }
      buildStory(d, undefined, true);
    });
    setStep('board');
    tip('story-built');
  };

  /* ---------- custom styles ---------- */
  const addMyStyle = (m: MyStyle) => (saveMyStyles([...loadMyStyles(), m]), setKitsVersion((x) => x + 1), setStyleId(m.id), setVariantId('mine'), toast(`“${m.name}” saved in My styles`, 'ok'));
  const fromPicture = async (f: File) => {
    const bmp = await createImageBitmap(f);
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0, 64, 64);
    addMyStyle({ id: `my_${Date.now().toString(36)}`, name: f.name.replace(/\.[^.]+$/, '').slice(0, 24), base: 'explainer', palette: paletteFromColors(paletteFromPixels(g.getImageData(0, 0, 64, 64).data)), createdAt: Date.now() });
  };
  const fromPack = async (f: File) => {
    try {
      const pk = await importPack(f);
      if (pk.licence === 'restricted' && !confirm(`“${pk.name}” says “all rights reserved”. Use it only if you own it or have the owner's permission. Continue?`)) return;
      const paper = /paper|collage|vox|documentary|cut-?out/i.test(pk.direction + pk.name);
      const base = getKit(paper ? 'documentary' : 'explainer');
      addMyStyle({ id: `my_${Date.now().toString(36)}`, name: pk.name.slice(0, 28), base: paper ? 'documentary' : 'explainer', palette: base.variants[0].palette, direction: userPackDirection(pk), createdAt: Date.now() });
    } catch (e) {
      toast(`Could not read the pack: ${(e as Error).message}`, 'error');
    }
  };
  const saveLook = () => {
    const name = prompt('Name for this look', `${kit.name} (mine)`)?.trim();
    if (!name) return;
    addMyStyle({ id: `my_${Date.now().toString(36)}`, name, base: kit.id === 'documentary' || kit.base === 'documentary' ? 'documentary' : 'explainer', palette: variantOf(kit, variantId).palette, font: kit.font, createdAt: Date.now() });
  };

  /* ---------- AI hand-off ---------- */
  const parts = st ? partsOf(st) : [];
  const applyPart = (i: number, raw: string): HandoffResult => {
    let r: ReturnType<typeof applyStoryAnswer> | undefined;
    update((d) => void (r = applyStoryAnswer(d, raw, expect ?? partNumbers(d, i))));
    const res = r!;
    if (!res.ok) return { ok: false, lines: [`✗ ${res.error}`, ...res.fixes.map((f) => `Fixed: ${f}`)], reply: res.recipe ? undefined : resendMessage(res.error ?? 'invalid') };
    setExpect(null);
    const lines = [`✓ ${res.updated.length} scenes designed by the AI`, ...res.fixes.slice(0, 4).map((f) => `Layout: ${f}`)];
    if (res.missing.length) return { ok: true, lines: [...lines, `⚠ ${res.missing.length} scenes missing (${res.missing.slice(0, 8).join(', ')}${res.missing.length > 8 ? '…' : ''}) — a “continue” message is on the clipboard`], reply: continueMessage(res.missing) };
    return { ok: true, lines };
  };
  const redo = (how: 'stronger' | 'simpler' | 'different') => {
    if (!st) return;
    const nums = (ticked.length ? ticked : selScene ? [selScene] : []).map((id) => st.scenes.findIndex((s) => s.id === id) + 1).filter((n) => n > 0);
    if (!nums.length) return toast('Tick the scenes to redo in the storyboard first (✓ on a card)', 'info');
    setExpect(nums);
    void navigator.clipboard.writeText(redoMessage(st, nums, how)).catch(() => undefined).then(() => toast(`“Redo ${nums.length} scene${nums.length > 1 ? 's' : ''}” copied — paste it into the SAME chat, then paste the answer in step ④`, 'ok'));
  };

  /* ---------- voice ---------- */
  const preview = async (v: string) => {
    try {
      const { wav } = await speakDraft('Hi! This is how your story will sound.', v);
      const a = new Audio(URL.createObjectURL(wav));
      void a.play();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const makeVoice = async () => {
    if (!st) return;
    setBusy('Making the voice (first time downloads the voice model ~90 MB)…');
    try {
      const r = await makeDraftVoice(st.script, voice, setBusy);
      toast(`Voice added (${fmtTime(r.seconds)}) — scenes now follow it`, 'ok');
    } catch (e) {
      toast(`Voice: ${(e as Error).message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const scene = st?.scenes.find((s) => s.id === selScene);
  const doneSteps = { script: hasText || !!st, style: !!st, board: !!st, make: !!st?.scenes.some((s) => s.source === 'ai'), polish: false };

  return (
    <div className="studio" data-tour="studio">
      <header className="studio-head">
        <b>Story Studio</b>
        <nav className="studio-steps">
          {STEPS.map(([k, label], i) => (
            <button key={k} className={`${k === step ? 'on' : ''} ${doneSteps[k] ? 'done' : ''}`} disabled={(k === 'board' || k === 'make' || k === 'polish') && !st} onClick={() => setStep(k)} data-tour={`step-${k}`}>
              <span>{doneSteps[k] && k !== step ? '✓' : i + 1}</span>{label}
            </button>
          ))}
        </nav>
        <div className="grow" />
        <HelpButton topic="story" />
        <button className="icon-btn" title="Back to the editor (Esc)" onClick={onClose}><Icon name="x" /></button>
      </header>

      <div className="studio-body">
        {step === 'script' && (
          <section className="studio-pane">
            <h2>What is your video about?</h2>
            {samplesOpen && (
              <div className="sample-cards" data-tour="samples">
                {SAMPLES.map((sm) => (
                  <div key={sm.id} className="sample-card" dir={sm.lang === 'ar' ? 'rtl' : 'ltr'}>
                    <LiveThumb group={stylePreview(getKit(sm.style), sm.variant)} width={192} height={108} onClick={() => pickSample(sm)} title={`Use the sample “${sm.title}”`} />
                    <b>{sm.title}</b><span className="hint">{getKit(sm.style).name} · {sm.lang === 'ar' ? 'العربية' : 'English'}</span>
                    <button className="btn sm" data-sample={sm.id} onClick={() => pickSample(sm)}>Use this sample</button>
                  </div>
                ))}
              </div>
            )}
            <div className="choice-cards">
              {([['paste', 'text', 'Paste my script', 'Every sentence becomes a scene'], ['voice', 'mic', 'Use my voiceover', words.length ? `${words.length} words · ${fmtTime(words[words.length - 1].end)}` : 'Record or upload one first (Voice panel)'], ['idea', 'wand', 'I have an idea', 'The AI writes the script for you']] as const).map(([k, icon, title, sub]) => (
                <button key={k} className={`choice-card ${mode === k ? 'on' : ''}`} disabled={k === 'voice' && words.length < 5} onClick={() => setMode(k)} data-tour={`script-${k}`}>
                  <Icon name={icon} size={28} /><b>{title}</b><span className="hint">{sub}</span>
                </button>
              ))}
            </div>
            {mode === 'paste' && (
              <>
                <textarea className="script-box" rows={10} placeholder="Paste or write your narration here. One idea per sentence. Numbers like “40%” become animated counters." value={script} onChange={(e) => setScript(e.target.value)} />
                <p className="hint">{script.trim() ? `${script.trim().split(/\s+/).length} words · about ${fmtTime(script.trim().split(/\s+/).length / 2.6)} spoken` : 'Tip: write how you speak — short sentences make clear scenes.'}</p>
              </>
            )}
            {mode === 'voice' && <p className="hint">Scenes will follow your voiceover’s words exactly ({words.length} words).</p>}
            {mode === 'idea' && (
              <div className="idea-pane">
                <textarea rows={3} placeholder="e.g. Why airplane windows are round" value={idea} onChange={(e) => setIdea(e.target.value)} />
                <div className="chips-row">{[1, 2, 5, 8, 10].map((m) => <button key={m} className={`chip ${minutes === m ? 'on' : ''}`} onClick={() => setMinutes(m)}>{m} min</button>)}</div>
                {idea.trim().length > 5 && (
                  <HandoffPanel parts={1} what={() => 'the script'} plainText message={() => scriptMessage(idea, styleId, minutes, 'auto')}
                    apply={(_i, raw) => {
                      const text = raw.replace(/^```[a-z]*|```$/g, '').trim();
                      if (text.split(/\s+/).length < 30) return { ok: false, lines: ['✗ That looks too short for a script — copy the whole answer'] };
                      setScript(text);
                      setMode('paste');
                      return { ok: true, lines: [`✓ Script received (${text.split(/\s+/).length} words) — check it, then pick a style`] };
                    }} />
                )}
              </div>
            )}
            <div className="studio-next">
              <button className="btn sm ghost" data-tour="try-sample" onClick={() => setSamplesOpen(!samplesOpen)}><Icon name="wand" /> Try with a sample</button>
              <button className="btn primary" disabled={!hasText} onClick={() => setStep('style')}>Next: pick a style →</button>
            </div>
          </section>
        )}

        {step === 'style' && (
          <section className="studio-pane">
            <h2>Pick a style</h2>
            <div className="chips-row">{GENRES.map(([g, l]) => <button key={g} className={`chip ${genre === g ? 'on' : ''}`} onClick={() => setGenre(g)}>{l}</button>)}</div>
            <div className="style-grid" data-tour="style-grid">
              {kits.filter((k) => genre === 'all' || k.genre === genre).map((k) => (
                <StyleCard key={k.id} kit={k} variantId={k.id === styleId ? variantId : undefined} on={k.id === styleId} onPick={() => (setStyleId(k.id), setVariantId(k.variants[0].id))} onVariant={(v) => (setStyleId(k.id), setVariantId(v))} />
              ))}
              {(genre === 'all' || genre === 'custom') && (
                <div className="style-card my-style">
                  <div className="my-style-add"><Icon name="plus" size={36} /><b>My style</b></div>
                  <div className="style-card-body">
                    <FilePick className="btn sm" accept=".zip,.plugin,.md" onFiles={([f]) => f && void fromPack(f)}><Icon name="upload" /> From a style pack</FilePick>
                    <FilePick className="btn sm" accept="image/*" onFiles={([f]) => f && void fromPicture(f)}><Icon name="image" /> From a picture</FilePick>
                    <button className="btn sm" onClick={saveLook}><Icon name="copy" /> Save this look</button>
                  </div>
                </div>
              )}
            </div>
            <div className="studio-next">
              <button className="btn ghost" onClick={() => setStep('script')}>← Script</button>
              <button className="btn primary" disabled={kit.status !== 'ready'} onClick={() => build()}>{st ? 'Apply this style →' : 'Next: build the storyboard →'}</button>
            </div>
          </section>
        )}

        {step === 'board' && st && (
          <section className="studio-pane board-pane">
            <div className="row wrap">
              <h2>Storyboard · {st.scenes.length} scenes · {getKit(st.styleId).name}</h2>
              <div className="grow" />
              <button className="btn sm" onClick={() => update((d) => (pickTemplates(d.story!.scenes, getKit(d.story!.styleId), true), void buildStory(d)))}>Re-pick designs (keeps 🔒)</button>
              <button className="btn sm ghost" onClick={() => setTicked(ticked.length ? [] : st.scenes.map((s) => s.id))}>{ticked.length ? 'Untick all' : 'Tick all'}</button>
            </div>
            {st.timing === 'script' && (
              <div className="voice-banner">
                <span>Scenes are timed by reading speed. <b>Make the voice</b> and they will follow it:</span>
                <div className="voice-cards">{VOICES.map(([id, label]) => (
                  <button key={id} className={`voice-card ${voice === id ? 'on' : ''}`} onClick={() => setVoice(id)} title={label}>
                    <span onClick={(e) => (e.stopPropagation(), void preview(id))} className="play" title="Listen">▶</span>{label.split(' · ').slice(1).join(' · ')}
                  </button>
                ))}</div>
                <button className="btn sm primary" disabled={!!busy} onClick={() => void makeVoice()}>{busy || 'Make the voice'}</button>
                <span className="hint">Arabic or your own voice: Voice panel → record / clone, then “Use my voiceover”.</span>
              </div>
            )}
            <div className="board">
              <div className="scene-grid" data-tour="scene-grid">
                {st.scenes.map((s, i) => <SceneCard key={s.id} p={p} s={s} i={i} on={s.id === selScene} ticked={ticked.includes(s.id)} onOpen={() => setSelScene(s.id === selScene ? null : s.id)} onTick={() => setTicked((t) => (t.includes(s.id) ? t.filter((x) => x !== s.id) : [...t, s.id]))} />)}
              </div>
              {scene && <SceneDrawer p={p} s={scene} i={st.scenes.indexOf(scene)} onClose={() => setSelScene(null)} />}
            </div>
            <div className="studio-next">
              <button className="btn ghost" onClick={() => setStep('style')}>← Style</button>
              <button className="btn primary" onClick={() => setStep('make')}>Next: make it →</button>
            </div>
          </section>
        )}

        {step === 'make' && st && (
          <section className="studio-pane">
            <h2>Make it</h2>
            <p>Every scene is already built from its design — you can stop here. <b>Improve with AI</b> lets Claude / ChatGPT pick the best design for each scene and write sharper titles ({parts.length === 1 ? 'one message' : `${parts.length} messages`} for {st.scenes.length} scenes).</p>
            <HandoffPanel parts={parts.length} what={(i) => `scenes ${parts[i].from + 1}–${parts[i].to}`} message={(i) => storyMessage(st, p, i)} localMessage={(i) => localStoryMessage(st, p, i)} apply={applyPart} onDone={() => (toast('All scenes designed — check them in the storyboard or go to Polish', 'ok'), tip('story-ai-done'))} />
            <div className="redo-row">
              <b>Not happy with some scenes?</b> Tick them in the storyboard, then:
              <button className="btn sm" onClick={() => redo('stronger')}>Stronger</button>
              <button className="btn sm" onClick={() => redo('simpler')}>Simpler</button>
              <button className="btn sm" onClick={() => redo('different')}>Different designs</button>
              {expect && <span className="chip">waiting for the redo answer in step ④ ({expect.length} scenes)</span>}
            </div>
            <div className="studio-next">
              <button className="btn ghost" onClick={() => setStep('board')}>← Storyboard</button>
              <button className="btn primary" onClick={() => setStep('polish')}>Next: polish →</button>
            </div>
          </section>
        )}

        {step === 'polish' && st && <Polish p={p} onClose={onClose} />}
      </div>
    </div>
  );
}

function SceneCard({ p, s, i, on, ticked, onOpen, onTick }: { p: Project; s: Scene; i: number; on: boolean; ticked: boolean; onOpen: () => void; onTick: () => void }) {
  const g = p.motion?.find((x) => x.id === sceneBlockId(s));
  const update = useEditor((x) => x.update);
  const portrait = p.export.aspect === '9:16';
  const tpl = getKit(p.story!.styleId).templates.find((t) => t.id === s.templateId);
  return (
    <div className={`scene-card ${on ? 'on' : ''} ${s.locked ? 'locked' : ''}`} data-scene={s.id}>
      {g ? <LiveThumb group={{ ...g, start: 0 }} width={portrait ? 135 : 240} height={portrait ? 240 : 135} onClick={onOpen} title="Open this scene" /> : <div className="scene-empty" onClick={onOpen}>no design</div>}
      <div className="scene-meta">
        <span className="scene-n">{i + 1}</span>
        <span className="hint">{fmtTime(s.start)}</span>
        <span className={`chip src-${s.source}`}>{s.source === 'ai' ? '✦ AI' : s.source === 'custom' ? '✎ custom' : tpl?.name ?? 'design'}</span>
        <button className={`tick ${ticked ? 'on' : ''}`} title="Tick to redo with the AI" onClick={onTick}>✓</button>
        <button className={`lock ${s.locked ? 'on' : ''}`} title={s.locked ? 'Unlock' : 'Lock (the AI never replaces it)'} onClick={() => update((d) => void (d.story!.scenes.find((x) => x.id === s.id)!.locked = !s.locked))}>🔒</button>
      </div>
      <p className="scene-text" title={s.text}>{s.text}</p>
    </div>
  );
}

/** One scene: its design strip (filled with its own words), its content, note, split / merge / lock, Surprise me. */
function SceneDrawer({ p, s, i, onClose }: { p: Project; s: Scene; i: number; onClose: () => void }) {
  const update = useEditor((x) => x.update);
  const seek = useEditor((x) => x.seek);
  const [surprise, setSurprise] = useState(false);
  const setS = (fn: (x: Scene) => void, rebuild = true) => update((d) => {
    const x = d.story!.scenes.find((y) => y.id === s.id)!;
    fn(x);
    if (rebuild) buildStory(d, [s.id], true);
  }, `scene-${s.id}`);
  const kit = getKit(p.story!.styleId);
  const tpl = kit.templates.find((t) => t.id === s.templateId);
  const slots = s.slots;
  const images = p.assets.filter((a) => a.kind === 'image');
  const words = [...new Set(s.text.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}%$-]/gu, '')).filter((w) => w.length > 2))];
  return (
    <aside className="scene-drawer" data-tour="scene-drawer">
      <div className="row between"><b>Scene {i + 1} · {fmtTime(s.start)}–{fmtTime(s.end)}</b><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
      <p className="scene-quote">“{s.text}”</p>
      <h5>Design <span className="hint">— each is filled with this scene’s words</span></h5>
      <TemplateStrip p={p} scene={s} onPick={(id) => setS((x) => ((x.templateId = id), (x.source = x.source === 'custom' ? 'template' : x.source)))} />
      {tpl?.slots.includes('title') && <label className="field"><span>Title</span><input value={slots.title ?? ''} placeholder="from the spoken words" onChange={(e) => setS((x) => void (x.slots = { ...x.slots, title: e.target.value }))} /></label>}
      {(tpl?.slots.includes('key') || tpl?.slots.includes('title')) && (
        <div className="field"><span>Key word (highlighted when spoken)</span>
          <div className="chips-row">{words.slice(0, 14).map((w) => <button key={w} className={`chip ${(slots.key ?? s.keys[0]) === w ? 'on' : ''}`} onClick={() => setS((x) => void (x.slots = { ...x.slots, key: w }))}>{w}</button>)}</div>
        </div>
      )}
      {tpl?.slots.includes('value') && <label className="field"><span>Number</span><input value={slots.value ?? ''} placeholder="e.g. 40%" onChange={(e) => setS((x) => void (x.slots = { ...x.slots, value: e.target.value }))} /></label>}
      {tpl?.slots.includes('label') && <label className="field"><span>Label</span><input value={slots.label ?? ''} onChange={(e) => setS((x) => void (x.slots = { ...x.slots, label: e.target.value }))} /></label>}
      {tpl?.slots.includes('date') && <label className="field"><span>Date / place</span><input value={slots.date ?? ''} onChange={(e) => setS((x) => void (x.slots = { ...x.slots, date: e.target.value }))} /></label>}
      {(tpl?.slots.includes('items') || tpl?.slots.includes('left')) && (
        <label className="field"><span>{tpl?.slots.includes('left') ? 'Left side (one per line)' : 'Points (one per line)'}</span>
          <textarea rows={3} value={(tpl?.slots.includes('left') ? slots.left : slots.items)?.join(String.fromCharCode(10)) ?? ''} onChange={(e) => setS((x) => void (x.slots = { ...x.slots, [tpl?.slots.includes('left') ? 'left' : 'items']: e.target.value.split(String.fromCharCode(10)).filter(Boolean) }))} /></label>
      )}
      {tpl?.slots.includes('right') && <label className="field"><span>Right side (one per line)</span><textarea rows={3} value={slots.right?.join(String.fromCharCode(10)) ?? ''} onChange={(e) => setS((x) => void (x.slots = { ...x.slots, right: e.target.value.split(String.fromCharCode(10)).filter(Boolean) }))} /></label>}
      {tpl?.slots.includes('image') && (
        <div className="field"><span>Picture {images.length ? '' : '(add pictures in Media to use them here)'}</span>
          <div className="pic-grid">{images.slice(0, 24).map((a) => (
            <LiveThumb key={a.id} width={96} height={54} className={slots.image === a.id ? 'on' : ''} title={a.name} onClick={() => setS((x) => void (x.slots = { ...x.slots, image: a.id }))}
              group={makeGroup([{ id: 'a', type: 'asset', asset: a.id, w: 1920, h: 1080, start: 0, dur: 1 }], { w: 1920, h: 1080 }, kit.variants[0].palette, 1)} />
          ))}</div>
        </div>
      )}
      <label className="field"><span>Note for the AI</span><input placeholder="e.g. show a cracked phone" value={s.note ?? ''} onChange={(e) => setS((x) => void (x.note = e.target.value), false)} /></label>
      <div className="row wrap">
        <button className="btn sm" onClick={() => seek(s.start + 0.2)}>▶ Play it</button>
        <button className="btn sm" onClick={() => update((d) => void (splitScene(d.story!, s.id) && buildStory(d)))}>Split</button>
        <button className="btn sm" onClick={() => update((d) => void (mergeScene(d.story!, s.id) && buildStory(d)))}>Merge with next</button>
        <button className="btn sm" onClick={() => setS((x) => void (x.locked = !x.locked), false)}>{s.locked ? 'Unlock' : '🔒 Lock'}</button>
        <button className="btn sm" onClick={() => setSurprise(!surprise)}><Icon name="wand" /> Surprise me</button>
        {s.source !== 'template' && <button className="btn sm ghost" onClick={() => setS((x) => ((x.source = 'template'), (x.slots = {})))}>Back to the design</button>}
      </div>
      {surprise && (
        <HandoffPanel parts={1} what={() => `scene ${i + 1}`}
          message={() => buildMotionPrompt({ idea: `ONE scene of my video. Style: ${kit.name}. ${kit.direction}\nThe scene says: “${s.text}”${s.note ? `\nIdea: ${s.note}` : ''}`, placement: 'full', aspect: p.export.aspect, length: String(Math.round(s.end - s.start)), style: 'free', language: 'auto', narration: s.words.map((w) => ({ t: Math.max(0, w.t - s.start), w: w.w })), assets: p.assets.filter((a) => a.kind === 'image').slice(0, 30).map((a) => a.name) })}
          apply={(_i, raw) => {
            let r: ReturnType<typeof applySceneRecipe> | undefined;
            update((d) => void (r = applySceneRecipe(d, s.id, raw)));
            return r!.ok ? { ok: true, lines: ['✓ Scene replaced by the AI’s own design', ...r!.fixes.slice(0, 3).map((f) => `Fixed: ${f}`)] } : { ok: false, lines: [`✗ ${r!.error}`], reply: resendMessage(r!.error ?? 'invalid') };
          }} />
      )}
    </aside>
  );
}

/** Polish: checks, sound, chapters, thumbnails, then back to the editor. */
function Polish({ p, onClose }: { p: Project; onClose: () => void }) {
  const update = useEditor((x) => x.update);
  const seek = useEditor((x) => x.seek);
  const st = p.story!;
  const kit = getKit(st.styleId), pal = variantOf(kit, st.variantId).palette;
  const checks = useMemo(() => {
    const out: { t: number; text: string }[] = [];
    st.scenes.forEach((s, i) => {
      const g = p.motion?.find((x) => x.id === sceneBlockId(s));
      if (!g) out.push({ t: s.start, text: `Scene ${i + 1} has no design` });
      else if (!g.items.some((it) => it.type === 'background')) out.push({ t: s.start, text: `Scene ${i + 1} has no background` });
      const prev = st.scenes[i - 1];
      if (prev && s.start - prev.end > 0.3) out.push({ t: prev.end, text: `Gap of ${(s.start - prev.end).toFixed(1)} s before scene ${i + 1}` });
      if (s.text.split(/\s+/).length > 26) out.push({ t: s.start, text: `Scene ${i + 1} is long (${s.text.split(/\s+/).length} words) — split it for a clearer video` });
    });
    return out;
  }, [p.motion, st]);
  const hasCards = !!p.motion?.some((g) => g.id.startsWith('dir_ch'));
  return (
    <section className="studio-pane">
      <h2>Polish</h2>
      <div className="polish-grid">
        <div className="polish-card">
          <b>Checks</b>
          {checks.length ? checks.slice(0, 12).map((c) => <button key={c.text} className="link" onClick={() => seek(c.t + 0.1)}>⚠ {c.text}</button>) : <span className="hint">✓ Every scene has a design, no gaps, no overlong scenes.</span>}
        </div>
        <SoundCard kit={kit} />
        <div className="polish-card">
          <b>Chapters</b>
          <button className="btn sm" onClick={() => { const ch = suggestChapters(narrationWords(p), st.scenes[st.scenes.length - 1]?.end ?? 0); update((d) => void (d.chapters = ch)); toast(ch.length ? `${ch.length} chapters on the ruler (More → Copy YouTube chapters)` : 'Too short for chapters', ch.length ? 'ok' : 'info'); }}>Make chapters</button>
          <Toggle label="Chapter title cards" value={hasCards} onChange={(on) => update((d) => void applyChapterCards(d, on, { palette: pal, font: kit.font, paper: kit.id === 'documentary' || kit.base === 'documentary' }))} />
        </div>
      </div>
      <Thumbs p={p} />
      <div className="studio-next">
        <button className="btn primary" onClick={onClose}>Open in the editor →</button>
        <button className="btn ghost" onClick={() => (onClose(), setTimeout(() => window.dispatchEvent(new CustomEvent('autostudio:dialog', { detail: 'export' })), 50))}><Icon name="export" /> Export</button>
      </div>
    </section>
  );
}

/** Two thumbnail options from the strongest scenes, with an optional big title (JPG). */
function Thumbs({ p }: { p: Project }) {
  const st = p.story!;
  const kit = getKit(st.styleId), pal = variantOf(kit, st.variantId).palette;
  const [title, setTitle] = useState(p.name === 'Demo project' ? '' : p.name);
  const picks = useMemo(() => thumbnailPicks(st.scenes.map((s, i) => ({ start: s.start, end: s.end, text: s.text, hints: s.hints, keys: s.keys, layout: s.templateId, group: Math.floor(i / 6) }))), [st]);
  const ref = useRef<HTMLDivElement>(null);
  const vertical = p.export.aspect === '9:16';
  const [W, H] = vertical ? [720, 1280] : [1280, 720];
  useEffect(() => {
    ref.current?.querySelectorAll('canvas').forEach((c, i) => {
      const b = picks[i];
      if (!b) return;
      const t = Math.min(b.end - 0.05, b.start + Math.min(1.8, (b.end - b.start) * 0.7));
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      for (const g of p.motion ?? []) if (!g.hidden && t >= g.start && t < g.start + g.dur && g.placement !== 'overlay') drawGroup(ctx, g, t - g.start, W, H, {});
      if (!title.trim()) return;
      const size = Math.round(W * (vertical ? 0.11 : 0.075));
      ctx.font = `900 ${size}px "${kit.font}", Montserrat`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.lineJoin = 'round';
      const lines = title.toUpperCase().split(' ').reduce<string[]>((acc, w) => {
        const last = acc[acc.length - 1];
        if (last && ctx.measureText(`${last} ${w}`).width < W * 0.86) acc[acc.length - 1] = `${last} ${w}`;
        else acc.push(w);
        return acc;
      }, []).slice(0, 3);
      lines.forEach((l, k) => {
        const y = H - W * 0.05 - (lines.length - 1 - k) * size * 1.05;
        ctx.lineWidth = size * 0.16;
        ctx.strokeStyle = '#000';
        ctx.strokeText(l, W * 0.06, y);
        ctx.fillStyle = k === lines.length - 1 ? pal.accents[1] ?? '#ffd23f' : '#ffffff';
        ctx.fillText(l, W * 0.06, y);
      });
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
      <div className="row wrap"><b>Thumbnails</b><label className="field"><span>Title on the thumbnail</span><input value={title} placeholder="e.g. WHY MORNINGS WIN" onChange={(e) => setTitle(e.target.value)} /></label></div>
      <div className="row wrap" ref={ref}>
        {picks.map((b, i) => (
          <figure key={`${b.start}`}>
            <canvas width={W} height={H} style={{ width: vertical ? 160 : 320, height: vertical ? 284 : 180 }} />
            <figcaption>{'AB'[i]} · {fmtTime(b.start)} <button className="btn sm ghost" onClick={() => save(i)}><Icon name="download" /> JPG</button></figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
