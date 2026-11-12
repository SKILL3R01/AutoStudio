/** Visual pickers for characters (pose, face, wear), sets, props and bubbles — thumbnails drawn live by the engine. */
import type { MotionItem, MotionPalette } from '../../motion/types';
import { FACES, POSES, POSE_LABEL, PROPS, SETS, SET_LABEL, poseKeys, type PoseKey } from '../../motion/characters/stick';
import { LiveThumb, makeGroup } from './LiveThumb';
import { Toggle } from '../../components/ui';

const LAND = { w: 1920, h: 1080 };
const bg = (pal: MotionPalette): MotionItem => ({ id: 'bg', type: 'background', kind: 'flat', colors: [pal.bg], start: 0, dur: 3 });
const fig = (o: Partial<MotionItem>, pal: MotionPalette): MotionItem => ({ id: 'c', type: 'widget', widget: 'character', start: 0, dur: 3, size: 900, y: 0, accent: pal.accents[0], ...o }) as MotionItem;
/** A close-up on the head (faces, wear). */
const head = (o: Partial<MotionItem>, pal: MotionPalette) => fig({ size: 2600, y: 0.285 * 2600, ...o }, pal);
const WEAR = ['', 'tie', 'scarf', 'hat', 'cap', 'glasses', 'ponytail'];
const FACE_LABEL: Record<string, string> = { neutral: 'Calm', happy: 'Happy', sad: 'Sad', angry: 'Angry', surprised: 'Surprised', thinking: 'Thinking', worried: 'Worried' };

type Set = (fn: (x: MotionItem) => void, k?: string) => void;

/** The pose key active at local time t (index), or -1 for a single `pose`. */
function activeKey(it: MotionItem, t: number) {
  if (!Array.isArray(it.poses) || !it.poses.length) return -1;
  const ks = poseKeys(it);
  let i = 0;
  while (i + 1 < ks.length && ks[i + 1].t <= t) i++;
  return i;
}

export function CharacterFields({ it, pal, set, localT }: { it: MotionItem; pal: MotionPalette; set: Set; localT: number }) {
  const ki = activeKey(it, localT), keys = poseKeys(it), cur = keys[Math.max(0, ki)];
  const setKey = (fn: (k: PoseKey) => void) => set((x) => {
    if (ki < 0) {
      const k: PoseKey = { t: 0, pose: String(x.pose ?? 'stand'), face: typeof x.face === 'string' ? x.face : undefined };
      fn(k);
      x.pose = k.pose;
      if (k.face) x.face = k.face;
      return;
    }
    const ks = poseKeys(x);
    fn(ks[ki]);
    x.poses = ks;
  });
  const tile = (key: string, label: string, item: MotionItem, on: boolean, pick: () => void, w = 84, h = 64) => (
    <LiveThumb key={key} width={w} height={h} className={on ? 'on' : ''} title={label} onClick={pick} group={makeGroup([bg(pal), item], LAND, pal, 3)}>
      <span className="thumb-label">{label}</span>
    </LiveThumb>
  );
  return (
    <>
      <label className="lbl">Pose {keys.length > 1 && <span className="hint">— changes the pose playing at the playhead ({ki + 1} of {keys.length})</span>}</label>
      <div className="look-grid">{POSES.map((p) => tile(p, POSE_LABEL[p], fig({ pose: p, wear: it.wear, facing: it.facing }, pal), cur.pose === p, () => setKey((k) => void ((k.pose = p), delete k.face))))}</div>
      <label className="lbl">Face</label>
      <div className="look-grid">{FACES.map((f) => tile(f, FACE_LABEL[f], head({ face: f, wear: it.wear }, pal), (cur.face ?? it.face) === f, () => setKey((k) => void (k.face = f)), 72, 54))}</div>
      <label className="lbl">Wear</label>
      <div className="look-grid">{WEAR.map((w) => tile(w || 'none', w || 'none', head({ wear: w, face: 'happy' }, pal), String(it.wear ?? '') === w, () => set((x) => void (w ? (x.wear = w) : delete x.wear)), 72, 54))}</div>
      <div className="row wrap">
        <button className="btn sm" onClick={() => set((x) => void (x.facing = Number(x.facing ?? 1) < 0 ? 1 : -1))}>⇋ Flip</button>
        <Toggle label="Talks (mouth follows the voice)" value={!!it.talk} onChange={(v) => set((x) => void (v ? (x.talk = true) : delete x.talk))} />
        <Toggle label="Rim light" value={it.rim !== false} onChange={(v) => set((x) => void (v ? delete x.rim : (x.rim = false)))} />
      </div>
      <button className="btn sm ghost" onClick={() => set((x) => {
        const ks = poseKeys(x);
        ks.push({ t: Math.max(0, Math.round(localT * 10) / 10), pose: cur.pose === 'stand' ? 'point' : 'stand' });
        x.poses = ks.sort((a, b) => a.t - b.t).filter((k, i, a) => i === 0 || k.t !== a[i - 1].t);
        delete x.pose;
      })}>+ Change pose at the playhead</button>
    </>
  );
}

export function SetTiles({ it, pal, set }: { it: MotionItem; pal: MotionPalette; set: Set }) {
  return (
    <div className="look-grid">
      {SETS.map((k) => (
        <LiveThumb key={k} width={112} height={63} className={it.kind === k ? 'on' : ''} title={SET_LABEL[k]} onClick={() => set((x) => void (x.kind = k))}
          group={makeGroup([bg(pal), { id: 's', type: 'widget', widget: 'set', kind: k, start: 0, dur: 3 } as MotionItem, fig({ size: 560, y: 0.3 * 1080 - 280, pose: 'stand' }, pal)], LAND, pal, 3)}>
          <span className="thumb-label">{SET_LABEL[k]}</span>
        </LiveThumb>
      ))}
    </div>
  );
}

export function PropTiles({ it, pal, set }: { it: MotionItem; pal: MotionPalette; set: Set }) {
  return (
    <div className="look-grid">
      {PROPS.map((k) => (
        <LiveThumb key={k} width={72} height={54} className={it.kind === k ? 'on' : ''} title={k} onClick={() => set((x) => void (x.kind = k))}
          group={makeGroup([bg(pal), { id: 'p', type: 'widget', widget: 'prop', kind: k, size: 700, start: 0, dur: 3 } as MotionItem], LAND, pal, 3)}>
          <span className="thumb-label">{k}</span>
        </LiveThumb>
      ))}
    </div>
  );
}

export function BubbleTiles({ it, pal, set }: { it: MotionItem; pal: MotionPalette; set: Set }) {
  return (
    <div className="look-grid">
      {(['speech', 'thought'] as const).map((k) => (
        <LiveThumb key={k} width={96} height={54} className={String(it.kind ?? 'speech') === k ? 'on' : ''} title={k} onClick={() => set((x) => void (x.kind = k))}
          group={makeGroup([bg(pal), { id: 'b', type: 'widget', widget: 'bubble', kind: k, text: k === 'speech' ? 'Hello!' : 'Hmm…', w: 900, h: 420, size: 110, tail: [-200, 400], start: 0, dur: 3 } as MotionItem], LAND, pal, 3)}>
          <span className="thumb-label">{k}</span>
        </LiveThumb>
      ))}
    </div>
  );
}
