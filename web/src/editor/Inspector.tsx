import { isDepthMotion } from '../render/motion';
import { DEPTH_MOTIONS } from '../types';
import { FramingSection } from './Framing';
import { denoise } from '../audio/denoise';
import { addReplacementTake, clipAudioWav, processClipAudio, splitVoiceBackground } from './actions';
import { detectLanguage, joinParagraphs, listVoices, paragraphsOf, speakParagraph, voiceBlob, type VoiceSample } from '../voice/library';
import { KOKORO_VOICES, transcribeLocal } from '../ai/vision';
import { SilenceDialog } from './SilenceDialog';
import { VoiceEnhance } from '../voice/VoicePanel';
import { PIP_PRESETS } from '../lib/pip';
import { mainVoiceAsset, moveAudioClip, voiceStartOf } from '../lib/audiotracks';
import { fmtClock, parseClock, setClipStart } from '../lib/timeline';
import { useEffect, useState } from 'react';

import { useEditor, clipEnd, findAsset, projectLength, voiceEnd } from '../store';

import { useProject, useThumb } from './hooks';

import { FilePick, Section, Seg, Select, Slider, LogBox, Toggle } from '../components/ui';

import { Icon } from '../components/icons';

import { toast } from '../components/Toast';

import { MOTIONS, TRANSITIONS, REGION_EFFECTS, TYPO_TEMPLATES, TYPO_ENTERS, TYPO_EXITS, type TypoEnter, type TypoExit, type Framing, type MotionEasing, type Overlay, type Region, type AudioClip, type PipClip, type TypoBlock, type TypoBg, type TypoRole, type TypoTemplate } from '../types';

import { FONT_PAIRS, TEMPLATE_LABELS, TYPO_PALETTES } from '../lib/typography';

import { MOTION_LABELS, TRANSITION_LABELS } from './Panels';

import { fmtTime } from '../lib/util';

import { probe } from '../lib/project';

import { fetchResult, runJob, useEngine } from '../lib/engine';

import { media } from '../render/media';

import { detachSelectedAudio, splitAtPlayhead } from './actions';


import { AiVideoSection } from './AiVideo';

import { GradeEditor } from './GradeEditor';

import { PEN_FONTS, type PenFont } from '../render/strokefont';

