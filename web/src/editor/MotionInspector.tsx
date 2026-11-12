/** Properties for a Motion AI block and its layers. */
import { useEditor } from '../store';
import { useProject } from './hooks';
import { Section, Seg, Slider, Toggle } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/Toast';
import { fmtTime } from '../lib/util';
import { layerLabel, motionRef, removeMotion, splitGroup, stretchGroup } from '../motion/edit';
import { AnimationTiles, FontStrip, SwatchRow, WidgetSwap } from './pickers/pickers';
import { BubbleTiles, CharacterFields, PropTiles, SetTiles } from './pickers/CharacterPickers';
import type { MotionGroup, MotionItem, MotionPalette } from '../motion/types';

const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : d);

export function MotionInspector({ id }: { id: string }) {
  const p = useProject();
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const time = useEditor((s) => s.time);
  const { g, it } = motionRef(p, id);
  if (!g) return <p className="hint">This motion block no longer exists.</p>;
  const setG = (fn: (x: MotionGroup) => void, k?: string) => update((d) => fn(d.motion!.find((x) => x.id === g.id)!), k);
  const setI = (fn: (x: MotionItem) => void, k?: string) => update((d) => fn(d.motion!.find((x) => x.id === g.id)!.items.find((x) => x.id === it!.id)!), k);
  const place = g.placement === 'band' ? (g.band?.side === 'bottom' ? 'band-bottom' : 'band-top') : g.placement;
  const lt = time - g.start;
  return (
    <>
      <Section title="Motion block" help="motion-props">
        <label className="field"><span>Name</span><input value={g.name} onChange={(e) => setG((x) => void (x.name = e.target.value), 'mgname')} /></label>
        <p className="hint">{fmtTime(g.start)} → {fmtTime(g.start + g.dur)} · {g.items.length} layers</p>
        <Seg options={[['full', 'Full frame'], ['overlay', 'Over video'], ['band-top', 'Top band'], ['band-bottom', 'Bottom band']] as const} value={place}
          onChange={(v) => setG((x) => {
            x.placement = v.startsWith('band') ? 'band' : (v as 'full' | 'overlay');
            x.band = v.startsWith('band') ? { side: v === 'band-bottom' ? 'bottom' : 'top', h: x.band?.h ?? 0.5 } : undefined;
          })} />
        {g.placement === 'band' && <Slider label="Band height" value={(g.band?.h ?? 0.5) * 100} min={25} max={75} step={1} suffix="%" onChange={(v) => setG((x) => void (x.band = { side: x.band?.side ?? 'top', h: v / 100 }), 'mgband')} />}
        <Slider label="Length" value={g.dur} min={0.5} max={Math.max(60, g.dur * 2)} step={0.1} suffix=" s" onChange={(v) => setG((x) => stretchGroup(x, v), 'mgdur')} />
        <div className="row wrap">
          <label className="field"><span>Background</span><input type="color" value={hex(g.palette.bg, '#111111')} onChange={(e) => setG((x) => void (x.palette.bg = e.target.value), 'mgpal')} /></label>
          <label className="field"><span>Text</span><input type="color" value={hex(g.palette.text, '#ffffff')} onChange={(e) => setG((x) => void (x.palette.text = e.target.value), 'mgpal')} /></label>
          {g.palette.accents.slice(0, 3).map((c, k) => (
            <label key={k} className="field"><span>Accent {k + 1}</span><input type="color" value={hex(c, '#ff6b4a')} onChange={(e) => setG((x) => void (x.palette.accents[k] = e.target.value), 'mgpal')} /></label>
          ))}
        </div>
        <label className="lbl">Font for all texts</label>
        <FontStrip value={g.palette.font} sample={String(g.items.find((i) => i.type === 'text')?.text ?? g.name)} onPick={(f) => setG((x) => (x.items.forEach((i) => i.type === 'text' && (i.font = f)), (x.palette.font = f)))} />
        <div className="row wrap">
          <button className="btn sm" onClick={() => update((d) => void (splitGroup(d, g.id, time) || toast('Put the playhead inside the block to split it', 'info')))}><Icon name="split" /> Split at playhead</button>
          <button className="btn sm" onClick={() => setG((x) => void (x.hidden = !x.hidden))}>{g.hidden ? 'Show' : 'Hide'}</button>
          <button className="btn sm ghost" onClick={() => void navigator.clipboard.writeText(JSON.stringify({ autoStudioRecipe: 1, palette: g.palette, items: g.items })).then(() => toast('Recipe copied — paste it into the AI chat to ask for changes', 'ok'))}><Icon name="copy" /> Copy recipe</button>
          <button className="btn sm ghost" onClick={() => (update((d) => removeMotion(d, g.id)), select(null))}><Icon name="trash" /> Delete</button>
        </div>
      </Section>
      <Section title={`Layers (${g.items.length})`}>
        <div className="mgfx-layers">
          {[...g.items].reverse().map((x) => {
            const live = lt >= x.start && lt < x.start + x.dur;
            return (
              <button key={x.id} className={`mgfx-layer ${it?.id === x.id ? 'on' : ''}`} style={{ opacity: live ? 1 : 0.55 }} onClick={() => (select({ kind: 'motion', id: `${g.id}/${x.id}` }), !live && useEditor.getState().seek(g.start + x.start + Math.min(0.8, x.dur / 2)))}>
                {layerLabel(x)}<small>{x.start.toFixed(1)}–{(x.start + x.dur).toFixed(1)}s</small>
              </button>
            );
          })}
        </div>
        <p className="hint">Top of the list = in front. Click a layer to edit it; the playhead jumps to it.</p>
      </Section>
      {it && <LayerEditor key={it.id} it={it} pal={g.palette} localT={time - g.start - it.start} set={setI} remove={() => (update((d) => removeMotion(d, `${g.id}/${it.id}`)), select({ kind: 'motion', id: g.id }))} />}
    </>
  );
}

