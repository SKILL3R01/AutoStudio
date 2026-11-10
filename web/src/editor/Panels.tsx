import { detachAudio } from './edit';
import { isDepthMotion } from '../render/motion';
import { DEPTH_MOTIONS } from '../types';
import { DepthAll } from './DepthAll';
import { fmtTime } from '../lib/util';
import { toast } from '../components/Toast';
import { convertVoiceTracksToTakes, ensureTrack, narrationClips, narrationEnd, narrationTrack, newAudioClip, voiceStartOf } from '../lib/audiotracks';
import { addVoiceTake, placeAudio } from '../lib/project';
import { useEffect, useState } from 'react';
import { useEditor, findAsset, projectLength } from '../store';
import { useClipTarget, useProject } from './hooks';
import { MOTIONS, TRANSITIONS, EFFECTS, type Motion, type Transition, type Overlay, type EffectKind, type EffectLayer } from '../types';
import { FilePick, Section, Seg, Select, Slider, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { CaptionsPanel } from './CaptionsPanel';
import { KeywordsPanel } from './KeywordsPanel';
import { MediaPanel } from './MediaPanel';
import { VoicePanel } from '../voice/VoicePanel';
import { useUi } from '../lib/uimode';
import { EffectsLab } from './EffectsLab';
import { MotionTile } from './MotionGallery';
import { AiPanel } from './AiPanel';
import { SilenceDialog } from './SilenceDialog';
import { GradeEditor } from './GradeEditor';
import { EFFECT_COST, EFFECT_LABELS } from '../render/effects';
import { SFX, sfxBuffer } from '../audio/sfx';
import { blankClip, probe, setVoiceStart } from '../lib/project';
import { uid } from '../lib/util';

export const TABS = [
  ['media', 'Media', 'media'], ['motion', 'Motion', 'motion'], ['transitions', 'Transitions', 'transition'], ['captions', 'Captions', 'captions'],
  ['keywords', 'Typography', 'keywords'], ['text', 'Text', 'text'], ['voice', 'Voice', 'mic'], ['music', 'Audio', 'music'], ['sfx', 'SFX', 'sfx'], ['effects', 'Effects', 'effects'], ['color', 'Colour', 'image'], ['ai', 'AI', 'wand'],
] as const;
export type Tab = (typeof TABS)[number][0];

/** Simple mode: five areas instead of twelve panels. */
const GROUPS: { id: string; name: string; icon: string; hint: string; tabs: Tab[] }[] = [
  { id: 'media', name: 'Media', icon: 'media', hint: 'Your images, video and audio', tabs: ['media'] },
  { id: 'voice', name: 'Voice', icon: 'mic', hint: 'Voiceover, music and sound effects', tabs: ['voice', 'music', 'sfx'] },
  { id: 'text', name: 'Text', icon: 'captions', hint: 'Captions, typography and titles', tabs: ['captions', 'keywords', 'text'] },
  { id: 'style', name: 'Style', icon: 'effects', hint: 'Motion, transitions, colour and effects', tabs: ['motion', 'transitions', 'color', 'effects'] },
  { id: 'ai', name: 'AI', icon: 'wand', hint: 'AI assistant, depth maps and prompts', tabs: ['ai'] },
];
const lastInGroup = new Map<string, Tab>();

export const MOTION_LABELS: Record<Motion, string> = {
  none: 'None', zoomIn: 'Zoom in', zoomOut: 'Zoom out', panLeft: 'Pan left', panRight: 'Pan right', tiltUp: 'Tilt up',
  tiltDown: 'Tilt down', diagonal: 'Diagonal', drift: 'Drift', breathe: 'Breathe', alternate: 'Alternate zoom', random: 'Random mix', custom: 'Custom framing',
  parallaxZoom: '3D push-in', parallaxOrbit: '3D orbit', dollyZoom: '3D dolly zoom',
  parallaxPanLeft: '3D pan left', parallaxPanRight: '3D pan right', parallaxTiltUp: '3D tilt up', parallaxTiltDown: '3D tilt down',
  parallaxPullOut: '3D pull-out', parallaxSwing: '3D swing', parallaxFloat: '3D float', parallaxCrane: '3D crane up',
};

export const TRANSITION_LABELS: Record<Transition, string> = {
  none: 'Cut', crossfade: 'Crossfade', fadeBlack: 'Fade black', fadeWhite: 'Fade white', flash: 'Flash', slideLeft: 'Slide ←', slideRight: 'Slide →',
  slideUp: 'Slide ↑', slideDown: 'Slide ↓', zoomPunch: 'Zoom punch', wipe: 'Wipe', blur: 'Blur', glitch: 'Glitch', circle: 'Circle', random: 'Random',
};

export function Sidebar() {
  const [tab, setTab] = useState<Tab>('motion');
  const mode = useUi((u) => u.mode);
  useEffect(() => {
    const h = (e: Event) => setTab((e as CustomEvent<Tab>).detail);
    window.addEventListener('autostudio:tab', h);
    return () => window.removeEventListener('autostudio:tab', h);
  }, []);
  const label = TABS.find((t) => t[0] === tab)![1];
  const group = GROUPS.find((g) => g.tabs.includes(tab))!;
  return (
    <>
      <nav className={`rail ${mode}`}>
        {mode === 'pro'
          ? TABS.map(([id, name, icon]) => (
              <button key={id} className={id === tab ? 'on' : ''} onClick={() => setTab(id)} title={name}>
                <Icon name={icon} size={18} />
                <span>{name}</span>
              </button>
            ))
          : GROUPS.map((g) => (
              <button key={g.id} className={g === group ? 'on' : ''} onClick={() => setTab(lastInGroup.get(g.id) ?? g.tabs[0])} title={g.hint}>
                <Icon name={g.icon} size={20} />
                <span>{g.name}</span>
              </button>
            ))}
      </nav>
      <aside className="panels">
        {mode === 'simple' && group.tabs.length > 1 ? (
          <div className="panel-tabs">
            {group.tabs.map((t) => (
              <button key={t} className={t === tab ? 'on' : ''} onClick={() => (lastInGroup.set(group.id, t), setTab(t))}>{TABS.find((x) => x[0] === t)![1]}</button>
            ))}
          </div>
        ) : (
          <div className="panel-title">{label}</div>
        )}
        <div className="panel-body">
          {tab === 'media' && <MediaPanel />}
          {tab === 'voice' && <VoicePanel />}
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
  const previewClip = (selectedId ? p.clips.find((c) => c.id === selectedId) : undefined) ?? p.clips.find((c) => !c.fill && p.assets.find((a) => a.id === c.assetId)?.kind === 'image');
  const previewAsset = previewClip && p.assets.find((a) => a.id === previewClip.assetId)?.kind === 'image' ? previewClip.assetId : undefined;
  return (
    <>
      <Section title="Camera movement">
        <TargetHint selected={selectedId} count={count} />
        <p className="hint">Hover a move to see it on {selectedId ? 'the selected clip' : 'your first image'}; click to apply.</p>
        <div className="motion-gallery">
          {MOTIONS.filter((m) => !isDepthMotion(m)).map((m) => (
            <MotionTile key={m} motion={m} label={MOTION_LABELS[m]} assetId={previewAsset} clip={previewClip} depth={p.motionDepth} on={cur === m} onClick={() => apply((c) => void (c.motion = m))} />
          ))}
        </div>
        <Slider label="Strength (all clips)" value={p.motionDepth} min={0} max={0.4} onChange={(v) => update((d) => void (d.motionDepth = v), 'depth')} fmt={(v) => (v < 0.08 ? 'subtle' : v > 0.25 ? 'strong' : 'medium') + ` · ${Math.round(v * 100)}%`} />
        <div className="row wrap">
          <button className="btn sm ghost" onClick={() => update((d) => d.clips.forEach((c, i) => void (!c.fill && (c.motion = (['zoomIn', 'panRight', 'zoomOut', 'panLeft', 'drift', 'tiltUp'] as Motion[])[i % 6]))))}>Vary per scene</button>
          <button className="btn sm ghost" onClick={() => update((d) => d.clips.forEach((c) => void (c.motion = 'none')))}>Remove all motion</button>
        </div>
      </Section>
      <Section title="3D depth motion" hint="Uses an AI depth map of each image (made in your browser) so the foreground moves against the background.">
        <div className="motion-gallery">
          {DEPTH_MOTIONS.map((m) => (
            <MotionTile key={m} motion={m} label={MOTION_LABELS[m]} assetId={previewAsset} clip={previewClip} depth={p.motionDepth} on={cur === m} onClick={() => apply((c) => void (c.motion = m))} />
          ))}
        </div>
        <p className="hint">The tiles preview the camera path on a flat image; with a depth map the foreground moves against the background. Clips without one fall back to a zoom.</p>
        <DepthAll />
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
    d.audio = d.audio.filter((s) => !s.id.startsWith('auto_'));
    const tid = ensureTrack(d, 'sfx');
    d.clips.slice(1).forEach((c) => c.transition !== 'none' && d.audio.push(newAudioClip(tid, '', Math.max(0, c.start - 0.4), 1.2, 'sfx', { id: 'auto_' + uid(), sound: 'whoosh', volume: 0.5 })));
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
  const { update, selection, select, time } = useEditor();
  const len = projectLength(p);
  const add = async (files: File[]) => {
    for (const f of files) {
      const a = await probe(f, f.name, 'audio');
      update((d) => {
        d.assets.push(a);
        const c = placeAudio(d, a.id, 'music', 0, Math.min(a.duration ?? 10, Math.max(5, projectLength(d))));
        select({ kind: 'audio', id: c.id });
      });
    }
  };
  const loopFill = (id: string) => update((d) => {
    const m = d.audio.find((x) => x.id === id)!;
    const dur = findAsset(d, m.assetId)?.duration ?? m.duration;
    for (let t = m.start + dur; t < len; t += dur) d.audio.push({ ...m, id: uid(), start: t, duration: Math.min(dur, len - t), fadeIn: 0 });
  });
  const narr = narrationClips(p);
  const nt = narrationTrack(p);
  const [silenceOpen, setSilenceOpen] = useState(false);
  const voiceTracks = p.audioTracks.filter((t) => t.kind === 'voice');
  const musicClips = p.audio.filter((c) => p.audioTracks.find((t) => t.id === c.trackId)?.kind === 'music');
  return (
    <>
      {silenceOpen && <SilenceDialog onClose={() => setSilenceOpen(false)} />}
      <Section title="Start & end" hint="The video ends at the last item on any track. Add an intro before the narration, a black outro, or hold the last image longer.">
        {narr.length > 0 && <Slider label="Intro (narration starts at)" value={voiceStartOf(p)} min={0} max={20} step={0.1} onChange={(v) => update((d) => setVoiceStart(d, v), 'intro')} suffix="s" />}
        <div className="row wrap">
          <button className="btn sm" disabled={!p.clips.length} onClick={() => update((d) => {
            const end = Math.max(d.length, projectLength(d));
            d.clips.push(blankClip(end));
            d.length = end + 3;
          })}><Icon name="plus" /> Add 3 s black outro</button>
          <button className="btn sm" disabled={!p.clips.length} onClick={() => update((d) => void (d.length = Math.max(d.length, projectLength(d)) + 3))}><Icon name="plus" /> Hold last image +3 s</button>
          {p.clips.length > 0 && narr.length > 0 && <button className="btn sm ghost" onClick={() => update((d) => void (d.length = narrationEnd(d)))}>End visuals with the narration</button>}
        </div>
        <Slider label="Audio fade in" value={p.audioFade.in} min={0} max={5} step={0.1} onChange={(v) => update((d) => void (d.audioFade.in = v), 'afi')} suffix="s" />
        <Slider label="Audio fade out" value={p.audioFade.out} min={0} max={10} step={0.1} onChange={(v) => update((d) => void (d.audioFade.out = v), 'afo')} suffix="s" />
        <Slider label="Video fade in" value={p.sceneFades.fadeIn} min={0} max={3} onChange={(v) => update((d) => void (d.sceneFades.fadeIn = v), 'fi')} suffix="s" />
        <Slider label="Video fade out" value={p.sceneFades.fadeOut} min={0} max={5} onChange={(v) => update((d) => void (d.sceneFades.fadeOut = v), 'fo')} suffix="s" />
      </Section>
      <Section title="Voice" hint="Every recording or AI voice is kept. The ★ narration track drives captions and music ducking.">
        {voiceTracks.length > 1 && (
          <Select label="★ Narration track" value={p.narrationTrackId} options={voiceTracks.map((t) => [t.id, `${t.name}${t.muted ? ' (muted)' : ''}`] as [string, string])} onChange={(v) => update((d) => {
            d.narrationTrackId = v;
            const t = d.audioTracks.find((x) => x.id === v);
            if (t) t.muted = false;
          })} />
        )}
        {narr.length ? (
          <>
            <button className="btn sm" onClick={() => setSilenceOpen(true)}><Icon name="scissors" /> Remove silences…</button>
            {narr.map((c) => (
              <button key={c.id} className={`list-item ${selection?.id === c.id ? 'on' : ''}`} onClick={() => (select({ kind: 'audio', id: c.id }), useEditor.getState().seek(c.start))}>
                <Icon name="mic" /> {findAsset(p, c.assetId)?.name} <span className="hint">{fmtTime(c.start)} · {c.duration.toFixed(1)} s</span>
              </button>
            ))}
            {nt && <Slider label="Narration volume" value={nt.volume} min={0} max={2} onChange={(v) => update((d) => void (d.audioTracks.find((t) => t.id === nt.id)!.volume = v), 'vov')} fmt={(v) => `${Math.round(v * 100)}%`} />}
          </>
        ) : <p className="hint">No narration yet — record or generate one in Voice, or add a file.</p>}
        {voiceTracks.length > 1 && (
          <button className="btn sm ghost" title="Clips on extra voice tracks that overlap the narration become switchable takes" onClick={() => {
            let n = 0;
            update((d) => void (n = convertVoiceTracksToTakes(d)));
            toast(n ? `${n} clip${n > 1 ? 's' : ''} became takes of the narration — switch them in Properties` : 'No overlapping voice clips to convert', n ? 'ok' : 'info');
          }}><Icon name="layers" /> Turn extra voice tracks into takes</button>
        )}
        <FilePick accept="audio/*" className="btn sm" onFiles={async ([f]) => {
          if (!f) return;
          const a = await probe(f, f.name, 'audio');
          let info: ReturnType<typeof addVoiceTake> | undefined;
          update((d) => void ((d.assets.push(a)), (info = addVoiceTake(d, a.id, a.duration ?? 0, narrationClips(d).length ? 0 : time))));
          if (info?.take) toast(`Added as ${info.take} of the narration — switch takes in Properties`, 'ok');
          else if (info?.replacedName) toast(`Added on “${info.trackName}”. Your previous voice is kept on “${info.replacedName}” (muted).`, 'ok');
        }}><Icon name="upload" /> Add a voice file</FilePick>
      </Section>
      <VideosWithSound />
      <Section title="Music & audio beds" hint="Drag clips on the timeline to time them, cut with S, drag the volume line; ducking lowers music under the narration.">
        <FilePick accept="audio/*" multiple onFiles={add} className="btn sm"><Icon name="upload" /> Add music</FilePick>
        {musicClips.map((m) => (
          <button key={m.id} className={`list-item ${selection?.id === m.id ? 'on' : ''}`} onClick={() => select({ kind: 'audio', id: m.id })}>
            <Icon name="music" /> {findAsset(p, m.assetId)?.name} <span className="hint">{Math.round(m.volume * 100)}%</span>
            <span className="grow" />
            <span className="link" onClick={(e) => (e.stopPropagation(), loopFill(m.id))}>Loop to fill</span>
          </button>
        ))}
      </Section>
    </>
  );
}

/** Videos on the main track that still carry their own sound — separate one or all onto linked audio tracks. */
function VideosWithSound() {
  const p = useProject();
  const { update, select } = useEditor();
  const [auto, setAuto] = useState(() => localStorage.getItem('autoSeparate') === '1');
  const vids = p.clips.filter((c) => c.volume > 0 && p.assets.find((a) => a.id === c.assetId)?.kind === 'video');
  const linked = p.audio.filter((a) => a.linkClipId).length;
  const sep = (ids: string[]) => {
    let last = '';
    update((d) => ids.forEach((id) => void (last = detachAudio(d, id, true) ?? last)));
    if (last) select({ kind: 'audio', id: last });
    toast(`Separated ${ids.length} video sound${ids.length > 1 ? 's' : ''} — linked to their clips (Unlink in Properties)`, 'ok');
  };
  return (
    <Section title={`Videos with sound (${vids.length})`} hint="Separate the sound onto its own track to cut it, clean it, remove music or change the voice.">
      {vids.length ? (
        <>
          <div className="list">
            {vids.map((c) => (
              <div key={c.id} className="list-item sfx-row">
                <Icon name="film" /> <span>{findAsset(p, c.assetId)?.name}</span>
                <span className="grow" />
                <button className="btn sm" onClick={() => sep([c.id])}><Icon name="unlink" /> Separate</button>
              </div>
            ))}
          </div>
          {vids.length > 1 && <button className="btn sm" onClick={() => sep(vids.map((c) => c.id))}>Separate all</button>}
        </>
      ) : <p className="hint">{linked ? `${linked} video sound${linked > 1 ? 's are' : ' is'} already separated.` : 'No videos with sound on the main track.'}</p>}
      <Toggle label="Separate sound automatically when adding videos" value={auto} onChange={(v) => (setAuto(v), localStorage.setItem('autoSeparate', v ? '1' : '0'))} />
    </Section>
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
  const add = async (sound: string) => {
    const dur = (await sfxBuffer(sound))?.duration ?? 1.5;
    let id = '';
    update((d) => {
      const c = newAudioClip(ensureTrack(d, 'sfx'), '', time, dur, 'sfx', { sound, volume: vol });
      d.audio.push(c);
      id = c.id;
    });
    select({ kind: 'audio', id });
  };
  const placed = p.audio.filter((c) => p.audioTracks.find((t) => t.id === c.trackId)?.kind === 'sfx').sort((a, b) => a.start - b.start);
  return (
    <>
      <Section title="Sound effects" hint="▶ to listen, + to drop at the playhead. Drag them on the SFX track to retime.">
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
          update((d) => (d.assets.push(a), void placeAudio(d, a.id, 'sfx', time, a.duration ?? 1.5)));
        }}><Icon name="upload" /> Upload your own sound</FilePick>
      </Section>
      <Section title={`Placed (${placed.length})`}>
        <div className="list">
          {placed.map((s) => (
            <div key={s.id} className="list-item sfx-row" onClick={() => (select({ kind: 'audio', id: s.id }), useEditor.getState().seek(s.start))}>
              <span>{s.sound ?? findAsset(p, s.assetId)?.name}</span>
              <span className="hint">{s.start.toFixed(2)}s</span>
              <input type="range" min={0} max={1.5} step={0.01} value={s.volume} onChange={(e) => update((d) => void (d.audio.find((x) => x.id === s.id)!.volume = +e.target.value), `sv${s.id}`)} />
              <button className="icon-btn" onClick={(e) => (e.stopPropagation(), update((d) => void (d.audio = d.audio.filter((x) => x.id !== s.id))))}><Icon name="x" /></button>
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
    <>
    <Section title="Effects" hint="Stack as many as you like. Each can cover the whole video, a time range or chosen clips.">
      <div className="grid3">
        {EFFECTS.filter((e) => e !== 'none' && e !== 'custom').map((k) => (
          <button key={k} className={`tile fx fx-${k} ${p.effects.some((e) => e.kind === k) ? 'on' : ''}`} onClick={() => toggle(k)} title={`${EFFECT_COST[k]} to render`}><i />{EFFECT_LABELS[k]}{EFFECT_COST[k] === 'heavy' && <em className="cost">heavy</em>}</button>
        ))}
      </div>
      {p.effects.map((e, i) => {
        const sc = e.scope ?? { kind: 'all' as const };
        return (
          <div key={e.customId ?? e.kind} className="card">
            <div className="row between"><b>{e.kind === 'custom' ? p.customEffects?.find((c) => c.id === e.customId)?.name ?? 'Custom' : EFFECT_LABELS[e.kind]}</b><button className="icon-btn" onClick={() => update((d) => void d.effects.splice(i, 1))}><Icon name="x" /></button></div>
            <Slider label="Intensity" value={e.intensity} min={0} max={1} onChange={(v) => setFx(i, (x) => void (x.intensity = v), `fx${e.kind}`)} fmt={(v) => `${Math.round(v * 100)}%`} />
            {(e.kind === 'custom' && p.customEffects?.find((c) => c.id === e.customId)?.kind === 'shader' || e.kind === 'glowPulse') && [0, 1, 2, 3].slice(0, e.kind === 'glowPulse' ? 1 : 4).map((k) => (
              <Slider key={k} label={e.kind === 'glowPulse' ? 'Pulse speed' : p.customEffects?.find((c) => c.id === e.customId)?.paramNames?.[k] ?? `Param ${k + 1}`} value={e.params?.[k] ?? 0.5} min={0} max={1} onChange={(v) => setFx(i, (x) => void (x.params = Object.assign([0.5, 0.5, 0.5, 0.5], x.params, { [k]: v })), `fxp${k}`)} />
            ))}
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
    <EffectsLab />
    </>
  );
}

/** Whole-video colour grade (looks, light, colour, LUTs). Clips can add their own grade in Properties. */
function ColorPanel() {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const preview = p.clips.find((c) => !c.fill && p.assets.find((a) => a.id === c.assetId)?.kind === 'image')?.assetId;
  return <GradeEditor value={p.color} scope="project" previewAssetId={preview} onChange={(fn, key) => update((d) => fn(d.color), key)} />;
}
