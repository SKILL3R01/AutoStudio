import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store';
import { useProject } from '../editor/hooks';
import { FilePick, Section, Seg, Select, Slider, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { engineHas, useEngine } from '../lib/engine';
import { importAudio } from '../lib/project';
import { KOKORO_VOICES, transcribeLocal } from '../ai/vision';
import { uid } from '../lib/util';
import { useRecorder, toMonoWav } from './recorder';
import { FX_PRESETS, defaultFx, makeupFor, type VoiceFx } from '../audio/enhance';
import { paceAndPitch } from '../audio/pitch';
import { encodeWav } from '../audio/silence';
import { media } from '../render/media';
import { checkSample, deleteVoice, detectLanguage, joinParagraphs, listVoices, paragraphsOf, saveVoice, speakParagraph, voiceBlob, type Backend, type GenSettings, type VoiceSample } from './library';

const LANGS: [string, string][] = [['auto', 'Auto (from the script)'], ['en', 'English'], ['ar', 'Arabic'], ['fr', 'French'], ['es', 'Spanish'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['tr', 'Turkish'], ['hi', 'Hindi'], ['ru', 'Russian'], ['ja', 'Japanese'], ['zh', 'Chinese']];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Meter({ level }: { level: number }) {
  const pct = Math.min(1, level * 1.4) * 100;
  return <div className="bar meter-live"><i style={{ width: `${pct}%`, background: level > 0.95 ? 'var(--danger, #f05252)' : level > 0.6 ? '#fbbf24' : 'var(--accent)' }} /></div>;
}

/** One-click local engine install / status. */
function LocalEngine({ onReady }: { onReady: (ok: boolean) => void }) {
  const api = window.autostudio?.voice;
  const [st, setSt] = useState<VoiceEngineStatus | null>(null);
  const [prog, setProg] = useState<{ stage: string; pct: number; line?: string } | null>(null);
  const [err, setErr] = useState('');
  const refresh = () => void api?.status().then((s) => (setSt(s), onReady(s.installed)));
  useEffect(() => {
    refresh();
    return api?.onProgress((p) => !p.id && setProg(p));
  }, []);
  if (!api) return <p className="hint">The local voice engine runs in the <b>desktop app</b>. In the browser, connect the Colab engine (Settings) for AI voices — or record your own voice below.</p>;
  if (!st) return null;
  if (st.installed) {
    return (
      <div className="row wrap between">
        <span className="chip ok"><Icon name="check" size={13} /> Local voice engine ready · {st.sizeGB} GB</span>
        <button className="btn sm ghost" onClick={async () => confirm('Remove the local voice engine and its model from this PC?') && (await api.uninstall(), refresh())}>Uninstall</button>
      </div>
    );
  }
  const install = async () => {
    setErr('');
    try {
      await api.install();
      toast('Local voice engine installed', 'ok');
    } catch (e) {
      setErr((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setProg(null);
      refresh();
    }
  };
  return (
    <div className="card notice">
      <b>Natural AI voices on this PC (voice cloning, 23 languages)</b>
      <p className="hint">One-time download of about 5 GB (Python, PyTorch, the Chatterbox model). Runs offline afterwards. On a PC without an NVIDIA GPU a minute of speech takes ~6–7 minutes — it runs in the background while you edit. Free space: {st.freeGB} GB (needs {st.needGB}).</p>
      {prog ? (
        <>
          <div className="row between"><span>{prog.stage}</span><span className="hint">{Math.round(prog.pct * 100)}%</span></div>
          <div className="bar"><i style={{ width: `${prog.pct * 100}%` }} /></div>
          {prog.line && <code className="hint mono">{prog.line}</code>}
          <button className="btn sm ghost" onClick={() => void api.cancelInstall()}>Cancel</button>
        </>
      ) : (
        <button className="btn primary sm" disabled={st.freeGB < st.needGB} onClick={install}><Icon name="download" /> {err ? 'Retry install (resumes)' : 'Install local voice (~5 GB)'}</button>
      )}
      {err && (
        <>
          <p className="warn">{err}</p>
          <button className="btn sm ghost" onClick={async () => void navigator.clipboard.writeText((await api.logs()).join(String.fromCharCode(10))).then(() => toast('Install log copied — paste it to your assistant', 'ok'))}><Icon name="copy" /> Copy install log</button>
        </>
      )}
    </div>
  );
}

/** Record or upload a cloning reference; saved to "My voices" (every project). */
function VoiceLibrary({ voices, reload, selected, onSelect }: { voices: VoiceSample[]; reload: () => void; selected?: string; onSelect: (id?: string) => void }) {
  const rec = useRecorder();
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState('My voice');
  const [pending, setPending] = useState<{ wav: Blob; buffer: AudioBuffer; issues: string[] } | null>(null);
  const audio = useRef<HTMLAudioElement>(null);

  const take = async (b: Blob) => {
    try {
      const { wav, buffer } = await toMonoWav(b, 30);
      setPending({ wav, buffer, issues: checkSample(buffer).issues });
    } catch (e) {
      toast(`Could not read the audio: ${(e as Error).message}`, 'error');
    }
  };
  useEffect(() => void (rec.blob && take(rec.blob)), [rec.blob]);
  const save = async () => {
    if (!pending || !consent) return;
    const v: VoiceSample = { id: uid(), name: name.trim() || 'My voice', language: 'auto', duration: pending.buffer.duration, createdAt: Date.now(), consent: true };
    await saveVoice(v, pending.wav);
    setPending(null);
    rec.reset();
    reload();
    onSelect(v.id);
    toast(`Saved “${v.name}” — available in every project`, 'ok');
  };
  const play = async (id: string) => {
    const b = await voiceBlob(id);
    if (b && audio.current) (audio.current.src = URL.createObjectURL(b)), void audio.current.play();
  };

  return (
    <>
      <div className="voice-list">
        <button className={`voice-item ${!selected ? 'on' : ''}`} onClick={() => onSelect(undefined)}><Icon name="mic" size={14} /> Default voice <span className="hint">(no cloning)</span></button>
        {voices.map((v) => (
          <div key={v.id} className={`voice-item ${selected === v.id ? 'on' : ''}`} onClick={() => onSelect(v.id)}>
            <Icon name="mic" size={14} /> {v.name} <span className="hint">{v.duration.toFixed(0)} s</span>
            <span className="grow" />
            <button className="icon-btn" title="Listen" onClick={(e) => (e.stopPropagation(), void play(v.id))}><Icon name="play" size={13} /></button>
            <button className="icon-btn" title="Delete" onClick={async (e) => (e.stopPropagation(), confirm(`Delete “${v.name}”?`) && (await deleteVoice(v.id), selected === v.id && onSelect(undefined), reload()))}><Icon name="trash" size={13} /></button>
          </div>
        ))}
      </div>
      <audio ref={audio} hidden />
      <div className="card">
        <b>Add a voice to clone</b>
        <p className="hint">Read 10–20 seconds naturally, in a quiet room (your normal narration style). Clone only your own voice or one you have permission to use.</p>
        {rec.state === 'countdown' && <p className="big-count">{rec.count}</p>}
        {rec.state === 'recording' && (
          <>
            <div className="row between"><span className="rec-dot">● Recording {fmt(rec.elapsed)}</span><button className="btn sm" onClick={rec.stop}>Stop</button></div>
            <Meter level={rec.level} />
          </>
        )}
        {(rec.state === 'idle' || rec.state === 'done' || rec.state === 'error') && !pending && (
          <div className="row wrap">
            <button className="btn sm" onClick={() => void rec.start(3)}><Icon name="mic" /> Record sample</button>
            <FilePick accept="audio/*" className="btn sm ghost" onFiles={([f]) => f && take(f)}><Icon name="upload" /> Upload sample</FilePick>
          </div>
        )}
        {rec.error && <p className="warn">{rec.error}</p>}
        {pending && (
          <>
            <audio controls src={URL.createObjectURL(pending.wav)} />
            <p className="hint">{pending.buffer.duration.toFixed(1)} s{pending.issues.length ? '' : ' · sounds good'}</p>
            {pending.issues.map((i) => <p key={i} className="warn">{i}</p>)}
            <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <Toggle label="This is my voice, or I have permission to clone it" value={consent} onChange={setConsent} />
            <div className="row">
              <button className="btn sm primary" disabled={!consent} onClick={save}><Icon name="check" /> Save voice</button>
              <button className="btn sm ghost" onClick={() => (setPending(null), rec.reset())}>Discard</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function VoicePanel() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const engine = useEngine((s) => s.status);
  const colab = engine === 'ready' && engineHas('tts');
  const [localReady, setLocalReady] = useState(false);
  const [voices, setVoices] = useState<VoiceSample[]>([]);
  const reload = () => void listVoices().then(setVoices);
  useEffect(reload, []);
  const [script, setScript] = useState(p.voiceScript ?? '');
  const [lang, setLang] = useState('auto');
  const [voiceId, setVoiceId] = useState<string | undefined>(() => localStorage.getItem('voiceStudio.voice') ?? undefined);
  const [ex, setEx] = useState(0.5);
  const [cfg, setCfg] = useState(0.5);
  const [backend, setBackend] = useState<Backend>('local');
  const [draftVoice, setDraftVoice] = useState(() => localStorage.getItem('voiceStudio.draft') ?? 'af_heart');
  useEffect(() => localStorage.setItem('voiceStudio.draft', draftVoice), [draftVoice]);
  const [captions, setCaptions] = useState(true);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState({ n: 0, total: 0, chunk: 0 });
  const cancelled = useRef(false);
  const preview = useRef<HTMLAudioElement>(null);
  const rec = useRecorder();
  useEffect(() => void (voiceId ? localStorage.setItem('voiceStudio.voice', voiceId) : localStorage.removeItem('voiceStudio.voice')), [voiceId]);
  useEffect(() => window.autostudio?.voice?.onProgress((pr) => pr.id && setDone((d) => ({ ...d, chunk: pr.pct }))), []);
  useEffect(() => {
    if (!window.autostudio?.voice && colab) setBackend('colab');
  }, [colab]);
  const paras = paragraphsOf(script);
  const settings = (): GenSettings => ({ voiceId: backend === 'draft' ? undefined : voiceId, language: lang === 'auto' ? detectLanguage(script) : lang, exaggeration: ex, cfg, seed: 0, draftVoice });
  const canGenerate = (backend === 'local' ? localReady : backend === 'colab' ? colab : true) && paras.length > 0 && !busy;

  const saveScript = () => p.voiceScript !== script && update((d) => void (d.voiceScript = script));
  const previewFirst = async () => {
    saveScript();
    setBusy('Preview: generating the first paragraph…');
    try {
      const b = await speakParagraph(paras[0], settings(), backend);
      if (preview.current) (preview.current.src = URL.createObjectURL(b)), void preview.current.play();
    } catch (e) {
      toast((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error');
    } finally {
      setBusy('');
    }
  };
  const generateAll = async () => {
    saveScript();
    cancelled.current = false;
    const t0 = Date.now();
    const parts: Blob[] = [];
    try {
      for (const [i, text] of paras.entries()) {
        if (cancelled.current) throw new Error('Cancelled');
        setDone({ n: i, total: paras.length, chunk: 0 });
        const elapsed = (Date.now() - t0) / 1000;
        const eta = i ? Math.round((elapsed / i) * (paras.length - i)) : 0;
        setBusy(`Generating paragraph ${i + 1} of ${paras.length}${eta ? ` · about ${fmt(eta)} left` : ''}…`);
        parts.push(await speakParagraph(text, settings(), backend));
      }
      setBusy('Joining paragraphs…');
      const wav = await joinParagraphs(parts);
      const file = new File([wav], `voiceover_${voiceId ? 'cloned' : 'ai'}.wav`, { type: 'audio/wav' });
      const next = await importAudio(useEditor.getState().project!, [file], { asVoiceover: true });
      update((d) => Object.assign(d, { assets: next.assets, voiceover: next.voiceover }));
      toast(`Voiceover ready (${paras.length} paragraphs, ${fmt((Date.now() - t0) / 1000)})`, 'ok');
      if (captions) {
        setBusy('Creating captions on this PC…');
        const { words } = await transcribeLocal(wav, 'base', settings().language);
        update((d) => void ((d.words = words), (d.lines = []), (d.captions.enabled = true), (d.captions.wordLevel = true)));
      }
    } catch (e) {
      const msg = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      if (msg !== 'Cancelled' && !/stopped/.test(msg)) toast(msg, 'error');
    } finally {
      setBusy('');
      setDone({ n: 0, total: 0, chunk: 0 });
    }
  };
  const cancel = () => {
    cancelled.current = true;
    if (backend === 'local') void window.autostudio?.voice?.cancel();
  };
  useEffect(() => {
    if (!rec.blob) return;
    void (async () => {
      const file = new File([rec.blob!], 'voiceover_recorded.webm', { type: rec.blob!.type });
      const next = await importAudio(useEditor.getState().project!, [file], { asVoiceover: true });
      update((d) => Object.assign(d, { assets: next.assets, voiceover: next.voiceover }));
      rec.reset();
      toast('Recording set as the voiceover — use Audio → Remove silences to tighten it', 'ok');
    })();
  }, [rec.blob]);

  return (
    <>
      <Section title="AI voice engine (beta)">
        <LocalEngine onReady={setLocalReady} />
        <Seg options={[['local', 'Cloned voice (this PC)'], ['draft', 'Instant draft (English)'], ...(colab ? [['colab', 'Colab (turbo)'] as [Backend, string]] : [])] as [Backend, string][]} value={backend} onChange={setBackend} />
        {backend === 'draft' && (
          <>
            <Select label="Draft voice" value={draftVoice} options={KOKORO_VOICES} onChange={setDraftVoice} />
            <p className="hint">Natural preset voices (Kokoro, ~90 MB once) — English only, no cloning, about real-time on most PCs. Great for testing pacing before the final cloned voice.</p>
          </>
        )}
      </Section>
      <Section title="My voices" hint="Saved once, available in every project.">
        <VoiceLibrary voices={voices} reload={reload} selected={voiceId} onSelect={setVoiceId} />
      </Section>
      <Section title="Script → voiceover">
        <textarea rows={8} value={script} placeholder={'Paste or write your narration.\n\nLeave a blank line between paragraphs — each paragraph is generated separately, so editing one only redoes that one.'} onChange={(e) => setScript(e.target.value)} onBlur={saveScript} />
        <p className="hint">{paras.length} paragraph{paras.length === 1 ? '' : 's'} · {script.trim().split(/\s+/).filter(Boolean).length} words · ≈ {fmt((script.trim().split(/\s+/).filter(Boolean).length / 150) * 60)} of speech</p>
        <Select label="Language" value={lang} options={LANGS} onChange={setLang} />
        <Slider label="Expressiveness" value={ex} min={0.25} max={1} step={0.05} onChange={setEx} fmt={(v) => (v < 0.4 ? 'calm' : v > 0.7 ? 'dramatic' : 'natural')} />
        <Slider label="Pace / guidance" value={cfg} min={0.2} max={0.8} step={0.05} onChange={setCfg} fmt={(v) => (v < 0.4 ? 'slower, steadier' : v > 0.6 ? 'faster' : 'balanced')} />
        <Toggle label="Create captions when done (on this PC)" value={captions} onChange={setCaptions} />
        {busy ? (
          <>
            <p className="hint">{busy}</p>
            {done.total > 0 && <div className="bar"><i style={{ width: `${((done.n + done.chunk) / done.total) * 100}%` }} /></div>}
            <button className="btn sm ghost" onClick={cancel}>Cancel</button>
          </>
        ) : (
          <div className="row wrap">
            <button className="btn sm" disabled={!canGenerate} onClick={previewFirst}><Icon name="play" /> Preview first paragraph</button>
            <button className="btn sm primary" disabled={!canGenerate} onClick={generateAll}><Icon name="wand" /> Generate voiceover</button>
          </div>
        )}
        {!localReady && backend === 'local' && <p className="hint">Install the local voice engine above, or record your own voice below.</p>}
        <audio ref={preview} controls hidden={!preview.current?.src} />
      </Section>
      <Section title="Enhance & effects" hint="Applied in preview and export; the original stays untouched.">
        <VoiceEnhance />
      </Section>
      <Section title="Record yourself">
        <p className="hint">Use your own voice as the narration. Noise suppression is on; keep peaks out of the red.</p>
        {rec.state === 'countdown' && <p className="big-count">{rec.count}</p>}
        {rec.state === 'recording' ? (
          <>
            <div className="row between"><span className="rec-dot">● {fmt(rec.elapsed)}</span><button className="btn sm" onClick={rec.stop}>Stop & use</button></div>
            <Meter level={rec.level} />
          </>
        ) : (
          <button className="btn sm" disabled={rec.state === 'countdown'} onClick={() => void rec.start(3)}><Icon name="mic" /> Record voiceover</button>
        )}
        {rec.error && <p className="warn">{rec.error}</p>}
        {p.voiceover && <p className="hint">Current voiceover: {p.assets.find((a) => a.id === p.voiceover!.assetId)?.name}</p>}
      </Section>
    </>
  );
}

/** Enhance & effects for the current voiceover (non-destructive, applied in preview and export). */
export function VoiceEnhance() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const vo = p.voiceover;
  const [busy, setBusy] = useState('');
  const [pace, setPace] = useState(1);
  const [pitch, setPitch] = useState(0);
  if (!vo) return <p className="hint">Add or generate a voiceover first.</p>;
  const fx: VoiceFx = vo.fx ?? { ...defaultFx('off'), targetLufs: null };
  /** Apply settings and re-measure loudness so the result lands on the target (−14 LUFS for YouTube). */
  const apply = async (next: VoiceFx) => {
    update((d) => void (d.voiceover && (d.voiceover.fx = next)), 'voicefx');
    if (next.targetLufs === null) return;
    const buf = await media.audioBuffer(vo.assetId);
    if (!buf) return;
    setBusy('Measuring loudness…');
    const gainDb = await makeupFor(buf, next);
    update((d) => void (d.voiceover?.fx && (d.voiceover.fx.gainDb = gainDb)), 'voicefx');
    setBusy('');
  };
  const set = (k: keyof VoiceFx, v: number) => void apply({ ...fx, [k]: v, preset: 'custom' });
  const renderPacePitch = async () => {
    const buf = await media.audioBuffer(vo.assetId);
    if (!buf) return;
    setBusy('Rendering pace / pitch…');
    try {
      const out = await paceAndPitch(buf, pace, pitch);
      const file = new File([encodeWav(out)], `voiceover_${pace.toFixed(2)}x_${pitch > 0 ? '+' : ''}${pitch}st.wav`, { type: 'audio/wav' });
      const next = await importAudio(useEditor.getState().project!, [file], { asVoiceover: true });
      update((d) => Object.assign(d, { assets: next.assets, voiceover: { ...next.voiceover!, fx: vo.fx } }));
      toast('Voiceover updated — Undo brings the original back. Re-run captions if the pace changed.', 'ok');
      setPace(1);
      setPitch(0);
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <Select label="Preset" value={FX_PRESETS[fx.preset] ? fx.preset : 'custom'} options={[...Object.entries(FX_PRESETS).map(([k, v]) => [k, v.label] as [string, string]), ...(FX_PRESETS[fx.preset] ? [] : [['custom', 'Custom'] as [string, string]])]} onChange={(v) => v !== 'custom' && void apply({ ...defaultFx(v), targetLufs: fx.targetLufs ?? -14 })} />
      <Slider label="Bass" value={fx.bass} min={-6} max={6} step={0.5} onChange={(v) => set('bass', v)} suffix=" dB" />
      <Slider label="Presence" value={fx.presence} min={-6} max={6} step={0.5} onChange={(v) => set('presence', v)} suffix=" dB" />
      <Slider label="Air" value={fx.air} min={-6} max={6} step={0.5} onChange={(v) => set('air', v)} suffix=" dB" />
      <Slider label="Compression" value={fx.compress} min={0} max={1} onChange={(v) => set('compress', v)} />
      <Slider label="De-ess" value={fx.deess} min={0} max={1} onChange={(v) => set('deess', v)} />
      <Slider label="Room" value={fx.room} min={0} max={0.5} onChange={(v) => set('room', v)} />
      <Toggle label="Loudness −14 LUFS (YouTube standard)" value={fx.targetLufs !== null} onChange={(v) => void apply({ ...fx, targetLufs: v ? -14 : null, gainDb: v ? fx.gainDb : 0 })} />
      {fx.targetLufs !== null && <p className="hint">Make-up gain {fx.gainDb > 0 ? '+' : ''}{fx.gainDb.toFixed(1)} dB</p>}
      <Toggle label="Compare: bypass (hear the original)" value={!!fx.bypass} onChange={(v) => update((d) => void (d.voiceover && (d.voiceover.fx = { ...fx, bypass: v })))} />
      <h4>Pace & pitch</h4>
      <Slider label="Pace" value={pace} min={0.85} max={1.15} step={0.01} onChange={setPace} fmt={(v) => `${v.toFixed(2)}×`} />
      <Slider label="Pitch" value={pitch} min={-3} max={3} step={0.5} onChange={setPitch} fmt={(v) => `${v > 0 ? '+' : ''}${v} st`} />
      <button className="btn sm" disabled={!!busy || (pace === 1 && pitch === 0)} onClick={renderPacePitch}><Icon name="bolt" /> Apply pace / pitch</button>
      {busy && <p className="hint">{busy}</p>}
    </>
  );
}
