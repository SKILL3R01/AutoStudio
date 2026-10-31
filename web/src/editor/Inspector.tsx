import { useState } from 'react';
import { useEditor, clipEnd, findAsset, projectLength } from '../store';
import { useProject, useThumb } from './hooks';
import { FilePick, Section, Select, Slider, LogBox, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { MOTIONS, TRANSITIONS, REGION_EFFECTS, KEYWORD_ANIMS, type Overlay, type KeywordItem, type Region, type MusicItem, type SfxItem } from '../types';
import { MOTION_LABELS, TRANSITION_LABELS } from './Panels';
import { fmtTime } from '../lib/util';
import { probe } from '../lib/project';
import { fetchResult, runJob, useEngine } from '../lib/engine';
import { media } from '../render/media';
import { splitAtPlayhead } from './Timeline';
import { deleteSelection } from './shortcuts';
import { CAPTION_FONTS } from '../render/captions';
import { makeDepthAsset } from '../ai/jobs';
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
        <button className="btn sm primary" onClick={() => setRegionOpen(true)}><Icon name="cursor" /> Animate a detail…</button>
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

function KeywordInspector({ id }: { id: string }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const k = p.keywords.find((x) => x.id === id);
  if (!k) return null;
  const set = (fn: (k: KeywordItem) => void, key?: string) => update((d) => {
    const it = d.keywords.find((x) => x.id === id)!;
    fn(it);
    it.locked = true;
  }, key && `${key}-${id}`);
  return (
    <Section title="Keyword">
      <input value={k.text} onChange={(e) => set((x) => void (x.text = e.target.value), 'kt')} />
      <div className="row">
        <Select label="Font" value={k.font} options={CAPTION_FONTS} onChange={(v) => set((x) => void (x.font = v))} />
        <label className="field"><span>Colour</span><input type="color" value={k.color} onChange={(e) => set((x) => void (x.color = e.target.value), 'kc')} /></label>
      </div>
      <Select label="Animation" value={k.anim} options={KEYWORD_ANIMS} onChange={(v) => set((x) => void (x.anim = v))} />
      <Slider label="Size" value={k.size} min={0.3} max={3} onChange={(v) => set((x) => void (x.size = v), 'ks')} />
      <Slider label="Rotate" value={k.rotate} min={-45} max={45} step={1} onChange={(v) => set((x) => void (x.rotate = v), 'kr')} suffix="°" />
      <Slider label="X" value={k.x} min={0} max={1} onChange={(v) => set((x) => void (x.x = v), 'kx')} />
      <Slider label="Y" value={k.y} min={0} max={1} onChange={(v) => set((x) => void (x.y = v), 'ky')} />
      <Slider label="Appears" value={k.start} min={0} max={projectLength(p)} step={0.05} onChange={(v) => set((x) => void (x.start = v), 'k0')} suffix="s" />
      <Slider label="Until" value={k.end} min={k.start + 0.2} max={projectLength(p)} step={0.05} onChange={(v) => set((x) => void (x.end = v), 'k1')} suffix="s" />
      <p className="hint">Drag it on the preview to reposition. Editing locks its look against 🎲 Randomize.</p>
      <button className="btn sm ghost danger" onClick={deleteSelection}><Icon name="trash" /> Delete</button>
    </Section>
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
      <Toggle label="Duck under voice" value={m.duck} onChange={(v) => set((x) => void (x.duck = v))} />
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
        <dt>Keywords</dt><dd>{p.keywords.length}</dd>
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
