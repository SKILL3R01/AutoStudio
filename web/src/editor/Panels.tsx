import { useState } from 'react';
import { useEditor, findAsset, projectLength, voiceEnd } from '../store';
import { useClipTarget, useProject } from './hooks';
import { MOTIONS, TRANSITIONS, EFFECTS, type Motion, type Transition, type Overlay, type EffectKind, type EffectLayer } from '../types';
import { FilePick, Section, Seg, Slider } from '../components/ui';
import { Icon } from '../components/icons';
import { CaptionsPanel } from './CaptionsPanel';
import { KeywordsPanel } from './KeywordsPanel';
import { MediaPanel } from './MediaPanel';
import { FreeMediaPanel } from './FreeMediaPanel';
import { AiPanel } from './AiPanel';
import { SilenceDialog } from './SilenceDialog';
import { GradeEditor } from './GradeEditor';
import { EFFECT_LABELS } from '../render/effects';
import { SFX, sfxBuffer } from '../audio/sfx';
import { blankClip, importAudio, probe, setVoiceStart } from '../lib/project';
import { uid } from '../lib/util';

export const TABS = [
  ['media', 'Media', 'media'], ['stock', 'Free media', 'download'], ['motion', 'Motion', 'motion'], ['transitions', 'Transitions', 'transition'], ['captions', 'Captions', 'captions'],
  ['keywords', 'Typography', 'keywords'], ['text', 'Text', 'text'], ['music', 'Audio', 'music'], ['sfx', 'SFX', 'sfx'], ['effects', 'Effects', 'effects'], ['color', 'Colour', 'image'], ['ai', 'AI', 'wand'],
] as const;
export type Tab = (typeof TABS)[number][0];

export const MOTION_LABELS: Record<Motion, string> = {
  none: 'None', zoomIn: 'Zoom in', zoomOut: 'Zoom out', panLeft: 'Pan left', panRight: 'Pan right', tiltUp: 'Tilt up',
  tiltDown: 'Tilt down', diagonal: 'Diagonal', drift: 'Drift', breathe: 'Breathe', alternate: 'Alternate zoom', random: 'Random mix', custom: 'Custom framing',
  parallaxZoom: '3D push-in', parallaxOrbit: '3D orbit', dollyZoom: '3D dolly zoom',
};

export const TRANSITION_LABELS: Record<Transition, string> = {
  none: 'Cut', crossfade: 'Crossfade', fadeBlack: 'Fade black', fadeWhite: 'Fade white', flash: 'Flash', slideLeft: 'Slide ←', slideRight: 'Slide →',
  slideUp: 'Slide ↑', slideDown: 'Slide ↓', zoomPunch: 'Zoom punch', wipe: 'Wipe', blur: 'Blur', glitch: 'Glitch', circle: 'Circle', random: 'Random',
};

export function Sidebar() {
  const [tab, setTab] = useState<Tab>('motion');
  const label = TABS.find((t) => t[0] === tab)![1];
  return (
    <>
      <nav className="rail">
        {TABS.map(([id, name, icon]) => (
          <button key={id} className={id === tab ? 'on' : ''} onClick={() => setTab(id)} title={name}>
            <Icon name={icon} size={18} />
            <span>{name}</span>
          </button>
        ))}
      </nav>
      <aside className="panels">
        <div className="panel-title">{label}</div>
        <div className="panel-body">
          {tab === 'media' && <MediaPanel />}
          {tab === 'stock' && <FreeMediaPanel />}
          {tab === 'motion' && <MotionPanel />}
          {tab === 'transitions' && <TransitionsPanel />}
          {tab === 'captions' && <CaptionsPanel />}
          {tab === 'keywords' && <KeywordsPanel />}
          {tab === 'text' && <OverlayPanel />}
          {tab === 'music' && <MusicPanel />}
          {tab === 'sfx' && <SfxPanel />}
          {tab === 'effects' && <EffectsPanel />}
          {tab === 'color' && <ColorPanel />}
          {tab === 'ai' && <AiPanel />}
        </div>
      </aside>
    </>
  );
}

function TargetHint({ selected, count }: { selected: string | null; count: number }) {
  return (
    <p className="target">
      <Icon name="cursor" size={13} />
      {count > 1 ? `Applies to ${count} selected clips` : selected ? 'Applies to the selected clip · Esc = all clips' : 'Applies to every clip · click (Shift-click for several) a clip to target it'}
    </p>
  );
}

