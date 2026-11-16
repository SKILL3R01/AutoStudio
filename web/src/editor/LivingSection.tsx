/** Living illustration (v5.6): analyse an image clip into pieces that move by kind; presets; animate every image. */
import { useState } from 'react';
import { findAsset, useEditor } from '../store';
import { useProject } from './hooks';
import { Section, Slider, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { probe } from '../lib/project';
import { clipStill } from '../ai/jobs';
import { analyseLiving } from '../ai/living';
import { useVision } from '../ai/vision';
import { confirmHeavyAi } from '../lib/perf';
import { KINDS, MOTIONS, MOTION_LABEL, PRESETS, type LivingPreset, type LivingState, type PartKind, type PartMotion } from '../living/model';
import type { Clip, Project } from '../types';

const KIND_ICON: Record<PartKind, string> = { boat: '⛵', sail: '🏳', cloth: '🎏', oar: '🛶', animal: '🐋', person: '🧍', water: '🌊', wave: '🌊', sky: '☁', cloud: '☁', tree: '🌳', light: '💡', rigid: '▪' };

/** Analyse one image clip and store its pieces (mask assets) + weather; returns the number of moving pieces. */
export async function makeLiving(clipId: string, preset: LivingPreset = 'calm'): Promise<number> {
  const st = useEditor.getState(), p = st.project!, clip = p.clips.find((c) => c.id === clipId);
  const asset = clip && findAsset(p, clip.assetId);
  if (!clip || !asset || asset.kind !== 'image') return 0;
  const still = await clipStill(clip, asset);
  if (!still) throw new Error('Could not read the picture');
  const r = await analyseLiving(`living:${asset.id}`, still);
  const assets = await Promise.all(r.parts.map((pt, i) => probe(pt.mask, `__living_${i}`, 'image')));
  const pr = PRESETS[preset];
  const state: LivingState = { on: true, preset, strength: pr.strength, speed: pr.speed, analysedAt: Date.now(), assetId: asset.id, parts: r.parts.map(({ mask: _m, ...pt }, i) => ({ ...pt, maskId: assets[i].id })) };
  st.update((d) => {
    d.assets.push(...assets);
    const c = d.clips.find((x) => x.id === clipId)!;
    c.living = state;
    applyWeather(d, c, r.weather ?? pr.weather);
  });
  return state.parts.filter((x) => x.on && x.motion !== 'still').length;
}
/** Rain / snow / dust for this clip only (existing weather effects, scoped to the clip). */
function applyWeather(d: Project, c: Clip, w?: 'rain' | 'snow' | 'dust') {
  d.effects = d.effects.filter((e) => !(e.scope?.kind === 'clips' && e.scope.ids.length === 1 && e.scope.ids[0] === c.id && ['rain', 'snow', 'dust'].includes(e.kind)));
  if (w) d.effects.push({ kind: w, intensity: w === 'rain' ? 0.55 : 0.4, scope: { kind: 'clips', ids: [c.id] } });
}

export function LivingSection({ clip }: { clip: Clip }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const vision = useVision();
  const [busy, setBusy] = useState('');
  const L = clip.living, stale = !!L && L.assetId !== clip.assetId;
  const set = (fn: (l: LivingState) => void, k?: string) => update((d) => { const c = d.clips.find((x) => x.id === clip.id); if (c?.living) fn(c.living); }, k);

  const analyse = async () => {
    if (!confirmHeavyAi()) return;
    setBusy('Analysing…');
    try {
      const n = await makeLiving(clip.id, L?.preset ?? 'calm');
      toast(n ? `${n} pieces now move — press play` : 'No moving pieces found — try another preset or turn pieces on below', n ? 'ok' : 'info');
      useEditor.getState().seek(clip.start + 0.05);
      useEditor.getState().setPlaying(true);
    } catch (e) {
      toast(`Living illustration: ${(e as Error).message}`, 'error');
    } finally {
      setBusy('');
    }
  };
  const animateAll = async () => {
    if (!confirmHeavyAi()) return;
    const ids = p.clips.filter((c) => !c.living && findAsset(p, c.assetId)?.kind === 'image').map((c) => c.id);
    for (const [i, id] of ids.entries()) {
      setBusy(`Image ${i + 1} of ${ids.length}…`);
      try { await makeLiving(id, L?.preset ?? 'calm'); } catch { /* skip images that fail */ }
    }
    setBusy('');
    toast(`${ids.length} images analysed — every picture now moves a little`, 'ok');
  };
  const preset = (k: LivingPreset) => update((d) => { const c = d.clips.find((x) => x.id === clip.id)!; if (!c.living) return; Object.assign(c.living, { preset: k, strength: PRESETS[k].strength, speed: PRESETS[k].speed }); applyWeather(d, c, PRESETS[k].weather); });

  return (
    <Section title="Living illustration" help="living" hint="The app finds the pieces of the picture (ship, sails, oars, waves, clouds…) and moves each one the way it really moves — slightly, in a perfect loop over the clip.">
      <div className="row wrap" data-tour="living">
        <button className="btn sm primary" disabled={!!busy} onClick={() => void analyse()}><Icon name="wand" /> {busy ? (vision.label ? `${vision.label} ${Math.round(vision.value * 100)}%` : busy) : L ? (stale ? 'Analyse the new picture' : 'Analyse again') : 'Bring this image to life'}</button>
        <button className="btn sm ghost" disabled={!!busy} onClick={() => void animateAll()} title="Analyse every image clip that is not living yet">Animate every image</button>
      </div>
      {L && (
        <>
          <Toggle label="On" value={L.on} onChange={(v) => set((l) => void (l.on = v))} />
          <label className="lbl">Mood</label>
          <div className="living-presets">
            {(Object.keys(PRESETS) as LivingPreset[]).map((k) => <button key={k} className={`chip ${L.preset === k ? 'on' : ''}`} onClick={() => preset(k)}>{PRESETS[k].name}{PRESETS[k].weather ? ` · ${PRESETS[k].weather}` : ''}</button>)}
          </div>
          <Slider label="Strength" value={L.strength} min={0.2} max={2} step={0.05} onChange={(v) => set((l) => void (l.strength = v), 'lvst')} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Speed" value={L.speed} min={0.3} max={2} step={0.05} onChange={(v) => set((l) => void (l.speed = v), 'lvsp')} fmt={(v) => `${v.toFixed(2)}×`} />
          <label className="lbl">Pieces <span className="hint">— {L.parts.filter((x) => x.on && x.motion !== 'still').length} moving of {L.parts.length}</span></label>
          <div className="living-parts">
            {L.parts.map((pt) => (
              <div key={pt.id} className={`living-part ${pt.on ? '' : 'off'}`} data-part={pt.kind}>
                <input type="checkbox" checked={pt.on} onChange={(e) => set((l) => void (l.parts.find((x) => x.id === pt.id)!.on = e.target.checked))} title="Animate this piece" />
                <span className="lp-kind" title={pt.label}>{KIND_ICON[pt.kind]} {pt.label}{pt.parentId ? ' ↳' : ''}</span>
                <select value={pt.kind} title="What it is" onChange={(e) => set((l) => { const x = l.parts.find((q) => q.id === pt.id)!; x.kind = e.target.value as PartKind; })}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
                <div className="lp-motions">{MOTIONS.map((m) => <button key={m} className={`chip xs ${pt.motion === m ? 'on' : ''}`} onClick={() => set((l) => void (l.parts.find((x) => x.id === pt.id)!.motion = m as PartMotion))}>{MOTION_LABEL[m]}</button>)}</div>
                <input type="range" min={0} max={2} step={0.05} value={pt.strength} title="Strength of this piece" onChange={(e) => set((l) => void (l.parts.find((x) => x.id === pt.id)!.strength = +e.target.value), `lvp${pt.id}`)} />
              </div>
            ))}
          </div>
          <button className="btn sm ghost" onClick={() => update((d) => { const c = d.clips.find((x) => x.id === clip.id)!; c.living = undefined; applyWeather(d, c, undefined); })}><Icon name="x" /> Remove</button>
        </>
      )}
    </Section>
  );
}