import { penDuration } from '../render/handdrawn';

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

      if (!isDepthMotion(clip.motion)) set((c) => void (c.motion = 'parallaxZoom'));

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

        {i > 0 && (
          <label className="field"><span>Start (m:ss.mmm)</span>
            <input key={`${clip.id}-${clip.start}`} defaultValue={fmtClock(clip.start)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} onBlur={(e) => {
              const v = parseClock(e.target.value);
              if (v === null) return void (e.target.value = fmtClock(clip.start));
              update((d) => setClipStart(d, i, v, projectLength(d)));
            }} />
          </label>
        )}
        {(() => {
          const d = clipEnd(p, i) - start;
          if (clip.ignoreDuration || (d >= 1 && d <= 20)) return null;
          return (
            <div className="row between warn-row">
              <span className="warn">⚠ {d < 1 ? `Only ${d.toFixed(2)} s on screen (under 1 s)` : `${d.toFixed(1)} s on screen (over 20 s)`}</span>
              <button className="btn sm ghost" onClick={() => update((x) => void (x.clips[i].ignoreDuration = true))}>Ignore</button>
            </div>
          );
        })()}
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

          <Slider label="Speed" value={clip.speed ?? 1} min={0.25} max={4} step={0.05} onChange={(v) => set((c) => void (c.speed = Math.abs(v - 1) < 0.03 ? undefined : v), 'cspeed')} fmt={(v) => `${v.toFixed(2)}×`} />

          <div className="row wrap">

            {[0.5, 1, 1.5, 2].map((v) => <button key={v} className={`btn sm ghost ${(clip.speed ?? 1) === v ? 'on' : ''}`} onClick={() => set((c) => void (c.speed = v === 1 ? undefined : v))}>{v}×</button>)}

          </div>

          <Slider label="Clip sound" value={clip.volume} min={0} max={1.5} onChange={(v) => set((c) => void (c.volume = v), 'cvol')} fmt={(v) => `${Math.round(v * 100)}%`} />

          {clip.volume > 0 && (

            <div className="row">

              <Slider label="Sound fade in" value={clip.fadeIn ?? 0} min={0} max={3} step={0.1} onChange={(v) => set((c) => void (c.fadeIn = v), 'cfi')} suffix="s" />

              <Slider label="Fade out" value={clip.fadeOut ?? 0} min={0} max={3} step={0.1} onChange={(v) => set((c) => void (c.fadeOut = v), 'cfo')} suffix="s" />

            </div>

          )}

          <button className="btn sm" disabled={clip.volume <= 0} onClick={detachSelectedAudio}><Icon name="unlink" /> Detach audio to the music lane</button>

          <p className="hint">The clip's own sound is mixed under the narration and follows the speed; motion (zoom/pan) applies to videos too.</p>

        </Section>

      )}

      {asset.kind === 'image' && <AiVideoSection clip={clip} i={i} asset={asset} />}

      <FramingSection clipId={clip.id} />

      <Section title="Depth & animated details" hint="Make the image come alive: 3D depth motion, and effects on a part of the image you click.">

        <div className="row">

          {depthThumb && <img className="depth-thumb" src={depthThumb} alt="depth" />}

          <button className="btn sm" disabled={depthBusy} onClick={depth}><Icon name="depth" /> {depthBusy ? (vision.label ? `${vision.label} ${Math.round(vision.value * 100)}%` : 'Estimating…') : clip.depthId ? 'Redo depth map' : 'Preview 3D (make depth map)'}</button>
          {clip.depthId && <button className="btn sm ghost" onClick={() => set((c) => void ((c.depthId = undefined), isDepthMotion(c.motion) && (c.motion = 'zoomIn')))}><Icon name="x" /> Remove 3D</button>}

        </div>

        {clip.depthId && (
          <div className="card">
            <b>3D move for this scene</b>
            <p className="hint">White = near, black = far. Pick a move and press play to preview it here before exporting; “Remove 3D” goes back to a flat move.</p>
            <div className="row wrap">
              {DEPTH_MOTIONS.map((m) => (
                <button key={m} className={`chip ${clip.motion === m ? 'on' : ''}`} onClick={() => (set((c) => void (c.motion = m)), useEditor.getState().seek(start + 0.05), useEditor.getState().setPlaying(true))}>{MOTION_LABELS[m]}</button>
              ))}
            </div>
            <Slider label="3D strength" value={p.motionDepth} min={0} max={0.4} onChange={(v) => update((d) => void (d.motionDepth = v), 'depth3d')} fmt={(v) => `${Math.round(v * 100)}%`} />
          </div>
        )}
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

      <GradeEditor

        value={color}

        scope="clip"

        previewAssetId={asset.kind === 'image' ? asset.id : undefined}

        onChange={(fn, key) => set((c) => {

          c.color = c.color ?? { brightness: 1, contrast: 1, saturation: 1 };

          fn(c.color);

        }, key)}

        onPasteAll={() => update((d) => d.clips.forEach((c) => void (c.color = structuredClone(color))))}

      />

      <Section title="Actions">

        <div className="row wrap">

          <FilePick accept="image/*,video/*" onFiles={replace} className="btn sm">Replace…</FilePick>

          <button className="btn sm" onClick={() => splitAtPlayhead()}><Icon name="scissors" /> Split</button>

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

      {!o.assetId && (

        <>

          <Select label="Hand-drawn" value={o.write ?? 'none'} options={[['none', 'Off'], ['outline', 'Outline draws, then fills'], ['pen', 'Pen writing (single-line)']] as ['none' | 'outline' | 'pen', string][]} onChange={(v) => set((x) => void (x.write = v))} />

          {o.write === 'pen' && <Select label="Pen font" value={o.penFont ?? 'allure'} options={Object.entries(PEN_FONTS).map(([k, v]) => [k, v] as [PenFont, string])} onChange={(v) => set((x) => void (x.penFont = v))} />}

          {o.write && o.write !== 'none' && <Slider label="Writing time" value={o.writeTime ?? penDuration(o.text)} min={0.3} max={Math.max(1, o.duration)} step={0.1} onChange={(v) => set((x) => void (x.writeTime = v), 'owt')} suffix="s" />}

          {o.write === 'pen' && /[^ -~\s]/.test(o.text) && <p className="hint">Pen writing covers Latin letters, digits and punctuation — use “Outline” for Arabic and other scripts.</p>}

        </>

      )}

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

  auto: 'By role (template)', pop: 'Pop', slam: 'Slam', slide: 'Slide in', drop: 'Drop', zoom: 'Zoom', fade: 'Fade', draw: 'Wipe reveal', typewriter: 'Typewriter', outline: 'Hand-drawn outline → fill', pen: 'Pen writing',

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

        {(b.enter === 'pen' || b.words.some((w) => w.anim === 'pen')) && (

          <Select label="Pen font" value={b.penFont ?? ''} options={[['', 'Auto (script for accents)'], ...Object.entries(PEN_FONTS).map(([k, v]) => [k, v] as [string, string])]} onChange={(v) => set((x) => void (x.penFont = (v || undefined) as PenFont | undefined))} />

        )}

        {b.enter === 'pen' && <p className="hint">Pen writing uses single-line fonts (Latin letters); other scripts fall back to the outline style.</p>}

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



