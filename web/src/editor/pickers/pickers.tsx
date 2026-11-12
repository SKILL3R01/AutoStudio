/** Visual pickers (design rule: thumbnails, animated when they move — never dropdowns for things with a look). */
import { useMemo, useState } from 'react';
import { LiveThumb, makeGroup } from './LiveThumb';
import { useEditor } from '../../store';
import { toast } from '../../components/Toast';
import { getKit, variantOf } from '../../motion/styles';
import type { SceneCtx, Slots, StyleKit } from '../../motion/styles/types';
import { autoSlots, frameOf, type Scene } from '../../motion/story/model';
import { LUCIDE } from '../../motion/lucide';
import { MOTION_FONTS, TEXT_INS, TEXT_OUTS, LOOPS, ITEM_INS, BG_KINDS } from '../../motion/prompt';
import type { MotionGroup, MotionItem, MotionPalette } from '../../motion/types';
import type { Project } from '../../types';

const LAND = { w: 1920, h: 1080 };
const ctxOf = (frame: { w: number; h: number }, pal: MotionPalette, font: string, dur: number, k = 0, images: string[] = []): SceneCtx => ({ dur, frame, pal, font, k, keyAt: 0.7, last: false, images });

/** A style's animated card scene: its three preview designs one after another. */
export function stylePreview(kit: StyleKit, variantId?: string, frame = LAND, images: string[] = []): MotionGroup {
  const pal = variantOf(kit, variantId).palette, D = 2.6;
  if (kit.status !== 'ready' || !kit.templates.length) return makeGroup(kit.frameScene([], ctxOf(frame, pal, kit.font, 4)), frame, pal, 4);
  const items: MotionItem[] = [];
  kit.preview.forEach((pv, i) => {
    const tpl = kit.templates.find((t) => t.id === pv.template) ?? kit.templates[i % kit.templates.length];
    const c = ctxOf(frame, pal, kit.font, D, i, images);
    c.last = i === kit.preview.length - 1;
    for (const it of kit.frameScene(tpl.build(pv.slots, c), c)) items.push({ ...it, start: it.start + i * D, id: `${it.id}_${i}` });
  });
  return makeGroup(items, frame, pal, D * kit.preview.length);
}