function LayerEditor({ it, set, remove, pal, localT = 0 }: { it: MotionItem; set: (fn: (x: MotionItem) => void, k?: string) => void; remove: () => void; pal?: MotionPalette; localT?: number }) {
  const num = (k: keyof MotionItem, d = 0) => (typeof it[k] === 'number' ? (it[k] as number) : d);
  return (
    <Section title={`Layer · ${layerLabel(it)}`} help={it.type === 'widget' && ['character', 'set', 'prop', 'bubble'].includes(String(it.widget)) ? 'characters' : undefined}>
      {it.type === 'text' && (
        <>
          <label className="field"><span>Text</span><textarea rows={2} value={String(it.text ?? '')} onChange={(e) => set((x) => void (x.text = e.target.value), 'mgtext')} /></label>
          <div className="row wrap">
            <label className="field"><span>Colour</span><input type="color" value={hex(it.color, '#ffffff')} onChange={(e) => set((x) => void (x.color = e.target.value), 'mgcol')} /></label>
          </div>
          <label className="lbl">Font</label>
          <FontStrip value={String(it.font ?? '')} sample={String(it.text ?? '')} onPick={(f) => set((x) => void (x.font = f))} />
          <Slider label="Size" value={num('size', 80)} min={16} max={260} step={1} onChange={(v) => set((x) => void (x.size = v), 'mgsize')} />
          <Slider label="Weight" value={Number(it.weight ?? 800)} min={300} max={900} step={100} onChange={(v) => set((x) => void (x.weight = v), 'mgw')} />
          <label className="field"><span>Key words (comma separated)</span><input value={Array.isArray(it.highlight) ? (it.highlight as { word: string }[]).map((h) => h.word).join(', ') : ''}
            onChange={(e) => set((x) => {
              const old = Array.isArray(x.highlight) ? (x.highlight as { word: string; style?: string }[]) : [];
              x.highlight = e.target.value.split(',').map((w) => w.trim()).filter(Boolean).map((w) => old.find((h) => h.word === w) ?? { word: w, style: old[0]?.style ?? 'marker', at: 0.6 });
            }, 'mghl')} /></label>
          {Array.isArray(it.highlight) && (it.highlight as unknown[]).length > 0 && (
            <>
              <label className="lbl">Key word style</label>
              <SwatchRow type="keyword" colors={['#141826']} value={String((it.highlight as { style?: string }[])[0].style ?? 'marker')} onPick={(v) => set((x) => (x.highlight as { style?: string }[]).forEach((h) => (h.style = v)))} />
            </>
          )}
        </>
      )}
      {(it.type === 'shape' || it.type === 'icon') && <label className="field"><span>Colour</span><input type="color" value={hex(it.color, '#ff6b4a')} onChange={(e) => set((x) => void (x.color = e.target.value), 'mgcol')} /></label>}
      {it.type === 'background' && (
        <>
          <label className="lbl">Background</label>
          <SwatchRow type="background" colors={(it.colors as string[] | undefined) ?? ['#111111', '#333333']} value={String(it.kind ?? 'flat')} onPick={(v) => set((x) => void (x.kind = v))} />
          <div className="row wrap">
            {[0, 1].map((k) => (
              <label key={k} className="field"><span>Colour {k + 1}</span><input type="color" value={hex((it.colors as string[] | undefined)?.[k], k ? '#333333' : '#111111')}
                onChange={(e) => set((x) => { const c = [...((x.colors as string[]) ?? [])]; c[k] = e.target.value; x.colors = c; }, 'mgbg')} /></label>
            ))}
          </div>
        </>
      )}
      <Slider label="Starts at" value={it.start} min={0} max={Math.max(it.start + 5, 30)} step={0.05} suffix=" s" onChange={(v) => set((x) => void (x.start = v), 'mgst')} />
      <Slider label="Duration" value={it.dur} min={0.1} max={Math.max(it.dur * 2, 10)} step={0.05} suffix=" s" onChange={(v) => set((x) => void (x.dur = v), 'mgdu')} />
      {it.type !== 'background' && it.type !== 'light' && it.type !== 'camera' && (
        <>
          <div className="row wrap">
            <Slider label="X" value={num('x')} min={-1000} max={1000} step={1} onChange={(v) => set((x) => void (x.x = v), 'mgx')} />
            <Slider label="Y" value={num('y')} min={-1000} max={1000} step={1} onChange={(v) => set((x) => void (x.y = v), 'mgy')} />
          </div>
          <Slider label="Scale" value={num('scale', 1)} min={0.1} max={4} step={0.01} onChange={(v) => set((x) => void (x.scale = v), 'mgsc')} />
          <Slider label="Rotation" value={num('rotation')} min={-180} max={180} step={1} suffix="°" onChange={(v) => set((x) => void (x.rotation = v), 'mgrot')} />
          <Slider label="Opacity" value={num('opacity', 1) * 100} min={0} max={100} step={1} suffix="%" onChange={(v) => set((x) => void (x.opacity = v / 100), 'mgop')} />
          <label className="lbl">Enter <span className="hint">— hover to play</span></label>
          <AnimationTiles kind="in" text={it.type === 'text'} value={it.in as string | undefined} onPick={(v) => set((x) => void (x.in = v))} />
          <label className="lbl">Exit</label>
          <AnimationTiles kind="out" text={it.type === 'text'} value={it.out as string | undefined} onPick={(v) => set((x) => void (x.out = v))} />
          <label className="lbl">Loop</label>
          <AnimationTiles kind="loop" value={it.loop as string | undefined} onPick={(v) => set((x) => void (x.loop = v))} />
        </>
      )}
      {it.type === 'widget' && pal && it.widget === 'character' && <CharacterFields it={it} pal={pal} set={set} localT={localT} />}
      {it.type === 'widget' && pal && it.widget === 'set' && (<><label className="lbl">Set</label><SetTiles it={it} pal={pal} set={set} /></>)}
      {it.type === 'widget' && pal && it.widget === 'prop' && (<><label className="lbl">Prop</label><PropTiles it={it} pal={pal} set={set} /></>)}
      {it.type === 'widget' && pal && it.widget === 'bubble' && (<><label className="lbl">Bubble</label><BubbleTiles it={it} pal={pal} set={set} /></>)}
      {it.type === 'widget' && <WidgetFields it={it} set={set} />}
      {it.type === 'widget' && pal && (
        <>
          <label className="lbl">Swap for <span className="hint">— same content</span></label>
          <WidgetSwap it={it} pal={pal} onPick={(next) => set((x) => { for (const k of Object.keys(x)) if (!['id', 'type', 'start', 'dur'].includes(k)) delete (x as Record<string, unknown>)[k]; Object.assign(x, next); })} />
        </>
      )}
      <Toggle label="Hidden" value={num('opacity', 1) === 0} onChange={(v) => set((x) => void (x.opacity = v ? 0 : 1))} />
      <button className="btn sm ghost" onClick={remove}><Icon name="trash" /> Delete layer</button>
    </Section>
  );
}