/** Change voice: re-voice keeping timing (local engine) or re-generate the words in another voice. */
function ChangeVoiceSection({ clipId }: { clipId: string }) {
  const p = useProject();
  const [voices, setVoices] = useState<VoiceSample[]>([]);
  const [target, setTarget] = useState('');
  const [draft, setDraft] = useState('af_heart');
  const [busy, setBusy] = useState('');
  const [local, setLocal] = useState(false);
  useEffect(() => void listVoices().then((v) => (setVoices(v), setTarget((t) => t || v[0]?.id || ''))), []);
  useEffect(() => void window.autostudio?.voice?.status().then((s) => setLocal(!!s?.installed)).catch(() => {}), []);
  const c = p.audio.find((x) => x.id === clipId);
  if (!c) return null;
  const words = (p.words.length ? p.words : p.lines.flatMap((l) => l.words)).filter((w) => w.start >= c.start - 0.05 && w.end <= c.start + c.duration + 0.05);
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };
  const revoice = () => run('Re-voicing on this PC (about 3–7× the clip length)…', async () => {
    const audio = await clipAudioWav(clipId);
    const v = await voiceBlob(target);
    if (!audio || !v) throw new Error('Pick a saved voice profile first');
    const out = await window.autostudio!.voice!.convert!({ audio, voice: await v.arrayBuffer(), voiceExt: v.type.includes('webm') ? 'webm' : 'wav' });
    await addReplacementTake(clipId, new Blob([out], { type: 'audio/wav' }), `revoice_${voices.find((x) => x.id === target)?.name ?? 'voice'}.wav`);
  });
  const regenerate = (useDraft: boolean) => run('Re-generating the words…', async () => {
    let text = words.map((w) => w.text).join(' ');
    if (!text) {
      setBusy('Transcribing this clip on this PC…');
      const wav = await clipAudioWav(clipId);
      text = wav ? (await transcribeLocal(new Blob([wav], { type: 'audio/wav' }), 'base', 'auto')).words.map((w) => w.text).join(' ') : '';
    }
    if (!text.trim()) throw new Error('No words found in this clip');
    setBusy('Speaking the words in the new voice…');
    const st = voices.find((x) => x.id === target)?.settings;
    const settings = { voiceId: useDraft ? undefined : target, language: st?.language && st.language !== 'auto' ? st.language : detectLanguage(text), exaggeration: st?.exaggeration ?? 0.5, cfg: st?.cfg ?? 0.5, seed: 0, draftVoice: draft };
    const parts = [];
    for (const para of paragraphsOf(text)) parts.push(await speakParagraph(para, settings, useDraft ? 'draft' : local ? 'local' : 'colab'));
    await addReplacementTake(clipId, await joinParagraphs(parts), `regen_${useDraft ? draft : voices.find((x) => x.id === target)?.name ?? 'voice'}.wav`);
  });
  return (
    <Section title="Change voice" hint="The original stays (volume 0) — compare and keep the one you like.">
      {voices.length > 0 && <Select label="Voice profile" value={target} options={voices.map((v) => [v.id, v.name] as [string, string])} onChange={setTarget} />}
      <div className="row wrap">
        <button className="btn sm" disabled={!!busy || !local || !target || !window.autostudio?.voice?.convert} onClick={revoice} title="Same words, pauses and timing — another voice (local voice engine)"><Icon name="mic" /> Re-voice (keep timing)</button>
        <button className="btn sm" disabled={!!busy || !target} onClick={() => regenerate(false)} title="Speak the same words again with this profile (timing changes slightly)"><Icon name="wand" /> Re-generate with profile</button>
      </div>
      {!local && <p className="hint">Re-voice needs the local voice engine (desktop app → Voice → Install).</p>}
      <div className="row">
        <Select label="…or a draft voice" value={draft} options={KOKORO_VOICES} onChange={setDraft} />
        <button className="btn sm ghost" disabled={!!busy} onClick={() => regenerate(true)}>Re-generate</button>
      </div>
      {busy && <p className="hint">{busy}</p>}
    </Section>
  );
}