function MotionPanel() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const { selectedId, count, apply } = useClipTarget();
  const cur = selectedId ? p.clips.find((c) => c.id === selectedId)?.motion : p.clips.every((c) => c.motion === p.clips[0]?.motion) ? p.clips[0]?.motion : undefined;
  return (
    <>
      <Section title="Camera movement">
        <TargetHint selected={selectedId} count={count} />
        <div className="grid2">
          {MOTIONS.filter((m) => !m.startsWith('parallax') && m !== 'dollyZoom').map((m) => (
            <button key={m} className={`tile motion-tile m-${m} ${cur === m ? 'on' : ''}`} onClick={() => apply((c) => void (c.motion = m))}><i />{MOTION_LABELS[m]}</button>
          ))}
        </div>
        <Slider label="Depth" value={p.motionDepth} min={0} max={0.4} onChange={(v) => update((d) => void (d.motionDepth = v), 'depth')} fmt={(v) => `${Math.round(v * 100)}%`} />
      </Section>
      <Section title="3D depth motion" hint="Uses an AI depth map of each image (made in your browser) so the foreground moves against the background.">
        <div className="grid3">
          {(['parallaxZoom', 'parallaxOrbit', 'dollyZoom'] as Motion[]).map((m) => (
            <button key={m} className={`tile ${cur === m ? 'on' : ''}`} onClick={() => apply((c) => void (c.motion = m))}>{MOTION_LABELS[m]}</button>
          ))}
        </div>
        <p className="hint">Generate depth maps in the <b>AI</b> panel (or per clip in Properties). Clips without one fall back to a zoom.</p>
      </Section>
      <Section title="Scene fades">
        <Slider label="Fade in" value={p.sceneFades.fadeIn} min={0} max={3} onChange={(v) => update((d) => void (d.sceneFades.fadeIn = v), 'fi')} suffix="s" />
        <Slider label="Fade out" value={p.sceneFades.fadeOut} min={0} max={5} onChange={(v) => update((d) => void (d.sceneFades.fadeOut = v), 'fo')} suffix="s" />
      </Section>

    </>
  );
}

function TransitionsPanel() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const { selectedId, count, apply } = useClipTarget();
  const cur = selectedId ? p.clips.find((c) => c.id === selectedId)?.transition : p.clips.every((c) => c.transition === p.clips[0]?.transition) ? p.clips[0]?.transition : undefined;
  const addWhooshes = () => update((d) => {
    d.sfx = d.sfx.filter((s) => !s.id.startsWith('auto_'));
    d.clips.slice(1).forEach((c) => c.transition !== 'none' && d.sfx.push({ id: 'auto_' + uid(), sound: 'whoosh', start: Math.max(0, c.start - 0.4), volume: 0.5 }));
  });
  return (
    <Section title="Transitions" hint="Plays into the clip, centred on its cut.">
      <TargetHint selected={selectedId} count={count} />
      <div className="grid3">
        {TRANSITIONS.map((t) => <button key={t} className={`tile ${cur === t ? 'on' : ''}`} onClick={() => apply((c) => void (c.transition = t))}>{TRANSITION_LABELS[t]}</button>)}
      </div>
      <Slider label="Duration" value={p.transitionDuration} min={0.1} max={2} onChange={(v) => update((d) => void (d.transitionDuration = v), 'td')} suffix="s" />
      <button className="btn sm" onClick={addWhooshes}><Icon name="sfx" /> Add a whoosh on every transition</button>
    </Section>
  );
}

export const newOverlay = (t: number, o: Partial<Overlay> = {}): Overlay => ({
  id: uid(), text: 'Your text', start: t, duration: 4, x: 0.5, y: 0.2, size: 1, color: '#ffffff', font: 'Montserrat', weight: 800, rotate: 0,
  blur: 0, opacity: 1, fadeIn: 0.4, fadeOut: 0.4, background: 'transparent', shadow: true, ...o,
});

