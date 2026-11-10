import { create } from 'zustand';
import { useEditor } from '../store';
import { useProject } from './hooks';
import { FilePick, Section, Seg, Slider, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { CHROMA_PRESETS, defaultChroma } from '../render/chroma';
import { probe } from '../lib/project';
import type { Chroma, KeyBg, Project } from '../types';

type Target = { kind: 'pip' | 'overlay' | 'clip'; id: string };

/** Eyedropper state: while set, the next click on the preview picks the key colour for `target`. */
export const usePicker = create<{ target: Target | null; set: (t: Target | null) => void }>((set) => ({ target: null, set: (target) => set({ target }) }));

const itemOf = (d: Project, t: Target): { chroma?: Chroma } | undefined =>
  t.kind === 'pip' ? d.pips.find((x) => x.id === t.id) : t.kind === 'overlay' ? d.overlays.find((x) => x.id === t.id) : d.clips.find((x) => x.id === t.id);

/** Called by the preview with the colour under the pointer. */
export function pickedColor(hex: string) {
  const t = usePicker.getState().target;
  if (!t) return;
  useEditor.getState().update((d) => {
    const it = itemOf(d, t);
    if (it) it.chroma = { ...(it.chroma ?? defaultChroma(hex)), color: hex, on: true };
  });
  usePicker.getState().set(null);
  toast(`Removing ${hex}`, 'ok');
}

/** "Remove a colour" for overlays, logos and main-track clips (with a background for main clips). */
export function ChromaSection({ target }: { target: Target }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const picking = usePicker((s) => s.target?.id === target.id);
  const it = itemOf(p, target);
  if (!it) return null;
  const c = it.chroma;
  const set = (patch: Partial<Chroma>, k?: string) => update((d) => {
    const x = itemOf(d, target)!;
    x.chroma = { ...(x.chroma ?? defaultChroma()), ...patch };
  }, k && `chroma-${k}-${target.id}`);
  const clip = target.kind === 'clip' ? p.clips.find((x) => x.id === target.id) : undefined;
  const bg: KeyBg = clip?.keyBg ?? { kind: 'color', color: '#000000' };
  const setBg = (b: KeyBg) => update((d) => void (d.clips.find((x) => x.id === target.id)!.keyBg = b));
  const pick = () => {
    // Pick from the original picture: switch the key off until a colour is chosen.
    if (c?.on) set({ on: false });
    usePicker.getState().set(target);
    toast('Click the colour to remove on the preview', 'info');
  };
  return (
    <Section title="Remove a colour (chroma key)" hint="Green / blue screen, or any colour — what is removed becomes transparent.">
      <Toggle label="Remove a colour" value={!!c?.on} onChange={(v) => set({ on: v })} />
      <div className="row wrap">
        <button className={`btn sm ${picking ? 'primary' : ''}`} onClick={pick}><Icon name="cursor" /> {picking ? 'Click on the preview…' : 'Pick from preview'}</button>
        {CHROMA_PRESETS.map(([hex, label]) => (
          <button key={hex} className={`chip ${c?.on && c.color === hex ? 'on' : ''}`} onClick={() => set({ on: true, color: hex })}><span className="swatch" style={{ background: hex }} /> {label}</button>
        ))}
        <input type="color" value={c?.color ?? '#00b140'} onChange={(e) => set({ on: true, color: e.target.value }, 'col')} title="Exact colour" />
      </div>
      {c?.on && (
        <>
          <Slider label="Tolerance" value={c.tolerance} min={0.02} max={0.8} step={0.01} onChange={(v) => set({ tolerance: v }, 'tol')} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Edge softness" value={c.softness} min={0.02} max={1} step={0.01} onChange={(v) => set({ softness: v }, 'soft')} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Spill removal" value={c.spill} min={0} max={1} step={0.01} onChange={(v) => set({ spill: v }, 'spill')} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Toggle label="Show matte (white = kept)" value={!!c.matte} onChange={(v) => set({ matte: v })} />
        </>
      )}
      {clip && c?.on && (
        <>
          <h4>Background</h4>
          <Seg options={[['color', 'Colour'], ['blur', 'Blurred copy'], ['image', 'Image']] as const} value={bg.kind} onChange={(k) => setBg(k === 'color' ? { kind: 'color', color: '#000000' } : k === 'blur' ? { kind: 'blur' } : bg.kind === 'image' ? bg : { kind: 'color', color: '#000000' })} />
          {bg.kind === 'color' && <input type="color" value={bg.color} onChange={(e) => setBg({ kind: 'color', color: e.target.value })} />}
          <FilePick accept="image/*" className="btn sm ghost" onFiles={async ([f]) => {
            if (!f) return;
            const a = await probe(f, f.name, 'image');
            update((d) => void (d.assets.push(a), (d.clips.find((x) => x.id === target.id)!.keyBg = { kind: 'image', assetId: a.id })));
          }}><Icon name="image" /> {bg.kind === 'image' ? 'Change background image' : 'Use an image as background'}</FilePick>
        </>
      )}
    </Section>
  );
}