/** Clean up & enhance for one audio clip: noise reduction, silences, voice enhance, pace / pitch. */
function CleanUpSection({ clipId, trackId, voice }: { clipId: string; trackId: string; voice: boolean }) {
  const [busy, setBusy] = useState('');
  const [strength, setStrength] = useState(0.9);
  const [silence, setSilence] = useState(false);
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
      toast('Done — the original file is kept (Undo restores it)', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };
  return (
    <Section title="Clean up & enhance" hint="Runs on this PC. Each step makes a new copy of the audio — the original stays in Media.">
      {silence && <SilenceDialog clipId={clipId} onClose={() => setSilence(false)} />}
      <Slider label="Noise reduction strength" value={strength} min={0.3} max={1} onChange={setStrength} fmt={(v) => `${Math.round(v * 100)}%`} />
      <div className="row wrap">
        <button className="btn sm" disabled={!!busy || !window.autostudio?.voice?.separate} title="Split into voice and background (music, ambience) — the background goes to its own muted track. Desktop app with the local voice engine." onClick={() => run('Separating voice and background on this PC (about 1.5× the clip length)…', async () => {
          const wav = await clipAudioWav(clipId);
          if (!wav) throw new Error('Could not read this audio');
          const r = await window.autostudio!.voice!.separate!({ audio: wav });
          await splitVoiceBackground(clipId, new Blob([r.vocals], { type: 'audio/wav' }), new Blob([r.background], { type: 'audio/wav' }));
        })}><Icon name="music" /> Remove music / keep voice</button>
        <button className="btn sm" disabled={!!busy} onClick={() => run('Reducing background noise…', () => processClipAudio(clipId, 'clean', (b) => denoise(b, strength, (f) => setBusy(`Reducing background noise… ${Math.round(f * 100)}%`))))}><Icon name="wand" /> Reduce background noise</button>
        <button className="btn sm" disabled={!!busy} onClick={() => setSilence(true)}><Icon name="scissors" /> Remove silences…</button>
      </div>
      {busy && <p className="hint">{busy}</p>}
      {voice && (
        <>
          <h4>Voice enhance (whole track)</h4>
          <VoiceEnhance trackId={trackId} clipId={clipId} />
        </>
      )}
    </Section>
  );
}