function OverlayPanel() {
  const p = useProject();
  const { update, selection, time, select } = useEditor();
  const add = (ov: Overlay) => (update((d) => void d.overlays.push(ov)), select({ kind: 'overlay', id: ov.id }));
  return (
    <Section title="Text & overlays" hint="Titles, lower thirds, your logo or watermark. Drag them on the preview; edit in Properties.">
      <div className="grid2">
        <button className="tile big" onClick={() => add(newOverlay(time))}><span className="t-title">Title</span></button>
        <button className="tile big" onClick={() => add(newOverlay(time, { text: 'Lower third', y: 0.8, x: 0.28, size: 0.7, background: 'rgba(0,0,0,0.6)', duration: 5 }))}><span className="t-lower">Lower third</span></button>
        <button className="tile big" onClick={() => add(newOverlay(time, { text: 'SUBSCRIBE', y: 0.85, size: 0.8, color: '#111', background: '#ffd400', font: 'Bebas Neue', weight: 400 }))}><span className="t-cta">Call to action</span></button>
        <FilePick accept="image/*" className="tile big" onFiles={async ([f]) => {
          if (!f) return;
          const a = await probe(f, f.name, 'image');
          const ov = newOverlay(0, { text: f.name, assetId: a.id, x: 0.9, y: 0.1, size: 0.12, duration: projectLength(p), fadeIn: 0, fadeOut: 0, opacity: 0.85, shadow: false });
          update((d) => (d.assets.push(a), d.overlays.push(ov)));
          select({ kind: 'overlay', id: ov.id });
        }}><Icon name="image" /> Logo / image</FilePick>
      </div>
      <div className="list">
        {p.overlays.map((x) => (
          <button key={x.id} className={`list-item ${selection?.id === x.id ? 'on' : ''}`} onClick={() => (select({ kind: 'overlay', id: x.id }), useEditor.getState().seek(x.start + 0.01))}>
            <Icon name={x.assetId ? 'image' : 'text'} /> {x.text.slice(0, 28)} <span className="hint">{x.start.toFixed(1)}s</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function MusicPanel() {
  const p = useProject();
  const { update, selection, select } = useEditor();
  const len = projectLength(p);
  const add = async (files: File[]) => {
    const next = await importAudio(p, files, { asMusic: true });
    update((d) => {
      d.assets = next.assets;
      d.music = next.music.map((m) => (d.music.some((x) => x.id === m.id) ? m : { ...m, duration: Math.min(m.duration, len) }));
    });
  };
  const loopFill = (id: string) => update((d) => {
    const m = d.music.find((x) => x.id === id)!;
    const dur = findAsset(d, m.assetId)?.duration ?? m.duration;
    for (let t = m.start + dur; t < len; t += dur) d.music.push({ ...m, id: uid(), start: t, duration: Math.min(dur, len - t), fadeIn: 0 });
  });
  const ve = voiceEnd(p);
  const [silenceOpen, setSilenceOpen] = useState(false);
  return (
    <>
      {silenceOpen && <SilenceDialog onClose={() => setSilenceOpen(false)} />}
      <Section title="Start & end" hint="Visuals before the narration (intro), after it (outro), blank sections and fades. You can also drag the voice lane and the ◀▶ end handle on the timeline.">
        {p.voiceover ? (
          <>
            <Slider label="Intro" value={p.voiceStart} min={0} max={20} step={0.1} onChange={(v) => update((d) => setVoiceStart(d, v), 'intro')} suffix="s" />
            <Slider label="Outro" value={p.tail} min={0} max={30} step={0.1} onChange={(v) => update((d) => void (d.tail = v), 'outro')} suffix="s" />
          </>
        ) : <Slider label="Length" value={p.length} min={1} max={Math.max(120, p.length)} step={0.5} onChange={(v) => update((d) => void (d.length = v), 'len')} suffix="s" />}
        <div className="row wrap">
          <button className="btn sm" onClick={() => update((d) => {
            const end = projectLength(d);
            if (ve) d.tail += 3;
            else d.length += 3;
            d.clips.push(blankClip(end));
          })}><Icon name="plus" /> Add 3 s black outro</button>
          <button className="btn sm" onClick={() => update((d) => void (ve ? (d.tail += 3) : (d.length += 3)))}><Icon name="plus" /> Hold last image +3 s</button>
          {ve > 0 && <button className="btn sm ghost" onClick={() => update((d) => ((d.tail = 0), setVoiceStart(d, 0)))}>Reset to narration</button>}
        </div>
        <Slider label="Audio fade in" value={p.audioFade.in} min={0} max={5} step={0.1} onChange={(v) => update((d) => void (d.audioFade.in = v), 'afi')} suffix="s" />
        <Slider label="Audio fade out" value={p.audioFade.out} min={0} max={10} step={0.1} onChange={(v) => update((d) => void (d.audioFade.out = v), 'afo')} suffix="s" />
        <Slider label="Video fade in" value={p.sceneFades.fadeIn} min={0} max={3} onChange={(v) => update((d) => void (d.sceneFades.fadeIn = v), 'fi')} suffix="s" />
        <Slider label="Video fade out" value={p.sceneFades.fadeOut} min={0} max={5} onChange={(v) => update((d) => void (d.sceneFades.fadeOut = v), 'fo')} suffix="s" />
      </Section>
      <Section title="Voiceover">
        {p.voiceover ? (
          <>
            <button className="btn sm" onClick={() => setSilenceOpen(true)}><Icon name="scissors" /> Remove silences…</button>
            <p className="hint"><Icon name="mic" /> {findAsset(p, p.voiceover.assetId)?.name}</p>
            <Slider label="Volume" value={p.voiceover.volume} min={0} max={2} onChange={(v) => update((d) => void (d.voiceover!.volume = v), 'vov')} fmt={(v) => `${Math.round(v * 100)}%`} />
          </>
        ) : <p className="hint">No voiceover — the project length is set by the clips.</p>}
        <FilePick accept="audio/*" className="btn sm" onFiles={async (f) => {
          const next = await importAudio(p, f, { asVoiceover: true });
          update((d) => ((d.assets = next.assets), (d.voiceover = next.voiceover)));
        }}><Icon name="upload" /> {p.voiceover ? 'Replace voiceover' : 'Add voiceover'}</FilePick>
      </Section>
      <Section title="Music & audio beds" hint="Drag on the M lane to time it; ducking lowers it while someone speaks.">
        <FilePick accept="audio/*" multiple onFiles={add} className="btn sm"><Icon name="upload" /> Add music</FilePick>
        {p.music.map((m) => (
          <button key={m.id} className={`list-item ${selection?.id === m.id ? 'on' : ''}`} onClick={() => select({ kind: 'music', id: m.id })}>
            <Icon name="music" /> {findAsset(p, m.assetId)?.name} <span className="hint">{Math.round(m.volume * 100)}%</span>
            <span className="grow" />
            <span className="link" onClick={(e) => (e.stopPropagation(), loopFill(m.id))}>Loop to fill</span>
          </button>
        ))}
      </Section>
    </>
  );
}

function SfxPanel() {
  const p = useProject();
  const { update, time, select } = useEditor();
  const [vol, setVol] = useState(0.7);
  const preview = async (name: string) => {
    const b = await sfxBuffer(name);
    if (!b) return;
    const c = new AudioContext();
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start();
    s.onended = () => c.close();
  };
  const add = (sound: string) => {
    const id = uid();
    update((d) => void d.sfx.push({ id, sound, start: time, volume: vol }));
    select({ kind: 'sfx', id });
  };
  return (
    <>
      <Section title="Sound effects" hint="▶ to listen, + to drop at the playhead. Drag markers on the FX lane to retime.">
        <Slider label="Volume" value={vol} min={0} max={1.5} onChange={setVol} fmt={(v) => `${Math.round(v * 100)}%`} />
        <div className="list">
          {SFX.map((s) => (
            <div key={s} className="list-item sfx-row">
              <button className="icon-btn" onClick={() => preview(s)}><Icon name="play" /></button>
              <span>{s}</span>
              <button className="icon-btn" onClick={() => add(s)}><Icon name="plus" /></button>
            </div>
          ))}
        </div>
        <FilePick accept="audio/*" className="btn sm" onFiles={async ([f]) => {
          if (!f) return;
          const a = await probe(f, f.name, 'audio');
          update((d) => (d.assets.push(a), d.sfx.push({ id: uid(), sound: `asset:${a.id}`, start: time, volume: vol })));
        }}><Icon name="upload" /> Upload your own sound</FilePick>
      </Section>
      <Section title={`Placed (${p.sfx.length})`}>
        <div className="list">
          {p.sfx.slice().sort((a, b) => a.start - b.start).map((s) => (
            <div key={s.id} className="list-item sfx-row" onClick={() => (select({ kind: 'sfx', id: s.id }), useEditor.getState().seek(s.start))}>
              <span>{s.sound.startsWith('asset:') ? findAsset(p, s.sound.slice(6))?.name : s.sound}</span>
              <span className="hint">{s.start.toFixed(2)}s</span>
              <input type="range" min={0} max={1.5} step={0.01} value={s.volume} onChange={(e) => update((d) => void (d.sfx.find((x) => x.id === s.id)!.volume = +e.target.value), `sv${s.id}`)} />
              <button className="icon-btn" onClick={(e) => (e.stopPropagation(), update((d) => void (d.sfx = d.sfx.filter((x) => x.id !== s.id))))}><Icon name="x" /></button>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function EffectsPanel() {
  const p = useProject();
  const { update, time, selection, multi } = useEditor();
  const len = projectLength(p);
  const selected = [...(selection?.kind === 'clip' ? [selection.id] : []), ...multi];
  const toggle = (k: EffectKind) => update((d) => {
    const i = d.effects.findIndex((e) => e.kind === k);
    if (i >= 0) d.effects.splice(i, 1);
    else d.effects.push({ kind: k, intensity: 0.5, scope: { kind: 'all' } });
  });
  const setFx = (i: number, fn: (e: EffectLayer) => void, key?: string) => update((d) => fn(d.effects[i]), key);
  return (
    <Section title="Effects" hint="Stack as many as you like. Each can cover the whole video, a time range or chosen clips.">
      <div className="grid3">
        {EFFECTS.filter((e) => e !== 'none').map((k) => (
          <button key={k} className={`tile fx fx-${k} ${p.effects.some((e) => e.kind === k) ? 'on' : ''}`} onClick={() => toggle(k)}><i />{EFFECT_LABELS[k]}</button>
        ))}
      </div>
      {p.effects.map((e, i) => {
        const sc = e.scope ?? { kind: 'all' as const };
        return (
          <div key={e.kind} className="card">
            <div className="row between"><b>{EFFECT_LABELS[e.kind]}</b><button className="icon-btn" onClick={() => update((d) => void d.effects.splice(i, 1))}><Icon name="x" /></button></div>
            <Slider label="Intensity" value={e.intensity} min={0} max={1} onChange={(v) => setFx(i, (x) => void (x.intensity = v), `fx${e.kind}`)} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Seg options={[['all', 'Whole video'], ['range', 'Time range'], ['clips', 'Chosen clips']] as const} value={sc.kind} onChange={(v) => setFx(i, (x) => {
              if (v === 'all') x.scope = { kind: 'all' };
              else if (v === 'range') x.scope = { kind: 'range', start: time, end: Math.min(len, time + 4) };
              else x.scope = { kind: 'clips', ids: selected.length ? selected : p.clips[0] ? [p.clips[0].id] : [] };
            })} />
            {sc.kind === 'range' && (
              <>
                <Slider label="From" value={sc.start} min={0} max={len} step={0.05} onChange={(v) => setFx(i, (x) => void (x.scope = { kind: 'range', start: Math.min(v, sc.end - 0.1), end: sc.end }), `fxs${e.kind}`)} suffix="s" />
                <Slider label="To" value={sc.end} min={0} max={len} step={0.05} onChange={(v) => setFx(i, (x) => void (x.scope = { kind: 'range', start: sc.start, end: Math.max(v, sc.start + 0.1) }), `fxe${e.kind}`)} suffix="s" />
                <div className="row wrap">
                  <button className="btn sm ghost" onClick={() => setFx(i, (x) => void (x.scope = { kind: 'range', start: time, end: Math.max(time + 0.5, sc.end) }))}>Start at playhead</button>
                  <button className="btn sm ghost" onClick={() => setFx(i, (x) => void (x.scope = { kind: 'range', start: Math.min(sc.start, time - 0.5), end: time }))}>End at playhead</button>
                  <button className="btn sm ghost" onClick={() => useEditor.getState().seek(sc.start)}>Jump to</button>
                </div>
              </>
            )}
            {sc.kind === 'clips' && (
              <div className="row wrap">
                <span className="hint">{sc.ids.length} clip{sc.ids.length === 1 ? '' : 's'}</span>
                <button className="btn sm ghost" disabled={!selected.length} onClick={() => setFx(i, (x) => void (x.scope = { kind: 'clips', ids: selected }))}>Use selected clips ({selected.length})</button>
              </div>
            )}
            {sc.kind !== 'all' && (
              <div className="row">
                <Slider label="Fade in" value={e.fadeIn ?? 0} min={0} max={3} step={0.1} onChange={(v) => setFx(i, (x) => void (x.fadeIn = v), `fxfi${e.kind}`)} suffix="s" />
                <Slider label="Fade out" value={e.fadeOut ?? 0} min={0} max={3} step={0.1} onChange={(v) => setFx(i, (x) => void (x.fadeOut = v), `fxfo${e.kind}`)} suffix="s" />
              </div>
            )}
          </div>
        );
      })}
      {p.effects.length > 0 && <button className="btn sm ghost" onClick={() => update((d) => void (d.effects = []))}>Clear all</button>}
    </Section>
  );
}

/** Whole-video colour grade (looks, light, colour, LUTs). Clips can add their own grade in Properties. */
function ColorPanel() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const preview = p.clips.find((c) => !c.fill && p.assets.find((a) => a.id === c.assetId)?.kind === 'image')?.assetId;
  return <GradeEditor value={p.color} scope="project" previewAssetId={preview} onChange={(fn, key) => update((d) => fn(d.color), key)} />;
}