export function StyleCard({ kit, variantId, on, onPick, onVariant }: { kit: StyleKit; variantId?: string; on: boolean; onPick: () => void; onVariant: (id: string) => void }) {
  const group = useMemo(() => stylePreview(kit, variantId), [kit, variantId]);
  const soon = kit.status !== 'ready';
  return (
    <div className={`style-card ${on ? 'on' : ''} ${soon ? 'soon' : ''}`} data-style={kit.id}>
      <LiveThumb group={group} width={320} height={180} autoplay={on} onClick={soon ? undefined : onPick} title={soon ? `${kit.name} — coming soon` : `Use ${kit.name}`} />
      <div className="style-card-body">
        <b>{kit.name}{soon && <span className="chip soon">soon</span>}</b>
        <span className="hint">{kit.description}</span>
        <div className="style-includes">{kit.includes.map((x) => <span key={x}>{x}</span>)}</div>
        {kit.variants.length > 1 && (
          <div className="swatches" role="radiogroup" aria-label="Colour variant">
            {kit.variants.map((v) => (
              <button key={v.id} className={`swatch ${variantOf(kit, variantId).id === v.id ? 'on' : ''}`} title={v.name} aria-label={v.name} onClick={() => onVariant(v.id)}
                style={{ background: `linear-gradient(135deg, ${v.palette.bg} 0 50%, ${v.palette.accents[0]} 50% 75%, ${v.palette.accents[1] ?? v.palette.text} 75%)` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One scene's alternatives: every design of the style, filled with THIS scene's words (matching ones first). */
export function TemplateStrip({ p, scene, onPick }: { p: Project; scene: Scene; onPick: (id: string) => void }) {
  const st = p.story!;
  const kit = getKit(st.styleId), pal = variantOf(kit, st.variantId).palette, frame = frameOf(p);
  const images = p.assets.filter((a) => a.kind === 'image').map((a) => a.id);
  const ordered = [...kit.templates].sort((a, b) => Number(b.fits.some((f) => scene.hints.includes(f as never))) - Number(a.fits.some((f) => scene.hints.includes(f as never))));
  const portrait = frame.h > frame.w;
  return (
    <div className="tpl-strip">
      {ordered.map((t) => {
        const build = () => {
          const c = ctxOf(frame, pal, kit.font, Math.max(2, scene.end - scene.start), 0, images);
          return makeGroup(kit.frameScene(t.build(autoSlots({ ...scene, slots: t.id === scene.templateId ? scene.slots : {} }, t), c), c), frame, pal, c.dur);
        };
        return (
          <LiveThumb key={t.id} group={build} width={portrait ? 108 : 192} height={portrait ? 192 : 108} className={t.id === scene.templateId ? 'on' : ''} title={`${t.name} — ${t.describe}`} onClick={() => onPick(t.id)}>
            <span className="thumb-label">{t.name}</span>
          </LiveThumb>
        );
      })}
    </div>
  );
}

/** Enter / exit / loop animations played on a sample word. */
export function AnimationTiles({ kind, value, onPick, text }: { kind: 'in' | 'out' | 'loop'; value?: string; onPick: (v?: string) => void; text?: boolean }) {
  const pal = { bg: '#141826', card: '#20263a', text: '#ffffff', muted: '#9aa3b2', accents: ['#7c6cff', '#21c8e8'] };
  const list = kind === 'in' ? (text ? TEXT_INS : ITEM_INS) : kind === 'out' ? (text ? TEXT_OUTS : ['fade-out', 'zoom-out', 'slide-up-out', 'blur-out', 'shrink']) : LOOPS;
  return (
    <div className="anim-tiles">
      <button className={`anim-none ${!value ? 'on' : ''}`} onClick={() => onPick(undefined)}>None</button>
      {list.map((name) => {
        const it: MotionItem = text || kind === 'loop'
          ? { id: 'a', type: 'text', text: 'Motion', size: 220, weight: 900, color: '#ffffff', start: 0, dur: 2, [kind]: name }
          : { id: 'a', type: 'icon', name: 'sparkles', style: 'badge', color: '#7c6cff', size: 260, start: 0, dur: 2, [kind]: name };
        return (
          <LiveThumb key={name} group={makeGroup([{ id: 'bg', type: 'background', kind: 'flat', colors: [pal.bg], start: 0, dur: 2 }, it], LAND, pal, 2)} width={112} height={63} still={kind === 'out' ? 0.95 : 0.35} className={value === name ? 'on' : ''} title={name} onClick={() => onPick(name)}>
            <span className="thumb-label">{name.replace(/-/g, ' ')}</span>
          </LiveThumb>
        );
      })}
    </div>
  );
}

/** Transitions played between two mini frames. */
export function TransitionTiles({ value, onPick, pal }: { value?: string; onPick: (v: string) => void; pal: MotionPalette }) {
  return (
    <div className="anim-tiles">
      {['wipe', 'burst', 'slices', 'band-wipe'].map((id) => (
        <LiveThumb key={id} width={112} height={63} still={0.45} className={value === id ? 'on' : ''} title={id} onClick={() => onPick(id)}
          group={makeGroup([
            { id: 'a', type: 'background', kind: 'flat', colors: [pal.bg], start: 0, dur: 1.2 },
            { id: 'b', type: 'background', kind: 'flat', colors: [pal.accents[1] ?? pal.card], start: 1.2, dur: 1.2 },
            { id: 't', type: 'widget', widget: id, start: 0.7, dur: 1.1, colors: [pal.accents[0], pal.accents[1] ?? pal.card], dir: 'left' },
          ], LAND, pal, 2.4)}>
          <span className="thumb-label">{id.replace('-', ' ')}</span>
        </LiveThumb>
      ))}
    </div>
  );
}

/** Background kinds and key-word styles as small swatches. */
export function SwatchRow({ type, value, colors, onPick }: { type: 'background' | 'keyword'; value?: string; colors: string[]; onPick: (v: string) => void }) {
  const pal = { bg: colors[0] ?? '#111', card: colors[1] ?? '#222', text: '#ffffff', muted: '#999', accents: [colors[2] ?? '#ff6b4a', '#ffd23f'] };
  const list = type === 'background' ? BG_KINDS : ['marker', 'underline', 'circle', 'box', 'strike', 'color'];
  return (
    <div className="anim-tiles">
      {list.map((k) => (
        <LiveThumb key={k} width={96} height={54} still={0.9} className={value === k ? 'on' : ''} title={k} onClick={() => onPick(k)}
          group={makeGroup(type === 'background'
            ? [{ id: 'bg', type: 'background', kind: k, colors: [pal.bg, pal.card, pal.accents[0]], start: 0, dur: 2 }]
            : [{ id: 'bg', type: 'background', kind: 'flat', colors: ['#141826'], start: 0, dur: 2 }, { id: 't', type: 'text', text: 'key word', size: 240, weight: 900, color: '#fff', start: 0, dur: 2, highlight: [{ word: 'key', style: k, bg: '#ffd23f', color: '#ff6b4a', gradient: ['#fbe3a6', '#e8b86a'], at: 0 }] }], LAND, pal, 2)}>
          <span className="thumb-label">{k}</span>
        </LiveThumb>
      ))}
    </div>
  );
}

/** Your own text in each font. */
export function FontStrip({ value, sample, onPick }: { value?: string; sample?: string; onPick: (f: string) => void }) {
  const txt = (sample || 'Make it move').slice(0, 18);
  return (
    <div className="font-strip">
      {MOTION_FONTS.map((f) => (
        <button key={f} className={value === f ? 'on' : ''} style={{ fontFamily: `"${f}"` }} onClick={() => onPick(f)} title={f}>
          <span>{txt}</span><small>{f}</small>
        </button>
      ))}
    </div>
  );
}

/** Compatible widgets with the same content (fields carried over). */
const FAMILIES = [['stat', 'donut', 'chart-line', 'bars', 'progress'], ['checklist', 'steps', 'chips', 'cards'], ['headline', 'kinetic', 'say', 'quote', 'slam'], ['phone', 'chat', 'typing', 'window'], ['cutout', 'graph-panel']];
export function swapFields(it: MotionItem, to: string): MotionItem {
  const words = String(it.title ?? it.text ?? it.label ?? '');
  const items = Array.isArray(it.items) ? (it.items as unknown[]).map((x) => (typeof x === 'string' ? x : String((x as { title?: string }).title ?? ''))) : [];
  const value = String(it.value ?? '');
  const base: MotionItem = { id: it.id, type: 'widget', widget: to, start: it.start, dur: it.dur, x: it.x, y: it.y, scale: it.scale, in: it.in, color: it.color, palette: it.palette };
  switch (to) {
    case 'stat': return { ...base, value: value || '100%', label: String(it.label ?? words) };
    case 'donut': return { ...base, value: parseFloat(value) || 75, label: String(it.label ?? words) };
    case 'progress': return { ...base, value: parseFloat(value) || 70, label: String(it.label ?? words) };
    case 'chart-line': return { ...base, value, label: String(it.label ?? '').toUpperCase(), values: [2, 3, 2.6, 4.2, 3.8, 5.6, 8], delta: '+30%' };
    case 'bars': return { ...base, values: [35, 55, 48, 90], labels: items.slice(0, 4) };
    case 'checklist': case 'steps': return { ...base, items: items.length ? items : [words] };
    case 'chips': return { ...base, items: (items.length ? items : [words]).map((t) => ({ icon: t.toLowerCase().split(' ')[0], title: t })) };
    case 'cards': return { ...base, items: (items.length ? items : [words]).slice(0, 3).map((t) => ({ icon: t.toLowerCase().split(' ')[0], title: t })) };
    case 'headline': return { ...base, title: words || items.join(' '), gold: String(it.gold ?? it.key ?? '') };
    case 'kinetic': return { ...base, lines: [words || items.join(' ')] };
    case 'say': return { ...base, text: words };
    case 'quote': return { ...base, text: words, highlight: [] };
    case 'slam': return { ...base, text: words, key: String(it.gold ?? it.key ?? '') };
    case 'phone': case 'chat': return { ...base, messages: (items.length ? items : [words, '…']).map((t, i) => ({ text: t, me: i % 2 === 1 })) };
    case 'typing': return { ...base, text: words, button: 'Go' };
    case 'window': return { ...base, title: words, lines: items.length ? items : ['', '', '', ''] };
    case 'cutout': return { ...base, label: words };
    case 'graph-panel': return { ...base, title: words, value, items };
    default: return base;
  }
}
export function WidgetSwap({ it, pal, onPick }: { it: MotionItem; pal: MotionPalette; onPick: (next: MotionItem) => void }) {
  const fam = FAMILIES.find((f) => f.includes(String(it.widget)));
  if (!fam) return null;
  return (
    <div className="anim-tiles">
      {fam.filter((w) => w !== it.widget).map((w) => {
        const next = swapFields(it, w);
        return (
          <LiveThumb key={w} width={128} height={72} title={`Swap to ${w}`} onClick={() => onPick(next)}
            group={makeGroup([{ id: 'bg', type: 'background', kind: 'flat', colors: [pal.bg], start: 0, dur: 2.5 }, { ...next, x: 0, y: 0, start: 0, dur: 2.5, scale: 1 }], LAND, pal, 2.5)}>
            <span className="thumb-label">{w}</span>
          </LiveThumb>
        );
      })}
    </div>
  );
}

/* ---------- Add panel ---------- */
const SAMPLE: Record<string, Partial<MotionItem>> = {
  headline: { title: 'Make it move', gold: 'move', sub: 'YOUR KEY POINT' }, kinetic: { lines: ['Big idea', 'In two lines'], highlight: ['idea'] }, tag: { text: 'NEW' }, quote: { text: 'The best editor I used', name: 'Sara', highlight: ['best'] },
  stat: { value: '+1,200', label: 'viewers' }, donut: { value: 75, label: 'done' }, 'chart-line': { value: '$2.4M', label: 'REVENUE', delta: '+31%', values: [2, 3, 2.6, 4.2, 3.8, 5.6, 8] }, bars: { values: [35, 55, 48, 90], labels: ['Q1', 'Q2', 'Q3', 'Q4'] }, progress: { value: 64, label: 'Progress' },
  checklist: { items: ['Script', 'Voice', 'Motion'] }, steps: { items: ['Idea', 'Script', 'Video'] }, chips: { items: [{ icon: 'zap', title: 'Fast' }, { icon: 'heart', title: 'Simple' }] }, cards: { items: [{ icon: 'rocket', title: 'Launch' }, { icon: 'star', title: 'Shine' }, { icon: 'trophy', title: 'Win' }] },
  compare: { left: { title: 'Before', items: ['Slow', 'Hard'] }, right: { title: 'After', items: ['Fast', 'Easy'] }, palette: 'paper' },
  phone: { title: 'Chat', messages: [{ text: 'Ready?' }, { text: 'Yes!', me: true }] }, chat: { messages: [{ text: 'Hi!' }, { text: 'Hello', me: true }] }, typing: { text: 'Make my video pop', button: 'Go' }, window: { title: 'app', lines: ['', '', '', ''] }, button: { text: 'Subscribe', icon: 'bell' },
  arrow: { from: [-300, 150], to: [100, -60], bend: 0.3, color: '#d8342c' }, 'circle-draw': { w: 360, h: 160, color: '#d8342c' }, sparkles: { count: 8, spread: 260, at: [0.2] }, 'plus-badge': { text: '+1', icon: 'heart' }, starburst: { text: 'WOW!' }, 'click-pulse': { at: [0.3, 1.2] },
  cutout: { label: 'Your photo', w: 520, h: 360 }, slam: { text: 'Why it matters', key: 'matters' }, 'typewriter-tag': { text: 'LONDON, 1952' }, tally: { count: 7 }, 'graph-panel': { title: 'Notes', value: '3×' }, tape: { w: 220 },
};
const GROUPS: [string, string[]][] = [
  ['Text', ['headline', 'kinetic', 'tag', 'quote', 'slam', 'typewriter-tag']], ['Data', ['stat', 'donut', 'chart-line', 'bars', 'progress', 'tally']], ['Lists', ['checklist', 'steps', 'chips', 'cards', 'compare']],
  ['Screens', ['phone', 'chat', 'typing', 'window', 'button']], ['Callouts', ['arrow', 'circle-draw', 'sparkles', 'plus-badge', 'starburst', 'click-pulse']], ['Paper', ['cutout', 'graph-panel', 'tape']],
];
const SHAPES = ['roundrect', 'ellipse', 'ring', 'star', 'triangle', 'line'];
export const MOTION_MIME = 'application/x-motion-layer';

/** A new layer for the Add panel (sizes for a 1920×1080 frame; the block's camera / layout take it from there). */
export function newLayer(kind: 'widget' | 'icon' | 'shape', name: string): MotionItem {
  const id = `add_${Math.random().toString(36).slice(2, 8)}`;
  if (kind === 'icon') return { id, type: 'icon', name, style: 'badge', color: '#7c6cff', size: 140, start: 0, dur: 3, in: 'elastic-pop' };
  if (kind === 'shape') return { id, type: 'shape', shape: name, w: name === 'line' ? 500 : 300, h: name === 'line' ? 10 : 220, color: '#7c6cff', fill: name !== 'ring' && name !== 'line', lineWidth: 8, start: 0, dur: 3, in: 'pop' };
  return { id, type: 'widget', widget: name, start: 0, dur: 3, in: 'fade-in', ...(SAMPLE[name] ?? {}) } as MotionItem;
}

/** Add a layer at the playhead: into the scene / block playing there (or the selected one), else a new overlay block. */
export function addLayerAtPlayhead(item: MotionItem, at?: { x: number; y: number }) {
  const { project: p, time, update, select, selection } = useEditor.getState();
  if (!p) return;
  let ref = '';
  update((d) => {
    const selG = selection?.kind === 'motion' ? d.motion?.find((g) => g.id === selection.id.split('/')[0]) : undefined;
    const g = selG && time >= selG.start && time < selG.start + selG.dur ? selG : [...(d.motion ?? [])].reverse().find((x) => !x.hidden && time >= x.start && time < x.start + x.dur);
    const it = { ...item, x: at?.x ?? item.x ?? 0, y: at?.y ?? item.y ?? 0 };
    if (g) {
      it.start = Math.max(0, time - g.start);
      it.dur = Math.max(0.5, Math.min(it.dur, g.dur - it.start));
      g.items.push(it);
      ref = `${g.id}/${it.id}`;
    } else {
      const ng: MotionGroup = { id: `mg_add_${it.id}`, name: `Added ${String(item.widget ?? item.type)}`, start: time, dur: 4, placement: 'overlay', frame: frameOf(d), palette: getKit(d.story?.styleId).variants[0].palette, items: [{ ...it, start: 0, dur: 4 }] };
      (d.motion ??= []).push(ng);
      ref = `${ng.id}/${it.id}`;
    }
  });
  if (ref) select({ kind: 'motion', id: ref });
  toast('Added — drag it on the preview, double-click text to type', 'ok');
}

export function AddPanel({ pal }: { pal: MotionPalette }) {
  const [q, setQ] = useState('');
  const icons = useMemo(() => Object.keys(LUCIDE).filter((n) => !q || n.includes(q.toLowerCase())).slice(0, 60), [q]);
  const tile = (kind: 'widget' | 'icon' | 'shape', name: string, label: string, w = 128, h = 72) => {
    const it = newLayer(kind, name);
    return (
      <div key={`${kind}:${name}`} draggable onDragStart={(e) => e.dataTransfer.setData(MOTION_MIME, JSON.stringify(it))} className="add-tile">
        <LiveThumb width={w} height={h} title={`Add ${label} — click, or drag onto the preview`} onClick={() => addLayerAtPlayhead(newLayer(kind, name))}
          group={makeGroup([{ id: 'bg', type: 'background', kind: 'flat', colors: [pal.bg], start: 0, dur: 2.5 }, { ...it, start: 0, dur: 2.5, scale: kind === 'widget' ? 1 : 1.4 }], LAND, pal, 2.5)}>
          <span className="thumb-label">{label}</span>
        </LiveThumb>
      </div>
    );
  };
  return (
    <div className="add-panel">
      {GROUPS.map(([g, ws]) => (
        <div key={g}><h5>{g}</h5><div className="add-grid">{ws.map((w) => tile('widget', w, w.replace(/-/g, ' ')))}</div></div>
      ))}
      <div><h5>Shapes</h5><div className="add-grid">{SHAPES.map((s) => tile('shape', s, s, 96, 54))}</div></div>
      <div><h5>Icons</h5><input placeholder="Search icons (heart, money, clock…)" value={q} onChange={(e) => setQ(e.target.value)} /><div className="add-grid">{icons.map((n) => tile('icon', n, n, 72, 72))}</div></div>
    </div>
  );
}

export type { Slots };