function AudioClipInspector({ id }: { id: string }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const m = p.audio.find((x) => x.id === id);
  if (!m) return null;
  const t = p.audioTracks.find((x) => x.id === m.trackId);
  const isNarr = m.trackId === p.narrationTrackId;
  const asset = findAsset(p, m.assetId);
  const set = (fn: (x: AudioClip) => void, k?: string) => update((d) => fn(d.audio.find((x) => x.id === id)!), k && `${k}${id}`);
  const words = isNarr ? (p.words.length ? p.words : p.lines.flatMap((l) => l.words)).filter((w) => w.start >= m.start - 0.05 && w.end <= m.start + m.duration + 0.05) : [];
  return (
    <>
      <Section title={`${t?.name ?? 'Audio'} · ${asset?.name ?? m.sound ?? ''}`}>
        <p className="hint">{fmtTime(m.start)} → {fmtTime(m.start + m.duration)} · {m.duration.toFixed(2)} s{isNarr ? ' · ★ narration (captions follow it)' : ''}</p>
        {words.length > 0 && <p className="hint">“{words.map((w) => w.text).join(' ').slice(0, 200)}”</p>}
        <label className="field"><span>Start (m:ss.mmm)</span>
          <input key={`${m.id}-${m.start}`} defaultValue={fmtClock(m.start)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} onBlur={(e) => {
            const v = parseClock(e.target.value);
            if (v === null) return void (e.target.value = fmtClock(m.start));
            update((d) => moveAudioClip(d, id, v));
          }} />
        </label>
        <Select label="Track" value={m.trackId} options={p.audioTracks.map((x) => [x.id, `${x.id === p.narrationTrackId ? '★ ' : ''}${x.name}`] as [string, string])} onChange={(v) => set((x) => void (x.trackId = v))} />
        <Slider label="Volume" value={m.volume} min={0} max={2} onChange={(v) => set((x) => void (x.volume = v), 'mv')} fmt={(v) => `${Math.round(v * 100)}%`} />
        {asset && <Slider label="Trim in" value={m.trimIn} min={0} max={Math.max(0, (asset.duration ?? 1) - 0.2)} step={0.05} onChange={(v) => set((x) => void (x.trimIn = v), 'mt')} suffix="s" />}
        <Slider label="Fade in" value={m.fadeIn} min={0} max={Math.min(8, m.duration / 2)} onChange={(v) => set((x) => void (x.fadeIn = v), 'mfi')} suffix="s" />
        <Slider label="Fade out" value={m.fadeOut} min={0} max={Math.min(10, m.duration / 2)} onChange={(v) => set((x) => void (x.fadeOut = v), 'mfo')} suffix="s" />
        <div className="row wrap">
          <button className="btn sm" onClick={() => (useEditor.getState().seek(m.start), useEditor.getState().setPlaying(true))}><Icon name="play" /> Play</button>
          <button className="btn sm" onClick={() => splitAtPlayhead()}><Icon name="scissors" /> Split at playhead</button>
          <button className="btn sm ghost danger" onClick={deleteSelection}><Icon name="trash" /> Remove</button>
        </div>
      </Section>
      {m.linkClipId && (
        <Section title="Linked to its video">
          <p className="hint">This sound follows its video clip (position, length, trim, speed).</p>
          <button className="btn sm" onClick={() => set((x) => void (x.linkClipId = undefined))}><Icon name="unlink" /> Unlink — move it freely</button>
        </Section>
      )}
      <CleanUpSection clipId={m.id} trackId={m.trackId} voice={t?.kind === 'voice'} />
      {(t?.kind === 'voice' || isNarr) && <ChangeVoiceSection clipId={m.id} />}
      {!isNarr && (
        <Section title="Under the narration">
          <Toggle label="Duck under the narration (dips while it speaks, rises in the pauses)" value={!!m.duck} onChange={(v) => set((x) => void (x.duck = v))} />
          {m.duck && (
            <>
              <div className="row wrap">
                {([['Gentle', 0.6, 0.35, 0.6], ['Podcast', 0.35, 0.25, 0.4], ['Strong', 0.15, 0.15, 0.3]] as const).map(([n, depth, a, r]) => (
                  <button key={n} className={`chip ${m.duckDepth === depth ? 'on' : ''}`} onClick={() => set((x) => void ((x.duck = true), (x.duckDepth = depth), (x.duckAttack = a), (x.duckRelease = r)))}>{n}</button>
                ))}
              </div>
              <Slider label="Duck level" value={m.duckDepth ?? 0.35} min={0} max={1} onChange={(v) => set((x) => void (x.duckDepth = v), 'mdd')} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Dip before" value={m.duckAttack ?? 0.25} min={0.05} max={1.5} step={0.05} onChange={(v) => set((x) => void (x.duckAttack = v), 'mda')} suffix="s" />
              <Slider label="Back up after" value={m.duckRelease ?? 0.4} min={0.05} max={3} step={0.05} onChange={(v) => set((x) => void (x.duckRelease = v), 'mdr')} suffix="s" />
            </>
          )}
          <div className="card">
            <b>Volume curve</b>
            <p className="hint">Add points at the playhead to shape the level over time (100 % = normal).</p>
            {(m.curve ?? []).map((pt, k) => (
              <div key={k} className="row between">
                <code>{fmtClock(pt.t)}</code>
                <Slider label="" value={pt.v} min={0} max={2} onChange={(v) => set((x) => void (x.curve![k].v = v), `mc${k}`)} fmt={(v) => `${Math.round(v * 100)}%`} />
                <button className="icon-btn" onClick={() => set((x) => void x.curve!.splice(k, 1))}><Icon name="x" size={12} /></button>
              </div>
            ))}
            <div className="row wrap">
              <button className="btn sm ghost" onClick={() => set((x) => void (x.curve = [...(x.curve ?? []), { t: useEditor.getState().time, v: 1 }].sort((a, b) => a.t - b.t)))}><Icon name="plus" /> Point at playhead</button>
              <button className="btn sm ghost" onClick={() => {
                const pp = useEditor.getState().project!;
                const vs = voiceStartOf(pp), ve = voiceEnd(pp), end = m.start + m.duration;
                set((x) => void (x.curve = [{ t: m.start, v: 1.4 }, { t: Math.max(m.start, vs - 0.5), v: 1.4 }, { t: vs + 0.5, v: 1 }, { t: Math.max(vs + 0.6, ve - 0.5), v: 1 }, { t: Math.min(end, ve + 0.5), v: 1.4 }]));
              }}>Intro / outro louder</button>
              {m.curve?.length ? <button className="btn sm ghost" onClick={() => set((x) => void (x.curve = undefined))}>Clear curve</button> : null}
            </div>
          </div>
        </Section>
      )}
      {t && (
        <Section title={`Track · ${t.name}`}>
          <Slider label="Track volume" value={t.volume} min={0} max={2} onChange={(v) => update((d) => void (d.audioTracks.find((x) => x.id === t.id)!.volume = v), `tv${t.id}`)} fmt={(v) => `${Math.round(v * 100)}%`} />
          <div className="row wrap">
            <Toggle label="Mute" value={!!t.muted} onChange={(v) => update((d) => void (d.audioTracks.find((x) => x.id === t.id)!.muted = v))} />
            {t.kind === 'voice' && !isNarr && <button className="btn sm" onClick={() => update((d) => void ((d.narrationTrackId = t.id), (d.audioTracks.find((x) => x.id === t.id)!.muted = false)))}>★ Make narration track</button>}
          </div>
        </Section>
      )}
    </>
  );
}

