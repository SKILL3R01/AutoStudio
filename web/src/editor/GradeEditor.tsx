import { useEffect, useState } from 'react';
import { useEditor } from '../store';
import { media } from '../render/media';
import { LOOKS, NEUTRAL, cssFilter, drawVignette, gradeDrawable, needsGpu, parseCube } from '../render/grade';
import { FilePick, Section, Slider } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { uid } from '../lib/util';
import type { ColorAdjust, Lut } from '../types';

interface SavedLook {
  id: string;
  name: string;
  grade: ColorAdjust;
  lut?: Lut;
}
const LOOKS_KEY = 'looks';
const CLIP_KEY = 'gradeClipboard';
const loadLooks = (): SavedLook[] => JSON.parse(localStorage.getItem(LOOKS_KEY) ?? '[]');

/** Replace every field of a grade in place (so undo / immer see one change). */
function replace(target: ColorAdjust, next: ColorAdjust) {
  for (const k of Object.keys(target) as (keyof ColorAdjust)[]) delete target[k];
  Object.assign(target, structuredClone({ ...NEUTRAL, ...next }));
}

/** Small preview of a look on the given image (GPU when needed). */
function useThumbs(assetId: string | undefined, looks: { id: string; grade: ColorAdjust }[], luts: Lut[]) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const key = looks.map((l) => l.id).join(',');
  useEffect(() => {
    if (!assetId) return;
    let live = true;
    void media.ensureImage(assetId).then((img) => {
      if (!live || !img) return;
      const w = 112, h = 63;
      const out: Record<string, string> = {};
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      for (const l of looks) {
        g.clearRect(0, 0, w, h);
        const src = needsGpu(l.grade) ? gradeDrawable(img, w, h, l.grade, luts) : undefined;
        g.filter = src ? 'none' : cssFilter(l.grade);
        g.drawImage(src ?? img, 0, 0, w, h);
        g.filter = 'none';
        drawVignette(g, w, h, l.grade.vignette ?? 0);
        out[l.id] = c.toDataURL('image/jpeg', 0.8);
      }
      setThumbs(out);
    });
    return () => void (live = false);
  }, [assetId, key, luts.length]);
  return thumbs;
}