const NL = String.fromCharCode(10);
const TEXT_FIELDS = ['title', 'gold', 'sub', 'text', 'key', 'value', 'label', 'delta', 'name', 'tagline', 'role', 'placeholder', 'button', 'caption', 'vs', 'asset'];
const NUM_FIELDS = ['size', 'w', 'h', 'count', 'press', 'markAt', 'tiltDeg', 'spread'];
/** Edit a widget's own fields: texts, numbers, list items (one per line), values and colours. */
function WidgetFields({ it, set }: { it: MotionItem; set: (fn: (x: MotionItem) => void, k?: string) => void }) {
  const list = (k: string) => (Array.isArray(it[k]) ? (it[k] as unknown[]) : null);
  const itemText = (v: unknown) => (typeof v === 'string' ? v : v && typeof v === 'object' ? String((v as { title?: string; text?: string }).title ?? (v as { text?: string }).text ?? '') : String(v));
  const setList = (k: string, lines: string[]) => set((x) => {
    const old = Array.isArray(x[k]) ? (x[k] as unknown[]) : [];
    x[k] = lines.map((l, i) => {
      const o = old[i];
      if (o && typeof o === 'object') return 'title' in (o as object) ? { ...(o as object), title: l } : { ...(o as object), text: l };
      return typeof old[0] === 'number' ? Number(l) || 0 : l;
    });
  }, `mgl${k}`);
  return (
    <>
      <p className="hint">Widget “{String(it.widget)}”</p>
      {TEXT_FIELDS.filter((k) => typeof it[k] === 'string').map((k) => (
        <label key={k} className="field"><span>{k}</span><input value={String(it[k])} onChange={(e) => set((x) => void (x[k] = e.target.value), `mgf${k}`)} /></label>
      ))}
      {NUM_FIELDS.filter((k) => typeof it[k] === 'number').map((k) => (
        <label key={k} className="field"><span>{k}</span><input type="number" value={Number(it[k])} onChange={(e) => set((x) => void (x[k] = Number(e.target.value)), `mgn${k}`)} /></label>
      ))}
      {['items', 'lines', 'values', 'labels', 'messages', 'highlight'].filter((k) => list(k)).map((k) => (
        <label key={k} className="field"><span>{k} (one per line)</span>
          <textarea rows={Math.min(6, list(k)!.length + 1)} value={list(k)!.map(itemText).join(NL)} onChange={(e) => setList(k, e.target.value.split(NL))} /></label>
      ))}
      {(['left', 'right'] as const).filter((k) => it[k] && typeof it[k] === 'object').map((k) => {
        const side = it[k] as { title?: string; items?: string[] };
        return (
          <label key={k} className="field"><span>{k}: title, then items</span>
            <textarea rows={4} value={[side.title ?? '', ...(side.items ?? [])].join(NL)} onChange={(e) => set((x) => { const [title, ...items] = e.target.value.split(NL); x[k] = { title, items }; }, `mgs${k}`)} /></label>
        );
      })}
      {typeof it.color === 'string' && <label className="field"><span>Accent</span><input type="color" value={hex(it.color, '#ff6b4a')} onChange={(e) => set((x) => void (x.color = e.target.value), 'mgwc')} /></label>}
      {Array.isArray(it.colors) && (
        <div className="row wrap">
          {(it.colors as string[]).slice(0, 4).map((c, i) => (
            <label key={i} className="field"><span>Colour {i + 1}</span><input type="color" value={hex(c, '#ffffff')} onChange={(e) => set((x) => { const cs = [...(x.colors as string[])]; cs[i] = e.target.value; x.colors = cs; }, 'mgwcs')} /></label>
          ))}
        </div>
      )}
    </>
  );
}