function PipInspector({ id }: { id: string }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const c = p.pips.find((x) => x.id === id);
  if (!c) return null;
  const asset = findAsset(p, c.assetId);
  const set = (fn: (x: PipClip) => void, k?: string) => update((d) => fn(d.pips.find((x) => x.id === id)!), k && `${k}${id}`);
  const free = c.shape === 'rect' || c.shape === 'circle';
  return (
    <>
      <Section title={`Overlay · ${asset?.name ?? ''}`}>
        <p className="hint">{fmtTime(c.start)} → {fmtTime(c.start + c.duration)} · {c.duration.toFixed(2)} s · on {p.videoTracks.find((t) => t.id === c.trackId)?.name}</p>
        <div className="grid2">
          {Object.entries(PIP_PRESETS).map(([k, v]) => (
            <button key={k} className="tile" title={v.hint} onClick={() => set((x) => void Object.assign(x, v.v))}>{v.label}</button>
          ))}
        </div>
        <label className="field"><span>Start (m:ss.mmm)</span>
          <input key={`${c.id}-${c.start}`} defaultValue={fmtClock(c.start)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} onBlur={(e) => {
            const v = parseClock(e.target.value);
            if (v === null) return void (e.target.value = fmtClock(c.start));
            set((x) => void (x.start = Math.max(0, v)));
          }} />
        </label>
        <Slider label="Length" value={c.duration} min={0.2} max={Math.max(30, c.duration)} step={0.1} onChange={(v) => set((x) => void (x.duration = v), 'pd')} suffix="s" />
      </Section>
      <Section title="Position & look">
        {free && (
          <>
            <Slider label="Left ↔ right" value={c.x} min={0} max={1} step={0.005} onChange={(v) => set((x) => void (x.x = v), 'px')} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Top ↕ bottom" value={c.y} min={0} max={1} step={0.005} onChange={(v) => set((x) => void (x.y = v), 'py')} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Size" value={c.scale} min={0.08} max={1} step={0.005} onChange={(v) => set((x) => void (x.scale = v), 'ps')} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Rotate" value={c.rotate} min={-30} max={30} step={0.5} onChange={(v) => set((x) => void (x.rotate = v), 'pr')} suffix="°" />
            {c.shape === 'rect' && <Slider label="Rounded corners" value={c.radius} min={0} max={0.5} step={0.01} onChange={(v) => set((x) => void (x.radius = v), 'prad')} fmt={(v) => `${Math.round(v * 200)}%`} />}
          </>
        )}
        {c.shape === 'half' && <Seg options={[['left', 'Left half'], ['right', 'Right half']] as const} value={c.x < 0.5 ? 'left' : 'right'} onChange={(v) => set((x) => void (x.x = v === 'left' ? 0.25 : 0.75))} />}
        <Seg options={[['rect', 'Window'], ['circle', 'Circle'], ['full', 'Full screen'], ['half', 'Half']] as const} value={c.shape} onChange={(v) => set((x) => void (x.shape = v))} />
        <Slider label="Opacity" value={c.opacity} min={0.1} max={1} onChange={(v) => set((x) => void (x.opacity = v), 'po')} fmt={(v) => `${Math.round(v * 100)}%`} />
        {free && <Slider label="Border" value={c.border} min={0} max={16} step={1} onChange={(v) => set((x) => void (x.border = v), 'pb')} suffix=" px" />}
        {free && c.border > 0 && <label className="field"><span>Border colour</span><input type="color" value={c.borderColor} onChange={(e) => set((x) => void (x.borderColor = e.target.value), 'pbc')} /></label>}
        {free && <Toggle label="Shadow" value={c.shadow} onChange={(v) => set((x) => void (x.shadow = v))} />}
        <Slider label="Slow zoom" value={c.zoom ?? 0} min={0} max={0.3} step={0.01} onChange={(v) => set((x) => void (x.zoom = v), 'pz')} fmt={(v) => (v ? `+${Math.round(v * 100)}%` : 'off')} />
        <Slider label="Fade in" value={c.fadeIn} min={0} max={2} onChange={(v) => set((x) => void (x.fadeIn = v), 'pfi')} suffix="s" />
        <Slider label="Fade out" value={c.fadeOut} min={0} max={2} onChange={(v) => set((x) => void (x.fadeOut = v), 'pfo')} suffix="s" />
        {asset?.kind === 'video' && <Slider label="Clip sound" value={c.volume} min={0} max={1.5} onChange={(v) => set((x) => void (x.volume = v), 'pv')} fmt={(v) => (v ? `${Math.round(v * 100)}%` : 'muted')} />}
        <div className="row wrap">
          <button className="btn sm" onClick={() => splitAtPlayhead()}><Icon name="scissors" /> Split at playhead</button>
          <button className="btn sm ghost danger" onClick={deleteSelection}><Icon name="trash" /> Remove</button>
        </div>
      </Section>
    </>
  );
}

function ProjectSummary() {

  const p = useProject();

  const vo = mainVoiceAsset(p) ? findAsset(p, mainVoiceAsset(p)!) : undefined;

  return (

    <Section title="Project">

      <dl className="specs">

        <dt>Length</dt><dd>{fmtTime(projectLength(p))}</dd>

        <dt>Clips</dt><dd>{p.clips.length}</dd>

        <dt>Voiceover</dt><dd>{vo?.name ?? '—'}</dd>

        <dt>Captions</dt><dd>{p.words.length ? `${p.words.length} words` : p.lines.length ? `${p.lines.length} lines` : '—'} · {[p.captions.enabled && 'subtitles', p.captions.typography !== false && 'typography'].filter(Boolean).join(' + ') || 'hidden'}</dd>

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

        {sel?.kind === 'audio' && <AudioClipInspector key={sel.id} id={sel.id} />}

        {sel?.kind === 'pip' && <PipInspector key={sel.id} id={sel.id} />}

      </div>

    </aside>

  );

}

