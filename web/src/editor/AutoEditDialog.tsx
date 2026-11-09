import { narrationAudio, offsetWords } from '../audio/mix';
import { narrationClips } from '../lib/audiotracks';
import { useState } from 'react';
import { useEditor, findAsset, projectLength } from '../store';
import { useThumb } from './hooks';
import { media } from '../render/media';
import { detectBeats } from '../audio/beats';
import { applyAutoEdit, assignUnique, buildClips, planScenes, type AutoOptions, type AutoScene, type Candidate } from '../lib/autoedit';
import { indexMedia, matchPercent, decodeVec, dot, searchable, unindexed } from '../lib/mediasearch';
import { clipEmbedText, transcribeLocal } from '../ai/vision';
import { keywordsFrom } from '../lib/stocklinks';
import { chatJson, useLlm } from '../lib/llm';
import { engineHas, fetchResult, runJob, useEngine } from '../lib/engine';
import { STYLE_PRESETS, buildPrompt, stampName } from '../lib/scenes';
import { confirmHeavyAi } from '../lib/perf';
import { probe } from '../lib/project';
import { fmtTime } from '../lib/util';
import { Select, Slider, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import type { Asset, Word } from '../types';

const MIN_MATCH = 45;

function Thumb({ c }: { c: Candidate }) {
  const p = useEditor((s) => s.project!);
  const kind = c.assetId ? findAsset(p, c.assetId)?.kind : undefined;
  const t = useThumb(c.assetId ?? '', kind);
  const src = c.thumb ?? t;
  return src ? <img src={src} alt="" loading="lazy" /> : <i className="ph" />;
}

/** Auto-edit: voiceover → scenes → a visual per scene → timeline. */
export function AutoEditDialog({ onClose }: { onClose: () => void }) {
  const p = useEditor((s) => s.project!);
  const update = useEditor((s) => s.update);
  const llm = useLlm((s) => s.status);
  const engine = useEngine((s) => s.status);
  const musicClip = p.audio.find((c) => c.assetId && p.audioTracks.find((t) => t.id === c.trackId)?.kind === 'music');
  const hasMusic = !!musicClip;
  const [o, setO] = useState<AutoOptions>({ target: 4, snapBeats: hasMusic, motion: 'vary', transitions: 'mixed' });
  const [useMine, setUseMine] = useState(searchable(p).length > 0);
  const [aiQueries, setAiQueries] = useState(llm === 'ready');
  const [style, setStyle] = useState(STYLE_PRESETS[0][0]);
  const [scenes, setScenes] = useState<AutoScene[] | null>(null);
  const [busy, setBusy] = useState('');
  const words: Word[] = p.words.length ? p.words : p.lines.flatMap((l) => l.words);
  const length = projectLength(p);

  const transcribe = async () => {
    const na = await narrationAudio(p);
    if (!na) return;
    const blob = na.blob;
    const useEngineAsr = engine === 'ready' && engineHas('transcribe');
    if (!useEngineAsr && !confirmHeavyAi()) return;
    setBusy(useEngineAsr ? 'Transcribing on your Colab engine…' : 'Transcribing on this PC (first time downloads ~80 MB)…');
    try {
      let words: Word[];
      if (useEngineAsr) {
        const f = new FormData();
        f.append('file', blob, 'voiceover.wav');
        f.append('mode', 'words');
        f.append('language', 'auto');
        words = (await runJob('transcribe', f, (j) => setBusy(`Transcribing… ${j.logs[j.logs.length - 1] ?? ''}`))).data.words;
      } else words = (await transcribeLocal(blob, 'base', 'auto')).words;
      words = offsetWords(words, na.offset);
      update((d) => void ((d.words = words), (d.lines = []), (d.captions.enabled = true), (d.captions.wordLevel = true)));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  /** Visual search phrase per scene: written by the AI assistant when connected, else key words. */
  const queriesFor = async (texts: string[]): Promise<string[]> => {
    const fallback = texts.map((t) => keywordsFrom(t) || 'abstract cinematic background');
    if (!aiQueries || llm !== 'ready') return fallback;
    const out: string[] = [];
    for (let i = 0; i < texts.length; i += 20) {
      const chunk = texts.slice(i, i + 20);
      try {
        const r = await chatJson<string[]>('You pick B-roll for a faceless YouTube video. For each narration line write ONE concrete visual search query for stock footage (2–5 English words: subject + setting, no abstract words, no names).',
          `Lines:\n${chunk.map((t, k) => `${k + 1}. ${t || '(silence)'}`).join('\n')}\n\nReturn a JSON array of ${chunk.length} strings in order.`, 1500);
        out.push(...chunk.map((_, k) => String(r[k] ?? fallback[i + k])));
      } catch {
        out.push(...fallback.slice(i, i + chunk.length));
      }
    }
    return out;
  };

;

  const plan = async () => {
    try {
      setBusy('Planning scenes…');
      let beats: number[] = [];
      const m = musicClip;
      if (o.snapBeats && m) {
        const buf = await media.audioBuffer(m.assetId);
        if (buf) beats = detectBeats(buf).map((b) => b + m.start - m.trimIn).filter((b) => b >= m.start && b <= m.start + m.duration);
      }
      const planned = planScenes(words, length, o, beats);
      setBusy(aiQueries && llm === 'ready' ? 'Writing visual searches with your AI assistant…' : 'Picking search words…');
      const queries = await queriesFor(planned.map((s) => s.text));
      const out: AutoScene[] = planned.map((s, i) => ({ ...s, query: queries[i], candidates: [{ key: 'blank', source: 'blank', label: 'Placeholder' }], pick: 'blank' }));

      if (useMine && searchable(p).length) {
        const todo = unindexed(p);
        if (!todo.length || confirmHeavyAi()) {
          if (todo.length) {
            const vecs = await indexMedia(todo, (n, t) => setBusy(`Indexing your media ${n} / ${t}…`));
            update((d) => void (d.embeddings = { ...(d.embeddings ?? {}), ...vecs }));
          }
          setBusy('Matching your media to each scene…');
          const proj = useEditor.getState().project!;
          const assets = searchable(proj).filter((a) => proj.embeddings?.[a.id]);
          const avecs = assets.map((a) => decodeVec(proj.embeddings![a.id]));
          const qv = await clipEmbedText(queries.map((q) => (q.split(/\s+/).length <= 3 ? `a photo of ${q}` : q)));
          const scores = qv.map((q) => avecs.map((v) => matchPercent(dot(q, v))));
          const best = assignUnique(scores, MIN_MATCH);
          out.forEach((s, i) => {
            const top = scores[i].map((sc, a) => [sc, a] as const).sort((x, y) => y[0] - x[0]).slice(0, 3);
            s.candidates.unshift(...top.map(([sc, a]): Candidate => ({ key: `mine:${assets[a].id}`, source: 'mine', label: `${assets[a].name} · ${sc}%`, assetId: assets[a].id, match: sc })));
            if (best[i] !== null) s.pick = `mine:${assets[best[i]!].id}`;
          });
        }
      }
      setScenes(out);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const setScene = (i: number, fn: (s: AutoScene) => void) => setScenes((list) => list && list.map((s, k) => (k === i ? (() => { const c = { ...s, candidates: [...s.candidates] }; fn(c); return c; })() : s)));


  /** One Colab job for every scene still on a placeholder (or all scenes). */
  const aiImages = async (all: boolean) => {
    const targets = scenes!.map((s, i) => ({ s, i })).filter(({ s }) => all || s.pick === 'blank');
    if (!targets.length) return toast('Every scene already has a visual', 'info');
    setBusy(`Generating ${targets.length} AI images on Colab…`);
    try {
      const f = new FormData();
      f.append('items', JSON.stringify(targets.map(({ s }) => ({ name: stampName(s.start, 'png'), prompt: buildPrompt(style, '', s.query || s.text), t: s.start }))));
      f.append('aspect', p.export.aspect === '9:16' ? '9:16' : p.export.aspect === '1:1' ? '1:1' : '16:9');
      f.append('model', 'lightning');
      f.append('steps', '4');
      f.append('seed', '0');
      f.append('smart_prompts', '0');
      f.append('style', style);
      f.append('character', '');
      const job = await runJob('imagegen', f, (j) => setBusy(`Generating AI images… ${Math.round(j.progress * 100)}%`));
      const assets = await Promise.all(job.files.map(async (file) => probe(await fetchResult(file.url), file.name, 'image')));
      update((d) => void d.assets.push(...assets));
      setScenes((list) => list && list.map((s, i) => {
        const k = targets.findIndex((x) => x.i === i);
        if (k < 0 || !assets[k]) return s;
        const c: Candidate = { key: `ai:${assets[k].id}`, source: 'ai', label: 'AI image', assetId: assets[k].id };
        return { ...s, candidates: [c, ...s.candidates], pick: c.key };
      }));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const build = async () => {
    if (!scenes) return;
    const empty = scenes.filter((x) => x.pick === 'blank').length;
    if (empty && !confirm(`${empty} of ${scenes.length} scenes have no visual yet and will be black placeholders. Build anyway? (You can fill them later — right-click a clip → Replace, or use AI images.)`)) return;
    if (p.clips.length && !confirm(`Replace your ${p.clips.length} clips with ${scenes.length} auto-edited scenes? (Undo brings them back)`)) return;
    const assetFor: (string | undefined)[] = [];
    const newAssets: Asset[] = [];
    try {
      for (const [i, s] of scenes.entries()) {
        const c = s.candidates.find((k) => k.key === s.pick);
        if (!c || c.source === 'blank') continue;
        if (c.assetId) assetFor[i] = c.assetId;

      }
      update((d) => {
        d.assets.push(...newAssets);
        const kinds = new Map(d.assets.map((a) => [a.id, a.kind]));
        applyAutoEdit(d, buildClips(scenes, (i) => assetFor[i], (id) => kinds.get(id) === 'video', o));
      });
      const blanks = scenes.length - assetFor.filter(Boolean).length;
      toast(`Timeline built: ${scenes.length} scenes${blanks ? ` (${blanks} placeholders to fill)` : ''} — Undo restores the old edit`, 'ok');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const picked = scenes?.filter((s) => s.pick !== 'blank').length ?? 0;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal xwide autoedit" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>Auto-edit from voiceover</h3><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        {!narrationClips(p).length && !words.length ? <p className="warn">Add a voiceover first (Audio panel or Add media).</p> : !words.length ? (
          <div className="card notice">
            <b>The voiceover needs a transcript</b>
            <p className="hint">Scenes follow the narration's sentences and pauses.</p>
            <button className="btn primary sm" disabled={!!busy} onClick={transcribe}><Icon name="captions" /> Transcribe {engine === 'ready' && engineHas('transcribe') ? '(Colab)' : '(on this PC)'}</button>
            {busy && <span className="hint">{busy}</span>}
          </div>
        ) : !scenes ? (
          <>
            <p className="hint">{words.length} words · {fmtTime(length)}. Splits the narration into scenes, finds a visual for each, and builds the timeline. You review every scene before anything changes.</p>
            <Slider label="Scene length" value={o.target} min={2} max={10} step={0.5} onChange={(v) => setO({ ...o, target: v })} suffix="s" />
            <Toggle label={`Cut on the music's beats${hasMusic ? '' : ' (add music first)'}`} value={o.snapBeats && hasMusic} onChange={(v) => setO({ ...o, snapBeats: v })} />
            <h4>Where visuals come from (in order)</h4>
            <Toggle label={`1. My media — best match by description (${searchable(p).length} items, runs on this PC)`} value={useMine} onChange={setUseMine} />
            <Toggle label={`Write visual searches with my AI assistant${llm === 'ready' ? '' : ' (connect LLM)'}`} value={aiQueries && llm === 'ready'} onChange={setAiQueries} />
            <p className="hint">After planning you can also generate AI images on Colab for any scene, or keep placeholders to fill with Google Flow.</p>
            <div className="row">
              <Select label="Motion" value={o.motion} options={[['vary', 'Vary per scene'], ['keep', 'Keep current']] as const} onChange={(v) => setO({ ...o, motion: v })} />
              <Select label="Transitions" value={o.transitions} options={[['mixed', 'Mostly cuts'], ['cuts', 'Cuts only'], ['soft', 'Crossfades']] as const} onChange={(v) => setO({ ...o, transitions: v })} />
            </div>
            <div className="row end"><button className="btn primary" disabled={!!busy} onClick={plan}><Icon name="wand" /> {busy || 'Plan scenes'}</button></div>
          </>
        ) : (
          <>
            <div className="row wrap between">
              <span className="hint">{scenes.length} scenes · {picked} with a visual{scenes.length - picked ? <b className="warn"> · {scenes.length - picked} empty</b> : null} · click a thumbnail to choose, edit a search and press ↻ to find more.</span>
              <div className="row wrap">
                <select value={style} onChange={(e) => setStyle(e.target.value)} title="Style for AI images">{STYLE_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <button className="btn sm" disabled={!!busy || engine !== 'ready' || !engineHas('imagegen')} onClick={() => aiImages(false)} title={engineHas('imagegen') ? '' : 'Needs the AutoStudio engine'}><Icon name="image" /> AI images for empty scenes</button>
              </div>
            </div>
            <div className="scene-list">
              {scenes.map((s, i) => (
                <div key={i} className="scene-row">
                  <div className="scene-meta">
                    <code>{fmtTime(s.start)}</code>
                    <span className="hint">{(s.end - s.start).toFixed(1)} s</span>
                  </div>
                  <div className="scene-text">
                    <span>{s.text || <em className="hint">(no narration)</em>}</span>
                    <div className="row">
                      <input value={s.query} onChange={(e) => setScene(i, (x) => void (x.query = e.target.value))} />
                    </div>
                  </div>
                  <div className="scene-cands">
                    {s.candidates.map((c) => (
                      <button key={c.key} className={`cand ${s.pick === c.key ? 'on' : ''} ${c.source}`} onClick={() => setScene(i, (x) => void (x.pick = c.key))} title={c.label}>
                        <Thumb c={c} />
                        <span>{c.source === 'mine' ? `${c.match}%` : c.source === 'ai' ? 'AI' : '—'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {busy && <p className="hint">{busy}</p>}
            <div className="row end">
              <button className="btn ghost" onClick={() => setScenes(null)}>Back</button>
              <button className="btn primary" disabled={!!busy} onClick={build}><Icon name="film" /> Build timeline</button>
            </div>
          </>
        )}
        {busy && !scenes && words.length > 0 && <p className="hint">{busy}</p>}
      </div>
    </div>
  );
}