export function GradeEditor({ value, onChange, scope, previewAssetId, onPasteAll }: {
  value: ColorAdjust;
  onChange: (fn: (g: ColorAdjust) => void, key?: string) => void;
  scope: 'project' | 'clip';
  previewAssetId?: string;
  onPasteAll?: () => void;
}) {
  const luts = useEditor((s) => s.project!.luts ?? []);
  const update = useEditor((s) => s.update);
  const [saved, setSaved] = useState<SavedLook[]>(loadLooks);
  const all: { id: string; name: string; grade: ColorAdjust; lut?: Lut }[] = [...LOOKS, ...saved];
  const thumbs = useThumbs(previewAssetId, all, [...luts, ...saved.flatMap((s) => (s.lut ? [s.lut] : []))]);
  const g = { ...NEUTRAL, ...value };
  const set = (k: keyof ColorAdjust, v: number) => onChange((x) => void ((x as unknown as Record<string, unknown>)[k] = v), `grade-${scope}-${k}`);
  /** Make sure a look's LUT is stored in the project before using it. */
  const ensureLut = (lut?: Lut) => lut && !luts.some((l) => l.id === lut.id) && update((d) => void (d.luts = [...(d.luts ?? []), lut]));
  const apply = (grade: ColorAdjust, lut?: Lut) => (ensureLut(lut), onChange((x) => replace(x, grade)));

  const importLut = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    try {
      const lut: Lut = { id: uid(), ...parseCube(await f.text(), f.name.replace(/\.cube$/i, '')) };
      update((d) => void (d.luts = [...(d.luts ?? []), lut]));
      onChange((x) => void ((x.lut = lut.id), (x.lutAmount = 1)));
      toast(`LUT “${lut.name}” loaded (${lut.size}³)`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const copy = () => {
    const lut = luts.find((l) => l.id === g.lut);
    localStorage.setItem(CLIP_KEY, JSON.stringify({ grade: g, lut }));
    toast('Grade copied', 'info');
  };
  const paste = () => {
    const c = JSON.parse(localStorage.getItem(CLIP_KEY) ?? 'null') as { grade: ColorAdjust; lut?: Lut } | null;
    if (!c) return toast('Copy a grade first', 'info');
    apply(c.grade, c.lut);
  };
  const save = () => {
    const name = prompt('Name this look', 'My look');
    if (!name) return;
    const lut = luts.find((l) => l.id === g.lut);
    const next = [...saved, { id: uid(), name, grade: structuredClone(g), lut }];
    setSaved(next);
    localStorage.setItem(LOOKS_KEY, JSON.stringify(next));
    toast(`Saved look “${name}” — available in every project`, 'ok');
  };
  const remove = (id: string) => {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    localStorage.setItem(LOOKS_KEY, JSON.stringify(next));
  };

  return (
    <>
      <Section title={scope === 'project' ? 'Looks (whole video)' : 'Looks (this clip)'} hint={scope === 'clip' ? 'Added on top of the whole-video grade.' : 'Applied to every clip; clips can add their own grade on top.'}>
        <div className="looks">
          {all.map((l) => (
            <button key={l.id} className="look" onClick={() => apply(l.grade, l.lut)} title={l.name}>
              {thumbs[l.id] ? <img src={thumbs[l.id]} alt="" /> : <i />}
              <span>{l.name}</span>
              {saved.some((s) => s.id === l.id) && <em onClick={(e) => (e.stopPropagation(), remove(l.id))} title="Delete look">×</em>}
            </button>
          ))}
        </div>
        <div className="row wrap">
          <button className="btn sm ghost" onClick={copy}><Icon name="copy" /> Copy grade</button>
          <button className="btn sm ghost" onClick={paste}><Icon name="paste" /> Paste</button>
          {onPasteAll && <button className="btn sm ghost" onClick={onPasteAll} title="Give every clip this clip's grade">Apply to all clips</button>}
          <button className="btn sm ghost" onClick={save}><Icon name="plus" /> Save look</button>
          <button className="btn sm ghost" onClick={() => apply(NEUTRAL)}>Reset</button>
        </div>
      </Section>
      <Section title="Light">
        <Slider label="Exposure" value={g.exposure ?? 0} min={-2} max={2} step={0.05} onChange={(v) => set('exposure', v)} fmt={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`} />
        <Slider label="Brightness" value={g.brightness} min={0.5} max={1.5} onChange={(v) => set('brightness', v)} />
        <Slider label="Contrast" value={g.contrast} min={0.5} max={1.6} onChange={(v) => set('contrast', v)} />
        <Slider label="Highlights" value={g.highlights ?? 0} min={-1} max={1} onChange={(v) => set('highlights', v)} />
        <Slider label="Shadows" value={g.shadows ?? 0} min={-1} max={1} onChange={(v) => set('shadows', v)} />
      </Section>
      <Section title="Colour">
        <Slider label="Temperature" value={g.temperature ?? 0} min={-1} max={1} onChange={(v) => set('temperature', v)} fmt={(v) => (v > 0.02 ? `warm ${Math.round(v * 100)}` : v < -0.02 ? `cool ${Math.round(-v * 100)}` : '0')} />
        <Slider label="Tint" value={g.tint ?? 0} min={-1} max={1} onChange={(v) => set('tint', v)} fmt={(v) => (v > 0.02 ? `magenta ${Math.round(v * 100)}` : v < -0.02 ? `green ${Math.round(-v * 100)}` : '0')} />
        <Slider label="Saturation" value={g.saturation} min={0} max={2} onChange={(v) => set('saturation', v)} />
        <Slider label="Vibrance" value={g.vibrance ?? 0} min={-1} max={1} onChange={(v) => set('vibrance', v)} />
        <Slider label="Split tone" value={g.split ?? 0} min={-1} max={1} onChange={(v) => set('split', v)} fmt={(v) => (v > 0.02 ? 'teal / orange' : v < -0.02 ? 'orange / teal' : 'off')} />
      </Section>
      <Section title="Style & LUT">
        <Slider label="Fade (matte)" value={g.fade ?? 0} min={0} max={1} onChange={(v) => set('fade', v)} />
        <Slider label="Vignette" value={g.vignette ?? 0} min={0} max={1} onChange={(v) => set('vignette', v)} />
        <div className="row wrap">
          <select value={g.lut ?? ''} onChange={(e) => onChange((x) => void (x.lut = e.target.value || undefined))}>
            <option value="">No LUT</option>
            {luts.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.size}³)</option>)}
          </select>
          <FilePick className="btn sm ghost" accept=".cube" onFiles={importLut}><Icon name="upload" /> Import .cube</FilePick>
        </div>
        {g.lut && <Slider label="LUT strength" value={g.lutAmount ?? 1} min={0} max={1} onChange={(v) => set('lutAmount', v)} fmt={(v) => `${Math.round(v * 100)}%`} />}
        <p className="hint">LUTs are .cube files from Resolve, Premiere, LUT packs or camera makers (3D only). They are stored inside the project.</p>
      </Section>
    </>
  );
}
