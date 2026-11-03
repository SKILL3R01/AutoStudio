import { useState } from 'react';
import { useEditor, clipEnd, findAsset, projectLength } from '../store';
import { useProject, useThumb } from './hooks';
import { FilePick, Section, Select, Slider, LogBox, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { MOTIONS, TRANSITIONS, REGION_EFFECTS, TYPO_TEMPLATES, TYPO_ENTERS, TYPO_EXITS, type TypoEnter, type TypoExit, type Framing, type MotionEasing, type Overlay, type Region, type MusicItem, type SfxItem, type TypoBlock, type TypoBg, type TypoRole, type TypoTemplate } from '../types';
import { FONT_PAIRS, TEMPLATE_LABELS, TYPO_PALETTES } from '../lib/typography';
import { MOTION_LABELS, TRANSITION_LABELS } from './Panels';
import { fmtTime } from '../lib/util';
import { probe } from '../lib/project';
import { fetchResult, runJob, useEngine } from '../lib/engine';
import { media } from '../render/media';
import { splitAtPlayhead } from './Timeline';
import { deleteSelection } from './shortcuts';
import { CAPTION_FONTS } from '../render/captions';
import { makeDepthAsset } from '../ai/jobs';
import { confirmHeavyAi } from '../lib/perf';
import { RegionDialog } from './RegionDialog';
import { useVision } from '../ai/vision';

function ClipInspector({ id }: { id: string }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const engine = useEngine((s) => s.status);
  const vision = useVision();
  const [log, setLog] = useState<string[]>([]);
  const [regionOpen, setRegionOpen] = useState(false);
  const [depthBusy, setDepthBusy] = useState(false);
  const i = p.clips.findIndex((c) => c.id === id);
  const clip = p.clips[i];
  const asset = clip && findAsset(p, clip.assetId);
  const thumb = useThumb(asset?.id, asset?.kind);
  const depthThumb = useThumb(clip?.depthId, clip?.depthId ? 'image' : undefined);
  if (clip?.fill) {
    return (
      <Section title={`Blank section · clip ${i + 1} of ${p.clips.length}`}>
        <p className="hint">{fmtTime(i === 0 ? 0 : clip.start)} → {fmtTime(clipEnd(p, i))} · a solid colour with no media (outros, pauses, title cards).</p>
        <label className="field"><span>Colour</span><input type="color" value={clip.fill} onChange={(e) => update((d) => void (d.clips.find((c) => c.id === id)!.fill = e.target.value), `fill${id}`)} /></label>
        {i > 0 && <Slider label="Starts at" value={clip.start} min={i > 1 ? p.clips[i - 1].start + 0.1 : 0.1} max={clipEnd(p, i) - 0.1} step={0.01} onChange={(v) => update((d) => void (d.clips.find((c) => c.id === id)!.start = v), `start${id}`)} suffix="s" />}
        <Select label="Transition in" value={clip.transition} options={TRANSITIONS.map((m) => [m, TRANSITION_LABELS[m]] as [typeof m, string])} onChange={(v) => update((d) => void (d.clips.find((c) => c.id === id)!.transition = v))} />
        <p className="hint">Tip: add text in the Text panel to turn it into a title or end card.</p>
        <button className="btn sm ghost danger" onClick={deleteSelection}><Icon name="trash" /> Delete</button>
      </Section>
    );
  }
  if (!clip || !asset) return null;
  const set = (fn: (c: typeof clip) => void, k?: string) => update((d) => fn(d.clips.find((c) => c.id === id)!), k && `${k}${id}`);
  const setRegion = (rid: string, fn: (r: Region) => void, k?: string) => set((c) => fn(c.regions!.find((r) => r.id === rid)!), k && `${k}${rid}`);
  const color = clip.color ?? { brightness: 1, contrast: 1, saturation: 1 };
  const start = i === 0 ? 0 : clip.start;
  const replace = async ([f]: File[]) => {
    if (!f) return;
    const a = await probe(f, f.name, f.type.startsWith('video') ? 'video' : 'image');
    update((d) => {
      d.assets.push(a);
      Object.assign(d.clips.find((x) => x.id === id)!, { assetId: a.id, trimIn: 0, trimOut: undefined, depthId: undefined, regions: [] });
    });
  };
  const upscale = async () => {
    setLog(['Uploading…']);
    try {
      const blob = await media.blob(asset.id);
      const f = new FormData();
      f.append('file', blob!, asset.name);
      f.append('scale', '2');
      const job = await runJob(asset.kind === 'video' ? 'video_upscale' : 'upscale', f, (j) => setLog(j.logs));
      const out = await fetchResult(job.files[0].url);
      const a = await probe(out, job.files[0].name, asset.kind === 'video' ? 'video' : 'image');
      update((d) => (d.assets.push(a), void (d.clips.find((x) => x.id === id)!.assetId = a.id)));
      setLog((l) => [...l, '✓ Replaced with upscaled version']);
    } catch (e) {
      setLog((l) => [...l, `✗ ${(e as Error).message}`]);
    }
  };
  const depth = async () => {
    if (!confirmHeavyAi()) return;
    setDepthBusy(true);
    try {
      const d = await makeDepthAsset(clip, asset);
      if (d) update((pr) => (pr.assets.push(d), void (pr.clips.find((x) => x.id === id)!.depthId = d.id)));
      if (!clip.motion.startsWith('parallax') && clip.motion !== 'dollyZoom') set((c) => void (c.motion = 'parallaxZoom'));
    } catch (e) {
      toast(`Depth failed: ${(e as Error).message}`, 'error');
    } finally {
      setDepthBusy(false);
    }
  };
  return (
    <>
      <Section title={`Clip ${i + 1} of ${p.clips.length}`}>
        {thumb && <img className="inspect-thumb" src={thumb} alt="" />}
        <p className="hint">{asset.name} · {asset.width}×{asset.height} · {fmtTime(start)} → {fmtTime(clipEnd(p, i))}</p>
        {i > 0 && <Slider label="Starts at" value={clip.start} min={i > 1 ? p.clips[i - 1].start + 0.1 : 0.1} max={clipEnd(p, i) - 0.1} step={0.01} onChange={(v) => set((c) => void (c.start = v), 'start')} suffix="s" />}
        <Select label="Motion" value={clip.motion} options={MOTIONS.map((m) => [m, MOTION_LABELS[m]] as [typeof m, string])} onChange={(v) => set((c) => void (c.motion = v))} />
        {clip.motion !== 'none' && (
          <>
            {clip.motion !== 'custom' && <Slider label="Strength" value={clip.motionDepth ?? p.motionDepth} min={0} max={0.5} onChange={(v) => set((c) => void (c.motionDepth = v), 'mdepth')} fmt={(v) => `${Math.round(v * 100)}%`} />}
            <div className="row">
              <Select label="Easing" value={clip.motionEasing ?? 'easeInOut'} options={[['easeInOut', 'Smooth'], ['linear', 'Linear'], ['easeIn', 'Speed up'], ['easeOut', 'Slow down']] as [MotionEasing, string][]} onChange={(v) => set((c) => void (c.motionEasing = v))} />
              <Toggle label="Reverse" value={!!clip.motionReverse} onChange={(v) => set((c) => void (c.motionReverse = v))} />
            </div>
          </>
        )}
        {clip.motion === 'custom' && (() => {
          const mc = clip.motionCustom ?? { from: { scale: 1, x: 0, y: 0 }, to: { scale: 1.15, x: 0, y: 0 } };
          const setF = (end: 'from' | 'to', key: keyof Framing, v: number) => set((c) => void (c.motionCustom = { ...mc, [end]: { ...mc[end], [key]: v } }), `mc${end}${key}`);
          return (
            <div className="card">
              <b>Custom framing</b>
              {(['from', 'to'] as const).map((end) => (
                <div key={end}>
                  <span className="hint">{end === 'from' ? 'Start of clip' : 'End of clip'}</span>
                  <Slider label="Zoom" value={mc[end].scale} min={1} max={2.5} onChange={(v) => setF(end, 'scale', v)} fmt={(v) => `${v.toFixed(2)}×`} />
                  <Slider label="Left ↔ right" value={mc[end].x} min={-0.5} max={0.5} onChange={(v) => setF(end, 'x', v)} />
                  <Slider label="Up ↕ down" value={mc[end].y} min={-0.5} max={0.5} onChange={(v) => setF(end, 'y', v)} />
                </div>
              ))}
              <div className="row wrap">
                <button className="btn sm ghost" onClick={() => set((c) => void (c.motionCustom = { from: mc.to, to: mc.from }))}>Swap start/end</button>
                <button className="btn sm ghost" onClick={() => useEditor.getState().seek(i === 0 ? 0 : clip.start)}>Preview from start</button>
              </div>
              <p className="hint">Tip: keep zoom above the pan amount so no black edges appear.</p>
            </div>
          );
        })()}
        <Select label="Transition in" value={clip.transition} options={TRANSITIONS.map((m) => [m, TRANSITION_LABELS[m]] as [typeof m, string])} onChange={(v) => set((c) => void (c.transition = v))} />
        <Select label="Fit" value={clip.fit} options={[['cover', 'Fill frame (crop)'], ['contain', 'Fit whole image']]} onChange={(v) => set((c) => void (c.fit = v))} />
      </Section>
      {asset.kind === 'video' && (
        <Section title="Video">
          <Slider label="Trim in" value={clip.trimIn} min={0} max={Math.max(0, (clip.trimOut ?? asset.duration ?? 0) - 0.1)} step={0.01} onChange={(v) => set((c) => void (c.trimIn = v), 'trim')} suffix="s" />
          <Slider label="Trim out" value={clip.trimOut ?? asset.duration ?? 0} min={clip.trimIn + 0.1} max={asset.duration ?? 1} step={0.01} onChange={(v) => set((c) => void (c.trimOut = v), 'trimo')} suffix="s" />
          <Toggle label="Loop the trimmed range (otherwise hold the last frame)" value={!!clip.loop} onChange={(v) => set((c) => void (c.loop = v))} />
          <Slider label="Clip sound" value={clip.volume} min={0} max={1.5} onChange={(v) => set((c) => void (c.volume = v), 'cvol')} fmt={(v) => `${Math.round(v * 100)}%`} />
          <p className="hint">The clip's own sound is mixed under the narration; motion (zoom/pan) applies to videos too.</p>
        </Section>
      )}
      <Section title="Depth & animated details" hint="Make the image come alive: 3D depth motion, and effects on a part of the image you click.">
        <div className="row">
          {depthThumb && <img className="depth-thumb" src={depthThumb} alt="depth" />}
          <button className="btn sm" disabled={depthBusy} onClick={depth}><Icon name="depth" /> {depthBusy ? (vision.label ? `${vision.label} ${Math.round(vision.value * 100)}%` : 'Estimating…') : clip.depthId ? 'Redo depth map' : 'Generate depth map'}</button>
        </div>
        <button className="btn sm primary" onClick={() => confirmHeavyAi() && setRegionOpen(true)}><Icon name="cursor" /> Animate a detail…</button>
        {(clip.regions ?? []).map((r) => (
          <div key={r.id} className="card">
            <div className="row between"><b>{r.name}</b><button className="icon-btn" onClick={() => set((c) => void (c.regions = c.regions!.filter((x) => x.id !== r.id)))}><Icon name="trash" /></button></div>
            <div className="row">
              <Select label="Effect" value={r.effect} options={REGION_EFFECTS} onChange={(v) => setRegion(r.id, (x) => void (x.effect = v))} />
              <Select label="When" value={r.trigger} options={[['loop', 'Always'], ['beats', 'On music beats'], ['keywords', 'On keywords']]} onChange={(v) => setRegion(r.id, (x) => void (x.trigger = v))} />
            </div>
            <Slider label="Intensity" value={r.intensity} min={0} max={1.5} onChange={(v) => setRegion(r.id, (x) => void (x.intensity = v), 'ri')} />
            <Slider label="Speed" value={r.speed} min={0.1} max={3} onChange={(v) => setRegion(r.id, (x) => void (x.speed = v), 'rs')} />
            {(r.effect === 'shimmer' || r.effect === 'sparkle') && <label className="field"><span>Colour</span><input type="color" value={r.color} onChange={(e) => setRegion(r.id, (x) => void (x.color = e.target.value), 'rc')} /></label>}
          </div>
        ))}
      </Section>
      <Section title="Colour (this clip)">
        <Slider label="Brightness" value={color.brightness} min={0.5} max={1.5} onChange={(v) => set((c) => void (c.color = { ...color, brightness: v }), 'cb')} />
        <Slider label="Contrast" value={color.contrast} min={0.5} max={1.6} onChange={(v) => set((c) => void (c.color = { ...color, contrast: v }), 'cc')} />
        <Slider label="Saturation" value={color.saturation} min={0} max={2} onChange={(v) => set((c) => void (c.color = { ...color, saturation: v }), 'cs')} />
      </Section>
      <Section title="Actions">
        <div className="row wrap">
          <FilePick accept="image/*,video/*" onFiles={replace} className="btn sm">Replace…</FilePick>
          <button className="btn sm" onClick={splitAtPlayhead}><Icon name="scissors" /> Split</button>
          <button className="btn sm" disabled={engine !== 'ready'} onClick={upscale} title="Real-ESRGAN ×2 on your Colab"><Icon name="upscale" /> Upscale ×2</button>
          <button className="btn sm ghost danger" onClick={deleteSelection}><Icon name="trash" /> Delete</button>
        </div>
        {log.length > 0 && <LogBox lines={log} />}
      </Section>
      {regionOpen && <RegionDialog clipId={id} onClose={() => setRegionOpen(false)} />}
    </>
  );
}

function OverlayInspector({ id }: { id: string }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const o = p.overlays.find((x) => x.id === id);
  if (!o) return null;
  const set = (fn: (o: Overlay) => void, key?: string) => update((d) => fn(d.overlays.find((x) => x.id === id)!), key && `${key}-${id}`);
  return (
    <Section title={o.assetId ? 'Image overlay' : 'Text overlay'}>
      {!o.assetId && <textarea value={o.text} rows={2} onChange={(e) => set((x) => void (x.text = e.target.value), 'text')} />}
      {!o.assetId && (
        <>
          <div className="row">
            <Select label="Font" value={o.font} options={CAPTION_FONTS} onChange={(v) => set((x) => void (x.font = v))} />
            <Select label="Weight" value={o.weight} options={[400, 600, 800, 900]} onChange={(v) => set((x) => void (x.weight = v))} />
          </div>
          <div className="row">
            <label className="field"><span>Colour</span><input type="color" value={o.color} onChange={(e) => set((x) => void (x.color = e.target.value), 'color')} /></label>
            <Select label="Background" value={o.background} options={[['transparent', 'None'], ['rgba(0,0,0,0.6)', 'Dark box'], ['rgba(255,255,255,0.85)', 'Light box'], ['#ffd400', 'Yellow'], ['#ff2d55', 'Red']]} onChange={(v) => set((x) => void (x.background = v))} />
          </div>
        </>
      )}
      <Slider label="Size" value={o.size} min={0.05} max={o.assetId ? 1 : 3} onChange={(v) => set((x) => void (x.size = v), 'size')} />
      <Slider label="X" value={o.x} min={0} max={1} onChange={(v) => set((x) => void (x.x = v), 'x')} />
      <Slider label="Y" value={o.y} min={0} max={1} onChange={(v) => set((x) => void (x.y = v), 'y')} />
      <Slider label="Rotate" value={o.rotate} min={-180} max={180} step={1} onChange={(v) => set((x) => void (x.rotate = v), 'rot')} suffix="°" />
      <Slider label="Blur" value={o.blur} min={0} max={20} step={0.5} onChange={(v) => set((x) => void (x.blur = v), 'blur')} />
      <Slider label="Opacity" value={o.opacity} min={0} max={1} onChange={(v) => set((x) => void (x.opacity = v), 'op')} />
      <Slider label="Fade in" value={o.fadeIn} min={0} max={3} onChange={(v) => set((x) => void (x.fadeIn = v), 'ofi')} suffix="s" />
      <Slider label="Fade out" value={o.fadeOut} min={0} max={3} onChange={(v) => set((x) => void (x.fadeOut = v), 'ofo')} suffix="s" />
      <Slider label="Start" value={o.start} min={0} max={projectLength(p)} step={0.1} onChange={(v) => set((x) => void (x.start = v), 'os')} suffix="s" />
      <Slider label="Duration" value={o.duration} min={0.2} max={Math.max(10, projectLength(p))} step={0.1} onChange={(v) => set((x) => void (x.duration = v), 'od')} suffix="s" />
      <Toggle label="Drop shadow" value={o.shadow} onChange={(v) => set((x) => void (x.shadow = v))} />
      <button className="btn sm ghost danger" onClick={deleteSelection}><Icon name="trash" /> Delete</button>
    </Section>
  );
}

const ROLE_LABELS: [TypoRole, string][] = [['main', 'Main (big caps)'], ['minor', 'Small caps'], ['script', 'Script accent'], ['side', 'Vertical side'], ['accent', 'Accent']];

const ENTER_LABELS: Record<TypoEnter, string> = {
  auto: 'By role (template)', pop: 'Pop', slam: 'Slam', slide: 'Slide in', drop: 'Drop', zoom: 'Zoom', fade: 'Fade', draw: 'Hand-drawn reveal', typewriter: 'Typewriter',
};
const EXIT_LABELS: Record<TypoExit, string> = { auto: 'Fade & grow', fade: 'Fade', zoomOut: 'Zoom out', slideOut: 'Slide up', none: 'Cut' };

function KeywordInspector({ id }: { id: string }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const b = p.typo.find((x) => x.id === id);
  if (!b) return null;
  const set = (fn: (b: TypoBlock) => void, key?: string) => update((d) => {
    const it = d.typo.find((x) => x.id === id)!;
    fn(it);
    it.locked = true;
  }, key && `${key}-${id}`);
  const pal = TYPO_PALETTES[b.palette] ?? TYPO_PALETTES['mono-yellow'];
  return (
    <>
      <Section title="Typography block">
        <Select label="Template" value={b.template} options={TYPO_TEMPLATES.filter((t) => t !== 'random').map((t) => [t, TEMPLATE_LABELS[t]] as [Exclude<TypoTemplate, 'random'>, string])} onChange={(v) => set((x) => void (x.template = v))} />
        <div className="row">
          <Select label="Font pair" value={b.fontPair} options={Object.entries(FONT_PAIRS).map(([k, v]) => [k, v.name] as [string, string])} onChange={(v) => set((x) => void (x.fontPair = v))} />
          <Select label="Colours" value={b.palette} options={Object.entries(TYPO_PALETTES).map(([k, v]) => [k, v.name] as [string, string])} onChange={(v) => set((x) => void (x.palette = v))} />
        </div>
        <Select label="Background" value={b.bg} options={[['none', 'None'], ['shadow', 'Shadow'], ['card', 'Colour card'], ['frame', 'Full frame']] as [TypoBg, string][]} onChange={(v) => set((x) => void (x.bg = v))} />
        <Slider label="Size" value={b.scale} min={0.3} max={2.5} onChange={(v) => set((x) => void (x.scale = v), 'ts')} />
        <Slider label="Rotate" value={b.rotate} min={-30} max={30} step={1} onChange={(v) => set((x) => void (x.rotate = v), 'tr')} suffix="°" />
        <Slider label="X" value={b.x} min={0} max={1} onChange={(v) => set((x) => void (x.x = v), 'tx')} />
        <Slider label="Y" value={b.y} min={0} max={1} onChange={(v) => set((x) => void (x.y = v), 'ty')} />
        <Slider label="Until" value={b.end} min={b.words[b.words.length - 1].end} max={projectLength(p)} step={0.05} onChange={(v) => set((x) => void (x.end = v), 'te')} suffix="s" />
      </Section>
      <Section title="Animation" hint="How the words come in and how the block leaves.">
        <div className="row">
          <Select label="Entrance" value={b.enter ?? 'auto'} options={TYPO_ENTERS.map((k) => [k, ENTER_LABELS[k]] as [TypoEnter, string])} onChange={(v) => set((x) => void (x.enter = v))} />
          <Select label="Exit" value={b.exit ?? 'auto'} options={TYPO_EXITS.map((k) => [k, EXIT_LABELS[k]] as [TypoExit, string])} onChange={(v) => set((x) => void (x.exit = v))} />
        </div>
        <Slider label="Speed" value={b.speed ?? 1} min={0.5} max={2} step={0.05} onChange={(v) => set((x) => void (x.speed = v), 'tsp')} fmt={(v) => `${v.toFixed(2)}×`} />
        <Slider label="Word rhythm" value={b.stagger ?? 0} min={0} max={0.8} step={0.02} onChange={(v) => set((x) => void (x.stagger = v || undefined), 'tst')} fmt={(v) => (v ? `${v.toFixed(2)} s` : 'when spoken')} />
        <div className="row wrap">
          <button className="btn sm" onClick={() => (useEditor.getState().seek(Math.max(0, b.start - 0.3)), useEditor.getState().setPlaying(true))}><Icon name="play" /> Preview block</button>
          <button className="btn sm ghost" onClick={() => update((d) => d.typo.forEach((x) => Object.assign(x, { enter: b.enter, exit: b.exit, speed: b.speed, stagger: b.stagger })))}>Apply to all blocks</button>
        </div>
      </Section>
      <Section title="Words" hint="Each word appears when it is spoken. Change its role to change how it is drawn.">
        {b.words.map((w, k) => (
          <div key={k} className="card">
            <div className="row">
              <input value={w.text} onChange={(e) => set((x) => void (x.words[k].text = e.target.value), `tw${k}`)} />
              <input type="color" value={w.color ?? (w.role === 'script' || w.role === 'accent' ? pal.accent : pal.text)} onChange={(e) => set((x) => void (x.words[k].color = e.target.value), `tc${k}`)} style={{ width: 44 }} />
            </div>
            <div className="row">
              <Select label="Role" value={w.role} options={ROLE_LABELS} onChange={(v) => set((x) => void (x.words[k].role = v))} />
              <Select label="Animation" value={w.anim ?? ''} options={[['', 'Block default'], ...TYPO_ENTERS.map((e) => [e, ENTER_LABELS[e]] as [string, string])]} onChange={(v) => set((x) => void (x.words[k].anim = (v || undefined) as TypoEnter | undefined))} />
              <Select label="Font" value={w.font ?? ''} options={[['', 'From pair'], ...CAPTION_FONTS.map((f) => [f, f] as [string, string]), ...['League Spartan', 'Archivo Black', 'Oswald', 'Pacifico', 'Dancing Script', 'Caveat Brush', 'Lalezar'].map((f) => [f, f] as [string, string])]} onChange={(v) => set((x) => void (x.words[k].font = v || undefined))} />
            </div>
            <Slider label="Appears" value={w.start} min={Math.max(0, b.start - 2)} max={b.end} step={0.01} onChange={(v) => set((x) => {
              x.words[k].start = v;
              x.start = Math.min(...x.words.map((y) => y.start));
            }, `tws${k}`)} suffix="s" />
          </div>
        ))}
        <p className="hint">Drag the block on the preview to move it. Editing locks its look against 🎲 Shuffle.</p>
        <button className="btn sm ghost danger" onClick={deleteSelection}><Icon name="trash" /> Delete block</button>
      </Section>
    </>
  );
}

function MusicInspector({ id }: { id: string }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const m = p.music.find((x) => x.id === id);
  if (!m) return null;
  const set = (fn: (x: MusicItem) => void, k?: string) => update((d) => fn(d.music.find((x) => x.id === id)!), k && `${k}${id}`);
  return (
    <Section title={`Music · ${findAsset(p, m.assetId)?.name ?? ''}`}>
      <Slider label="Volume" value={m.volume} min={0} max={1.5} onChange={(v) => set((x) => void (x.volume = v), 'mv')} fmt={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="Start" value={m.start} min={0} max={projectLength(p)} step={0.1} onChange={(v) => set((x) => void (x.start = v), 'ms')} suffix="s" />
      <Slider label="Trim in" value={m.trimIn} min={0} max={Math.max(0, (findAsset(p, m.assetId)?.duration ?? 1) - 1)} step={0.1} onChange={(v) => set((x) => void (x.trimIn = v), 'mt')} suffix="s" />
      <Slider label="Fade in" value={m.fadeIn} min={0} max={5} onChange={(v) => set((x) => void (x.fadeIn = v), 'mfi')} suffix="s" />
      <Slider label="Fade out" value={m.fadeOut} min={0} max={8} onChange={(v) => set((x) => void (x.fadeOut = v), 'mfo')} suffix="s" />
      <Toggle label="Duck under voice (dips while someone speaks, rises in the pauses)" value={m.duck} onChange={(v) => set((x) => void (x.duck = v))} />
      {m.duck && (
        <>
          <Slider label="Duck level" value={m.duckDepth ?? 0.35} min={0} max={1} onChange={(v) => set((x) => void (x.duckDepth = v), 'mdd')} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Dip before" value={m.duckAttack ?? 0.25} min={0.05} max={1.5} step={0.05} onChange={(v) => set((x) => void (x.duckAttack = v), 'mda')} suffix="s" />
          <Slider label="Back up after" value={m.duckRelease ?? 0.4} min={0.05} max={3} step={0.05} onChange={(v) => set((x) => void (x.duckRelease = v), 'mdr')} suffix="s" />
          <p className="hint">Pauses are detected from the voiceover audio itself — press play to hear it.</p>
        </>
      )}
      <button className="btn sm ghost danger" onClick={deleteSelection}><Icon name="trash" /> Remove</button>
    </Section>
  );
}

function SfxInspector({ id }: { id: string }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const s = p.sfx.find((x) => x.id === id);
  if (!s) return null;
  const set = (fn: (x: SfxItem) => void, k?: string) => update((d) => fn(d.sfx.find((x) => x.id === id)!), k && `${k}${id}`);
  return (
    <Section title={`Sound · ${s.sound.startsWith('asset:') ? findAsset(p, s.sound.slice(6))?.name : s.sound}`}>
      <Slider label="Volume" value={s.volume} min={0} max={1.5} onChange={(v) => set((x) => void (x.volume = v), 'sv')} fmt={(v) => `${Math.round(v * 100)}%`} />
      <Slider label="At" value={s.start} min={0} max={projectLength(p)} step={0.01} onChange={(v) => set((x) => void (x.start = v), 'ss')} suffix="s" />
      <button className="btn sm ghost danger" onClick={deleteSelection}><Icon name="trash" /> Remove</button>
    </Section>
  );
}

function ProjectSummary() {
  const p = useProject();
  const vo = p.voiceover && findAsset(p, p.voiceover.assetId);
  return (
    <Section title="Project">
      <dl className="specs">
        <dt>Length</dt><dd>{fmtTime(projectLength(p))}</dd>
        <dt>Clips</dt><dd>{p.clips.length}</dd>
        <dt>Voiceover</dt><dd>{vo?.name ?? '—'}</dd>
        <dt>Captions</dt><dd>{p.words.length ? `${p.words.length} words` : p.lines.length ? `${p.lines.length} lines` : '—'} · {p.captions.mode}</dd>
        <dt>Typography</dt><dd>{p.typo.length} blocks</dd>
        <dt>Depth maps</dt><dd>{p.clips.filter((c) => c.depthId).length}</dd>
        <dt>Format</dt><dd>{p.export.aspect} · {p.export.fps} fps</dd>
      </dl>
      <p className="hint">Select something on the timeline or the preview to edit its properties. Shift-click clips to edit several at once.</p>
    </Section>
  );
}

export function Inspector() {
  const sel = useEditor((s) => s.selection);
  const multi = useEditor((s) => s.multi);
  return (
    <aside className="inspector">
      <div className="panel-title">Properties{multi.length ? ` · ${multi.length + (sel ? 1 : 0)} clips` : ''}</div>
      <div className="panel-body">
        {!sel && <ProjectSummary />}
        {sel?.kind === 'clip' && <ClipInspector key={sel.id} id={sel.id} />}
        {sel?.kind === 'overlay' && <OverlayInspector id={sel.id} />}
        {sel?.kind === 'keyword' && <KeywordInspector id={sel.id} />}
        {sel?.kind === 'music' && <MusicInspector id={sel.id} />}
        {sel?.kind === 'sfx' && <SfxInspector id={sel.id} />}
      </div>
    </aside>
  );
}
