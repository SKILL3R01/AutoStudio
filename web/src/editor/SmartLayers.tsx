/** Smart layers on real footage: analyse faces / calm areas → suggestions from what is said → placed around the face. */
import { useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { useEditor } from '../store';
import { useProject } from './hooks';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { Toggle } from '../components/ui';
import { fmtTime } from '../lib/util';
import { suggestChapters } from '../lib/chapters';
import { LiveThumb, makeGroup } from './pickers/LiveThumb';
import { analyzeFootage, footageKey } from '../motion/smart/footage';
import { facesAt, freeZones, placeSuggestion, suggestLayers, type Suggestion } from '../motion/smart/place';
import { getKit, variantOf } from '../motion/styles';
import { frameOf } from '../motion/story/model';

/** Preview overlay switch: show detected faces (green) and calm zones (blue). */
export const useZones = create<{ on: boolean; set: (on: boolean) => void }>((set) => ({ on: false, set: (on) => set({ on }) }));

const KIND_LABEL: Record<Suggestion['kind'], string> = { name: 'Name tag', number: 'Number card', list: 'Checklist', quote: 'Quote card', topic: 'Topic tab', cta: 'Call to action', emoji: 'Reaction' };
const PRESETS = [
  { id: 'talking', name: 'Talking head', kinds: ['name', 'number', 'list', 'quote', 'topic', 'cta', 'emoji'] as Suggestion['kind'][] },
  { id: 'podcast', name: 'Podcast / interview', kinds: ['name', 'quote', 'topic', 'number', 'cta'] as Suggestion['kind'][] },
];

export function SmartLayers() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const time = useEditor((s) => s.time);
  const zones = useZones();
  const [busy, setBusy] = useState('');
  const [preset, setPreset] = useState('talking');
  const [list, setList] = useState<Suggestion[]>([]);
  const stop = useRef<AbortController | null>(null);
  const an = p.footage;
  const stale = !!an && an.key !== footageKey(p);
  const pal = p.story ? variantOf(getKit(p.story.styleId), p.story.variantId).palette : getKit('explainer').variants[0].palette;
  const frame = frameOf(p);
  const words = useMemo(() => (p.words?.length ? p.words : p.lines.flatMap((l) => l.words)), [p.words, p.lines]);
  const stats = useMemo(() => {
    if (!an) return null;
    const withFace = an.faces.filter((f) => f.length).length, two = an.faces.filter((f) => f.length >= 2).length;
    return { pct: Math.round((withFace / Math.max(1, an.faces.length)) * 100), two: two > an.faces.length * 0.3 };
  }, [an]);

  const analyse = async () => {
    stop.current = new AbortController();
    setBusy('Starting…');
    try {
      const res = await analyzeFootage(useEditor.getState().project!, (_k, msg) => setBusy(msg), stop.current.signal);
      update((d) => void (d.footage = res));
      toast(`Video analysed: faces in ${Math.round((res.faces.filter((f) => f.length).length / Math.max(1, res.faces.length)) * 100)}% of the video`, 'ok');
      suggest();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast(`Analysis: ${(e as Error).message}`, 'error');
    } finally {
      setBusy('');
    }
  };
  const suggest = () => {
    if (!words.length) return toast('Smart layers follow what is said — create captions first (Captions panel → Transcribe)', 'info');
    const ch = p.chapters?.length ? p.chapters : suggestChapters(words, words[words.length - 1].end);
    const kinds = PRESETS.find((x) => x.id === preset)!.kinds;
    setList(suggestLayers(words, ch).filter((s) => kinds.includes(s.kind)));
  };
  const add = () => {
    const chosen = list.filter((s) => s.on);
    if (!chosen.length) return;
    update((d) => {
      d.motion = (d.motion ?? []).filter((g) => !chosen.some((s) => g.id.startsWith(`smart_${s.id}_`)));
      for (const s of chosen) d.motion.push(placeSuggestion(s, d.footage, frameOf(d), pal));
      d.motion.sort((a, b) => a.start - b.start);
    });
    toast(`${chosen.length} smart layers added around the faces — drag any of them on the preview to adjust`, 'ok');
  };
  const setS = (id: string, fn: (s: Suggestion) => void) => setList((l) => l.map((s) => { if (s.id !== id) return s; const c = { ...s }; fn(c); return c; }));

  const here = an ? facesAt(an, time) : [];
  return (
    <div className="smart" data-tour="smart">
      <div className="look-grid">
        {PRESETS.map((pr) => (
          <LiveThumb key={pr.id} width={128} height={72} className={preset === pr.id ? 'on' : ''} title={pr.name} onClick={() => setPreset(pr.id)}
            group={makeGroup([
              { id: 'bg', type: 'background', kind: 'gradient', colors: ['#2a2f3a', '#151820'], start: 0, dur: 3 },
              ...(pr.id === 'podcast' ? [-480, 480] : [-380]).map((x, i) => ({ id: `f${i}`, type: 'shape' as const, shape: 'ellipse', w: 260, h: 320, x, y: -60, color: '#c9a184', start: 0, dur: 3 })),
              { id: 'n', type: 'widget', widget: 'headline', title: pr.id === 'podcast' ? 'Sarah · Guest' : 'Your name', size: 64, x: pr.id === 'podcast' ? -480 : 300, y: 300, start: 0.3, dur: 2.7, in: 'slide-from-left' },
              { id: 't', type: 'widget', widget: 'tag', text: 'TOPIC', x: 620, y: -380, start: 0.6, dur: 2.4 },
            ], { w: 1920, h: 1080 }, pal, 3)}>
            <span className="thumb-label">{pr.name}</span>
          </LiveThumb>
        ))}
      </div>
      <p className="hint">{an ? `Analysed ${fmtTime(an.faces.length / an.fps)} · faces in ${stats!.pct}% of it${stats!.two ? ' · two people (podcast)' : ''}${stale ? ' · the video changed — analyse again' : ''}` : 'The app looks at your video on this PC to find faces and empty space, then places name tags, quotes and topic tabs from what is said.'}</p>
      <div className="row wrap">
        <button className="btn sm primary" disabled={!!busy || (!p.clips.length && !p.pips?.length)} onClick={() => void analyse()}><Icon name="scan-face" /> {busy || (an ? 'Analyse again' : 'Analyse the video')}</button>
        {busy && <button className="btn sm ghost" onClick={() => stop.current?.abort()}>Stop</button>}
        {an && !busy && <button className="btn sm" onClick={suggest}>Suggest layers</button>}
      </div>
      <Toggle label={`Show zones on the preview${zones.on && an ? ` (${here.length} face${here.length === 1 ? '' : 's'} here)` : ''}`} value={zones.on} onChange={zones.set} />
      {list.length > 0 && (
        <>
          <div className="smart-list">
            {list.map((s) => {
              const g = placeSuggestion(s, an, frame, pal);
              return (
                <div key={s.id} className={`smart-item ${s.on ? '' : 'off'}`}>
                  <LiveThumb width={96} height={54} title={`${KIND_LABEL[s.kind]} at ${fmtTime(s.t)}`} onClick={() => useEditor.getState().seek(s.t + 0.2)}
                    group={makeGroup([{ id: 'bg', type: 'background', kind: 'flat', colors: ['#2a2f3a'], start: 0, dur: s.dur }, ...g.items], frame, pal, s.dur)} />
                  <div>
                    <b>{KIND_LABEL[s.kind]}</b> <span className="hint">{fmtTime(s.t)}</span>
                    <input value={s.kind === 'number' ? s.value ?? '' : s.kind === 'list' ? (s.items ?? []).join(', ') : s.title} onChange={(e) => setS(s.id, (x) => (s.kind === 'number' ? (x.value = e.target.value) : s.kind === 'list' ? (x.items = e.target.value.split(',').map((v) => v.trim())) : (x.title = e.target.value)))} />
                  </div>
                  <input type="checkbox" checked={s.on} onChange={(e) => setS(s.id, (x) => (x.on = e.target.checked))} title="Use this one" />
                </div>
              );
            })}
          </div>
          <button className="btn primary" onClick={add}><Icon name="plus" /> Add {list.filter((s) => s.on).length} smart layers</button>
        </>
      )}
    </div>
  );
}

/** Preview overlay: faces (green) and the calm zones (blue) the placement uses at the current time. */
export function ZonesOverlay() {
  const p = useProject();
  const time = useEditor((s) => s.time);
  const on = useZones((s) => s.on);
  const an = p.footage;
  if (!on || !an) return null;
  const faces = facesAt(an, time), zs = freeZones(an, time, 1);
  return (
    <div className="zones-overlay">
      {zs.map((z, i) => <i key={`z${i}`} className="zone free" style={{ left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.w * 100}%`, height: `${z.h * 100}%` }}><span>free</span></i>)}
      {faces.map((f, i) => <i key={`f${i}`} className="zone face" style={{ left: `${f[0] * 100}%`, top: `${f[1] * 100}%`, width: `${f[2] * 100}%`, height: `${f[3] * 100}%` }}><span>face{f[4] > 0.25 ? ' · talking' : ''}</span></i>)}
    </div>
  );
}
