/**
 * Stick-figure characters (v5.2), drawn by the app: a 2D skeleton with blended poses, expressions, blinking, a mouth
 * that follows the narration, accessories and a cinematic rim light. Plus sets (backgrounds), props and speech /
 * thought bubbles. Widgets: character, set, prop, bubble.
 */
import type { MotionItem } from '../types';
import { type WidgetApi, arr, clamp, num as n, rnd, stepK as k, str } from '../widgets';

type W = (ctx: CanvasRenderingContext2D, it: MotionItem, t: number, a: WidgetApi) => void;
const D = Math.PI / 180;
/** Direction of a limb at angle a (0 = straight down, 90 = screen right, 180 = up). */
const dir = (a: number): [number, number] => [Math.sin(a * D), Math.cos(a * D)];

/* ---------- poses ---------- */
/** Absolute limb angles (deg) for a figure facing right; forearms / shins are relative to the upper limb. */
export interface Pose { lean: number; head: number; lu: number; ll: number; ru: number; rl: number; lt: number; ls: number; rt: number; rs: number; jump: number; slump: number }
const P0: Pose = { lean: 0, head: 0, lu: -12, ll: -4, ru: 12, rl: 4, lt: -7, ls: 0, rt: 7, rs: 0, jump: 0, slump: 0 };

export const POSES = ['stand', 'walk', 'run', 'point', 'present', 'think', 'talk', 'wave', 'celebrate', 'sad', 'shocked', 'shrug', 'sit'] as const;
export type PoseName = (typeof POSES)[number];
export const POSE_LABEL: Record<PoseName, string> = { stand: 'Stand', walk: 'Walk', run: 'Run', point: 'Point', present: 'Present', think: 'Think', talk: 'Talk', wave: 'Wave', celebrate: 'Celebrate', sad: 'Sad', shocked: 'Shocked', shrug: 'Shrug', sit: 'Sit' };
/** The face a pose suggests when none is given. */
export const POSE_FACE: Partial<Record<PoseName, Face>> = { celebrate: 'happy', wave: 'happy', sad: 'sad', shocked: 'surprised', think: 'thinking', shrug: 'worried', present: 'happy' };

export function poseOf(name: string, t: number): Pose {
  const s = Math.sin, ph = t * Math.PI * 2;
  switch (name as PoseName) {
    case 'walk': { const w = s(ph * 0.9); return { ...P0, lt: 24 * w, ls: -Math.max(0, -w) * 34, rt: -24 * w, rs: -Math.max(0, w) * 34, lu: -16 * w - 6, ll: 12, ru: 16 * w + 6, rl: 12, jump: Math.abs(w) * 0.012 }; }
    case 'run': { const w = s(ph * 1.5); return { ...P0, lean: 12, lt: 42 * w + 10, ls: -Math.max(0, -w) * 70 - 10, rt: -42 * w + 10, rs: -Math.max(0, w) * 70 - 10, lu: -38 * w, ll: 75, ru: 38 * w, rl: 75, jump: Math.abs(w) * 0.03 }; }
    case 'point': return { ...P0, lean: 3, head: 4, ru: 92 + s(ph * 0.5) * 2, rl: 0 };
    case 'present': return { ...P0, head: 3, ru: 58, rl: 28 + s(ph * 0.6) * 4 };
    case 'think': return { ...P0, head: 9 + s(ph * 0.3) * 2, ru: 22, rl: -152, lu: -10, ll: 70 };
    case 'talk': return { ...P0, head: s(ph * 0.7) * 3, lu: -28 + s(ph * 0.9) * 8, ll: -48 + s(ph * 1.3) * 10, ru: 30 + s(ph * 0.8 + 1) * 10, rl: 52 + s(ph * 1.1) * 12 };
    case 'wave': return { ...P0, head: 4, ru: 148, rl: s(ph * 1.6) * 28 };
    case 'celebrate': { const j = Math.abs(s(ph * 0.9)); return { ...P0, lu: -155 - j * 6, ll: -12, ru: 155 + j * 6, rl: 12, lt: -12, rt: 12, ls: -j * 20, rs: -j * 20, jump: j * 0.06 }; }
    case 'sad': return { ...P0, head: 16, lu: -4, ll: 0, ru: 4, rl: 0, lt: -5, rt: 5, slump: 1 };
    case 'shocked': { const sh = s(ph * 4) * 1.2; return { ...P0, lean: -6 + sh, lu: -62, ll: -62, ru: 62, rl: 62, lt: -14, rt: 14 }; }
    case 'shrug': return { ...P0, head: 10 + s(ph * 0.5) * 2, lu: -34, ll: -88, ru: 34, rl: 88 };
    case 'sit': return { ...P0, lt: 84, ls: -84, rt: 78, rs: -78, lu: 20, ll: 60, ru: 26, rl: 60 };
    default: return { ...P0, head: s(ph * 0.25) * 1.5, lu: -12 + s(ph * 0.3) * 1.5, ru: 12 - s(ph * 0.3) * 1.5 };
  }
}
const mix = (a: Pose, b: Pose, e: number): Pose => Object.fromEntries(Object.keys(a).map((key) => [key, a[key as keyof Pose] + (b[key as keyof Pose] - a[key as keyof Pose]) * e])) as unknown as Pose;

export type Face = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'thinking' | 'worried';
export const FACES: Face[] = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'thinking', 'worried'];
export interface PoseKey { t: number; pose: string; face?: string }

/** Pose keys of a character layer (a single `pose`, or `poses: [{t, pose, face}]`). */
export function poseKeys(it: MotionItem): PoseKey[] {
  const ks = arr<PoseKey>(it.poses).filter((p) => p && typeof p.pose === 'string').map((p) => ({ ...p, t: n(p.t, 0) })).sort((a, b) => a.t - b.t);
  return ks.length ? ks : [{ t: 0, pose: str(it.pose, 'stand'), face: typeof it.face === 'string' ? it.face : undefined }];
}
/** Pose and face at local time t, blended over 0.35 s between keys. */
export function stateAt(it: MotionItem, t: number): { pose: Pose; face: Face; name: string } {
  const ks = poseKeys(it);
  let i = 0;
  while (i + 1 < ks.length && ks[i + 1].t <= t) i++;
  const cur = ks[i], prev = ks[i - 1];
  const e = prev ? k(t, cur.t, 0.35, 'ease') : 1;
  const pose = prev && e < 1 ? mix(poseOf(prev.pose, t), poseOf(cur.pose, t), e) : poseOf(cur.pose, t);
  const face = (cur.face ?? (typeof it.face === 'string' && ks.length === 1 ? it.face : undefined) ?? POSE_FACE[cur.pose as PoseName] ?? 'neutral') as Face;
  return { pose, face, name: cur.pose };
}

type P = [number, number];
/** Joint positions of a figure H px tall (origin = figure centre, feet on y = H / 2), facing right. */
export interface Skeleton { pose: Pose; face: Face; r: number; ground: number; hip: P; neck: P; sh: P; lElbow: P; lHand: P; rElbow: P; rHand: P; lKnee: P; lFoot: P; rKnee: P; rFoot: P; head: P; headRot: number }
export function skeleton(it: MotionItem, t: number, H: number): Skeleton {
  const { pose, face } = stateAt(it, t);
  const r = H * 0.085, torso = H * 0.27 * (1 - pose.slump * 0.06), neck = H * 0.03, ua = H * 0.15, fa = H * 0.14, th = H * 0.2, sh = H * 0.2;
  const legV = (t1: number, s1: number) => th * Math.cos(t1 * D) + sh * Math.cos((t1 + s1) * D);
  const ground = H / 2, hipY = ground - Math.max(legV(pose.lt, pose.ls), legV(pose.rt, pose.rs)) - pose.jump * H;
  const two = (x: number, y: number, a1: number, l1: number, a2: number, l2: number): [P, P] => {
    const [dx1, dy1] = dir(a1), [dx2, dy2] = dir(a1 + a2), m: P = [x + dx1 * l1, y + dy1 * l1];
    return [m, [m[0] + dx2 * l2, m[1] + dy2 * l2]];
  };
  const [tx, ty] = dir(180 + pose.lean);
  const neckP: P = [tx * torso, hipY + ty * torso], shP: P = [tx * torso * 0.88, hipY + ty * torso * 0.88];
  const [lElbow, lHand] = two(shP[0], shP[1], pose.lu, ua, pose.ll, fa), [rElbow, rHand] = two(shP[0], shP[1], pose.ru, ua, pose.rl, fa);
  const [lKnee, lFoot] = two(0, hipY, pose.lt, th, pose.ls, sh), [rKnee, rFoot] = two(0, hipY, pose.rt, th, pose.rs, sh);
  const [hdx, hdy] = dir(180 + pose.lean + pose.head);
  return { pose, face, r, ground, hip: [0, hipY], neck: neckP, sh: shP, lElbow, lHand, rElbow, rHand, lKnee, lFoot, rKnee, rFoot, head: [neckP[0] + hdx * (neck + r), neckP[1] + hdy * (neck + r)], headRot: pose.head * 0.6 * D };
}
/** Blinking, shared by every look (seeded per character). */
export const blinking = (it: MotionItem, t: number) => (t + rnd(n(it.seed, 1), 7) * 3) % (3.2 + rnd(n(it.seed, 1), 4) * 1.6) < 0.13;

/** Is the character talking at local time t (narration words, or `talk` intervals / true)? Returns mouth opening 0..1. */
export function mouthAt(it: MotionItem, t: number, a: WidgetApi): number {
  const talk = it.talk;
  if (!talk) return 0;
  const on = Array.isArray(talk) ? (talk as number[][]).some((r) => t >= n(r?.[0], 0) && t < n(r?.[1], 0)) : true;
  if (!on) return 0;
  if (a.words.length) {
    const w = a.words.find((x, i) => t >= x.t && t < Math.min(x.t + 0.45, a.words[i + 1]?.t ?? Infinity));
    return w ? 0.35 + 0.65 * Math.abs(Math.sin((t - w.t) * 14)) : 0;
  }
  return 0.3 + 0.7 * Math.abs(Math.sin(t * 11)) * (0.6 + 0.4 * Math.sin(t * 3.1));
}

/* ---------- drawing ---------- */
function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}
function limb(ctx: CanvasRenderingContext2D, x: number, y: number, a1: number, l1: number, a2: number, l2: number, end?: number) {
  const [dx1, dy1] = dir(a1), [dx2, dy2] = dir(a1 + a2);
  const mx = x + dx1 * l1, my = y + dy1 * l1, ex = mx + dx2 * l2, ey = my + dy2 * l2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(mx, my);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  if (end) {
    ctx.beginPath();
    ctx.arc(ex, ey, end, 0, Math.PI * 2);
    ctx.fill();
  }
  return [ex, ey];
}

function drawFace(ctx: CanvasRenderingContext2D, r: number, face: Face, blink: boolean, mouth: number, look: number, ink: string) {
  const ex = r * 0.36, ey = -r * 0.08, er = r * 0.13;
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(2, r * 0.1);
  for (const sx of [-1, 1]) {
    const x = sx * ex + look * r * 0.12;
    if (blink) line(ctx, x - er, ey, x + er, ey);
    else {
      ctx.beginPath();
      ctx.ellipse(x, ey, er * (face === 'surprised' ? 1.25 : 1), er * (face === 'surprised' ? 1.45 : face === 'happy' ? 0.85 : 1.1), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Brows: inner end lower when angry, higher when sad / worried; one raised when thinking.
    const by = ey - r * (face === 'surprised' ? 0.42 : 0.3), d = r * 0.12;
    const inner = face === 'angry' ? d : face === 'sad' || face === 'worried' ? -d : 0, lift = face === 'thinking' && sx > 0 ? -d : 0;
    if (face !== 'neutral' && face !== 'happy') line(ctx, x - sx * er * 1.4, by + inner + lift, x + sx * er * 1.4, by - inner + lift);
  }
  // Mouth.
  const my = r * 0.42, mw = r * 0.42;
  ctx.lineWidth = Math.max(2, r * 0.1);
  if (mouth > 0.05) {
    ctx.beginPath();
    ctx.ellipse(look * r * 0.1, my, mw * (0.55 + mouth * 0.25), r * 0.1 + mouth * r * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
    return;
  }
  ctx.beginPath();
  if (face === 'happy') ctx.arc(look * r * 0.1, my - r * 0.22, mw, 0.18 * Math.PI, 0.82 * Math.PI);
  else if (face === 'sad') ctx.arc(look * r * 0.1, my + r * 0.25, mw * 0.85, 1.2 * Math.PI, 1.8 * Math.PI);
  else if (face === 'surprised') {
    ctx.ellipse(look * r * 0.1, my, r * 0.14, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (face === 'worried') {
    ctx.moveTo(-mw * 0.8, my + r * 0.04);
    ctx.quadraticCurveTo(-mw * 0.3, my - r * 0.08, 0, my + r * 0.02);
    ctx.quadraticCurveTo(mw * 0.3, my + r * 0.1, mw * 0.8, my - r * 0.02);
  } else if (face === 'thinking') (ctx.moveTo(-mw * 0.2, my + r * 0.05), ctx.lineTo(mw * 0.7, my - r * 0.04));
  else if (face === 'angry') (ctx.moveTo(-mw * 0.7, my + r * 0.06), ctx.lineTo(mw * 0.7, my + r * 0.06));
  else (ctx.moveTo(-mw * 0.6, my), ctx.lineTo(mw * 0.6, my));
  ctx.stroke();
}

/** A stick figure: `pose` / `poses`, `face`, `talk`, `facing` (1 / -1), `size` (height px), `color`, `accent`, `wear` (tie / scarf / hat / glasses / ponytail / cap). */
const character: W = (ctx, it, t, a) => {
  const H = n(it.size, 560), facing = n(it.facing, 1) < 0 ? -1 : 1;
  const ink = str(it.color, a.pal.text), accent = str(it.accent, a.pal.accents[0]);
  const { pose, face } = stateAt(it, t);
  const r = H * 0.085, torso = H * 0.27 * (1 - pose.slump * 0.06), neck = H * 0.03, ua = H * 0.15, fa = H * 0.14, th = H * 0.2, sh = H * 0.2;
  const lw = Math.max(3, H * 0.032);
  // Feet stay on the ground (y = H / 2) unless jumping.
  const legV = (t1: number, s1: number) => th * Math.cos(t1 * D) + sh * Math.cos((t1 + s1) * D);
  const ground = H / 2;
  const hipY = ground - Math.max(legV(pose.lt, pose.ls), legV(pose.rt, pose.rs)) - pose.jump * H;
  ctx.scale(facing, 1);
  // Ground shadow.
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, ground + lw * 0.6, H * 0.2 * (1 - pose.jump * 3), H * 0.025, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = lw;
  // Rim light: a soft glow in the accent colour.
  if (it.rim !== false) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = H * 0.05;
  }
  const [tx, ty] = dir(180 + pose.lean);
  const neckX = tx * torso, neckY = hipY + ty * torso;
  const shX = tx * torso * 0.88, shY = hipY + ty * torso * 0.88;
  // Back arm + back leg (slightly dimmer), torso, front leg + front arm.
  ctx.globalAlpha *= 0.85;
  limb(ctx, 0, hipY, pose.lt, th, pose.ls, sh);
  limb(ctx, shX, shY, pose.lu, ua, pose.ll, fa, lw * 0.9);
  ctx.globalAlpha /= 0.85;
  line(ctx, 0, hipY, neckX, neckY);
  const [fx, fy] = limb(ctx, 0, hipY, pose.rt, th, pose.rs, sh);
  line(ctx, fx, fy, fx + H * 0.045, fy);
  const [hx, hy] = limb(ctx, shX, shY, pose.ru, ua, pose.rl, fa, lw * 0.9);
  // Wear on the body.
  const wear = str(it.wear);
  ctx.shadowBlur = 0;
  if (wear === 'tie') {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(neckX - lw * 0.9, neckY + lw);
    ctx.lineTo(neckX + lw * 0.9, neckY + lw);
    ctx.lineTo(tx * torso * 0.45 + lw * 0.8, hipY + ty * torso * 0.45);
    ctx.lineTo(tx * torso * 0.4, hipY + ty * torso * 0.38);
    ctx.lineTo(tx * torso * 0.45 - lw * 0.8, hipY + ty * torso * 0.45);
    ctx.closePath();
    ctx.fill();
  } else if (wear === 'scarf') {
    ctx.strokeStyle = accent;
    ctx.lineWidth = lw * 1.5;
    line(ctx, neckX - r * 0.5, neckY + lw, neckX + r * 0.5, neckY + lw);
    line(ctx, neckX - r * 0.3, neckY + lw, neckX - r * 0.6 - Math.sin(t * 3) * r * 0.2, neckY + r * 1.1);
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw;
  }
  // Prop in the front hand (phone / cup / sign).
  const hold = str(it.hold);
  if (hold) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.lineWidth = lw * 0.6;
    if (hold === 'phone') {
      ctx.fillStyle = '#10131a';
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.roundRect(-r * 0.25, -r * 0.85, r * 0.5, r * 0.9, r * 0.08);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.globalAlpha *= 0.6 + 0.3 * Math.sin(t * 2);
      ctx.fillRect(-r * 0.18, -r * 0.76, r * 0.36, r * 0.7);
    } else if (hold === 'cup') {
      ctx.fillStyle = accent;
      ctx.fillRect(-r * 0.25, -r * 0.55, r * 0.5, r * 0.55);
      ctx.strokeStyle = ink;
      ctx.strokeRect(-r * 0.25, -r * 0.55, r * 0.5, r * 0.55);
    } else if (hold === 'sign') {
      ctx.strokeStyle = ink;
      line(ctx, 0, 0, 0, -r * 2.2);
      ctx.fillStyle = a.pal.card;
      ctx.fillRect(-r * 1.2, -r * 3.4, r * 2.4, r * 1.3);
      ctx.strokeRect(-r * 1.2, -r * 3.4, r * 2.4, r * 1.3);
    }
    ctx.restore();
  }
  // Head.
  const [hdx, hdy] = dir(180 + pose.lean + pose.head);
  const cx = neckX + hdx * (neck + r), cy = neckY + hdy * (neck + r);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((pose.head * 0.6) * D));
  if (it.rim !== false) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = H * 0.05;
  }
  ctx.fillStyle = str(it.skin, a.pal.bg);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (wear === 'ponytail') {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(-r * 1.05, -r * 0.1 + Math.sin(t * 4) * r * 0.05, r * 0.32, r * 0.55, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -r * 0.15, r * 1.02, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineWidth = lw * 1.4;
    ctx.stroke();
    ctx.lineWidth = lw;
  } else if (wear === 'hat') {
    ctx.fillStyle = ink;
    ctx.fillRect(-r * 1.3, -r * 0.85, r * 2.6, r * 0.18);
    ctx.fillRect(-r * 0.8, -r * 1.55, r * 1.6, r * 0.75);
    ctx.fillStyle = accent;
    ctx.fillRect(-r * 0.8, -r * 1.0, r * 1.6, r * 0.15);
  } else if (wear === 'cap') {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, -r * 0.2, r * 1.0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(0, -r * 0.3, r * 1.5, r * 0.18);
  }
  const blinkP = 3.2 + rnd(n(it.seed, 1), 4) * 1.6;
  const blink = (t + rnd(n(it.seed, 1), 7) * 3) % blinkP < 0.13;
  drawFace(ctx, r, face, blink, mouthAt(it, t, a), n(it.gaze, 0.6), ink);
  if (wear === 'glasses') {
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(2, r * 0.08);
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * r * 0.36 + r * 0.07, -r * 0.08, r * 0.26, 0, Math.PI * 2);
      ctx.stroke();
    }
    line(ctx, -r * 0.03, -r * 0.1, r * 0.17, -r * 0.1);
  }
  ctx.restore();
};

/* ---------- sets ---------- */
export const SETS = ['street', 'office', 'home', 'classroom', 'night', 'stage', 'park'] as const;
export const SET_LABEL: Record<(typeof SETS)[number], string> = { street: 'Street', office: 'Office', home: 'Home', classroom: 'Classroom', night: 'Night sky', stage: 'Spotlight', park: 'Park' };

/** A whole-frame set: sky / wall, far silhouettes, ground at y = `ground` (fraction of the frame from the centre), a light pool. */
const set: W = (ctx, it, t, a) => {
  const { w, h } = a.frame, kind = str(it.kind, 'street'), pal = a.pal;
  const G = h * n(it.ground, 0.3), L = -w / 2, T = -h / 2;
  const sh = a.shade, acc = pal.accents[0], acc2 = pal.accents[1] ?? acc;
  const drift = Math.sin(t * 0.15) * w * 0.006;
  const sky = ctx.createLinearGradient(0, T, 0, G);
  const indoor = kind === 'office' || kind === 'home' || kind === 'classroom';
  // Cartoon look: bright painted colours with ink outlines, clouds by day, no glows.
  const toon = it.look === 'cartoon', day = toon && kind !== 'night' && kind !== 'stage', INK = '#2b1a2e';
  const ink = (lw = 4) => { if (toon) (ctx.strokeStyle = INK), (ctx.lineWidth = lw), ctx.stroke(); };
  sky.addColorStop(0, toon ? (indoor ? sh(pal.card, -0.04) : sh(pal.bg, -0.08)) : sh(pal.bg, indoor ? 0.05 : -0.25));
  sky.addColorStop(1, toon ? (indoor ? pal.card : sh(pal.bg, 0.35)) : sh(pal.bg, indoor ? 0.18 : 0.12));
  ctx.fillStyle = sky;
  ctx.fillRect(L, T, w, h);
  const far = sh(pal.bg, -0.35), mid = sh(pal.bg, -0.2), lineC = sh(pal.text, -0.55);
  ctx.save();
  ctx.translate(drift, 0);
  if (kind === 'street' || kind === 'night' || kind === 'park') {
    if (day) for (let i = 0; i < 3; i++) {
      const cx = L + (((rnd(i, 8) * w + t * 12 * (i + 1)) % (w + 400)) - 200), cy = T + h * (0.1 + rnd(i, 9) * 0.18);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (const [dx, dy, rr] of [[0, 0, 50], [55, -20, 62], [115, 0, 48], [60, 18, 45]]) (ctx.moveTo(cx + dx + rr, cy + dy), ctx.arc(cx + dx, cy + dy, rr, 0, Math.PI * 2));
      ctx.fill();
      ink(3);
    }
    if (kind !== 'park' && !day) for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.5 * Math.abs(Math.sin(t * 1.3 + i))})`;
      ctx.fillRect(L + rnd(i, 3) * w, T + rnd(i, 5) * (G - T) * 0.55, 2.5, 2.5);
    }
    // Moon / sun.
    ctx.fillStyle = day ? '#ffd23f' : kind === 'park' ? '#ffe9a8' : '#f4f1e6';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = toon ? 0 : 40;
    ctx.beginPath();
    ctx.arc(w * 0.36, T + h * 0.3, h * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ink(4);
    ctx.shadowBlur = 0;
  }
  if (kind === 'street') {
    for (let i = 0, x = L - 40; x < w / 2 + 40; i++) {
      const bw = w * (0.07 + rnd(i, 1) * 0.07), bh = h * (0.18 + rnd(i, 2) * 0.32);
      ctx.fillStyle = toon ? ['#f4a259', '#e76f51', '#8ab17d', '#f6d186', '#a8dadc'][i % 5] : i % 2 ? far : mid;
      ctx.beginPath();
      ctx.rect(x, G - bh, bw, bh);
      ctx.fill();
      ink(4);
      ctx.fillStyle = toon ? '#e8f6ff' : acc2;
      for (let wy = G - bh + 18; wy < G - 20; wy += 34) for (let wx = x + 12; wx < x + bw - 16; wx += 28) if (toon ? (wx + wy) % 2 === 0 || rnd(wx * 3 + wy, i) > 0.4 : rnd(wx * 3 + wy, i) > 0.62) (ctx.globalAlpha = toon ? 1 : 0.55), ctx.fillRect(wx, wy, 10, 14);
      ctx.globalAlpha = 1;
      x += bw + 6;
    }
  } else if (kind === 'night' || kind === 'park') {
    ctx.fillStyle = kind === 'park' ? sh('#4caf50', toon ? 0.05 : -0.35) : far;
    ctx.beginPath();
    ctx.moveTo(L, G);
    for (let x = 0; x <= 10; x++) ctx.lineTo(L + (x / 10) * w, G - h * (0.08 + 0.07 * Math.sin(x * 1.7 + 1)));
    ctx.lineTo(w / 2, G);
    ctx.fill();
    ink(4);
    if (kind === 'park') for (const tx of [-0.36, 0.38]) {
      ctx.fillStyle = sh('#2e7d32', -0.2);
      ctx.fillRect(tx * w - 8, G - h * 0.2, 16, h * 0.2);
      ctx.beginPath();
      ctx.arc(tx * w, G - h * 0.26, h * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (indoor) {
    // Window with a view, a lamp, and furniture silhouettes.
    const wx = kind === 'classroom' ? -w * 0.05 : w * 0.18, ww = kind === 'classroom' ? w * 0.42 : w * 0.22, wh = h * 0.3, wy = T + h * 0.16;
    if (kind === 'classroom') {
      ctx.fillStyle = '#20382c';
      ctx.fillRect(wx - ww / 2, wy, ww, wh);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) line(ctx, wx - ww * 0.4, wy + wh * (0.25 + i * 0.22), wx - ww * 0.4 + ww * (0.3 + rnd(i, 9) * 0.4), wy + wh * (0.25 + i * 0.22));
      ctx.strokeStyle = sh(pal.text, -0.4);
      ctx.strokeRect(wx - ww / 2, wy, ww, wh);
    } else {
      ctx.fillStyle = sh(pal.bg, -0.3);
      ctx.fillRect(wx - ww / 2, wy, ww, wh);
      ctx.fillStyle = mid;
      for (let i = 0; i < 6; i++) ctx.fillRect(wx - ww / 2 + i * (ww / 6), wy + wh * (0.45 + rnd(i, 4) * 0.3), ww / 6 - 4, wh);
      ctx.strokeStyle = lineC;
      ctx.lineWidth = 6;
      ctx.strokeRect(wx - ww / 2, wy, ww, wh);
      line(ctx, wx, wy, wx, wy + wh);
    }
    if (kind === 'home') {
      ctx.fillStyle = mid;
      ctx.beginPath();
      ctx.roundRect(-w * 0.42, G - h * 0.13, w * 0.26, h * 0.13, 18);
      ctx.fill();
      ctx.fillRect(-w * 0.44, G - h * 0.17, w * 0.04, h * 0.17);
    }
    if (kind === 'office') {
      ctx.fillStyle = mid;
      ctx.fillRect(-w * 0.44, T + h * 0.2, w * 0.16, h * 0.02);
      ctx.fillRect(-w * 0.44, T + h * 0.32, w * 0.16, h * 0.02);
      for (let i = 0; i < 5; i++) ctx.fillRect(-w * 0.43 + i * w * 0.028, T + h * 0.2 - h * (0.05 + rnd(i, 2) * 0.04), w * 0.02, h * (0.05 + rnd(i, 2) * 0.04));
    }
    if (kind === 'classroom') {
      ctx.strokeStyle = lineC;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(w * 0.36, T + h * 0.22, h * 0.06, 0, Math.PI * 2);
      ctx.stroke();
      line(ctx, w * 0.36, T + h * 0.22, w * 0.36, T + h * 0.18);
      line(ctx, w * 0.36, T + h * 0.22, w * 0.385, T + h * 0.23);
    }
  }
  ctx.restore();
  // Ground.
  ctx.fillStyle = toon ? (indoor ? '#d9a066' : kind === 'park' ? '#7cc06b' : kind === 'street' ? '#b8b0a8' : sh(pal.bg, -0.45)) : sh(pal.bg, indoor ? -0.25 : -0.45);
  ctx.fillRect(L, G, w, h / 2 - G);
  ctx.strokeStyle = sh(pal.text, -0.5);
  ctx.lineWidth = 3;
  line(ctx, L, G, w / 2, G);
  // Light pool: lamp post (street), spotlight (stage), lamp glow (indoor).
  const lx = w * n(it.lightX, kind === 'stage' ? 0 : -0.08);
  const pool = ctx.createRadialGradient(lx, G, 0, lx, G, w * 0.32);
  pool.addColorStop(0, `${acc}55`);
  pool.addColorStop(1, `${acc}00`);
  if (kind === 'stage') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(L, T, w, h);
    const cone = ctx.createLinearGradient(lx, T, lx, G);
    cone.addColorStop(0, 'rgba(255,245,220,0.35)');
    cone.addColorStop(1, 'rgba(255,245,220,0.08)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(lx - w * 0.04, T);
    ctx.lineTo(lx + w * 0.04, T);
    ctx.lineTo(lx + w * 0.2, G);
    ctx.lineTo(lx - w * 0.2, G);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,245,220,0.18)';
    ctx.beginPath();
    ctx.ellipse(lx, G + 10, w * 0.2, h * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = pool;
  if (!toon) ctx.fillRect(L, T, w, h);
  if (kind === 'street') {
    const px = lx - w * 0.17;
    ctx.strokeStyle = sh(pal.text, -0.45);
    ctx.lineWidth = 8;
    line(ctx, px, G, px, G - h * 0.42);
    line(ctx, px, G - h * 0.42, px + w * 0.05, G - h * 0.42);
    ctx.fillStyle = '#fff4d6';
    ctx.shadowColor = '#ffd27a';
    ctx.shadowBlur = 50;
    ctx.beginPath();
    ctx.arc(px + w * 0.05, G - h * 0.41, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
};

/* ---------- props ---------- */
export const PROPS = ['desk', 'laptop', 'phone', 'coffee', 'fridge', 'door', 'tree', 'car', 'bed', 'clock', 'money', 'lightbulb', 'board', 'chair'] as const;

/** A prop drawn in line art: `kind`, `size` (height px), optional `value` (board / clock text), `on` (lightbulb lit). */
const prop: W = (ctx, it, t, a) => {
  const S = n(it.size, 300), kind = str(it.kind, 'desk'), pal = a.pal;
  const ink = str(it.color, pal.text), fill = a.shade(pal.card, 0.05), acc = pal.accents[0];
  ctx.lineWidth = Math.max(3, S * 0.022);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink;
  ctx.fillStyle = fill;
  const box = (x: number, y: number, w: number, h: number, r = 8) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
  };
  switch (kind) {
    case 'desk': box(-S * 0.8, -S * 0.1, S * 1.6, S * 0.12, 4); line(ctx, -S * 0.7, S * 0.02, -S * 0.7, S * 0.5); line(ctx, S * 0.7, S * 0.02, S * 0.7, S * 0.5); break;
    case 'chair': line(ctx, -S * 0.2, -S * 0.5, -S * 0.2, S * 0.5); box(-S * 0.2, -S * 0.02, S * 0.45, S * 0.08, 4); line(ctx, S * 0.2, S * 0.06, S * 0.2, S * 0.5); break;
    case 'laptop': {
      box(-S * 0.4, -S * 0.5, S * 0.8, S * 0.5, 10);
      ctx.fillStyle = acc;
      ctx.globalAlpha *= 0.55 + 0.15 * Math.sin(t * 2);
      ctx.fillRect(-S * 0.34, -S * 0.44, S * 0.68, S * 0.38);
      ctx.globalAlpha = 1;
      ctx.fillStyle = fill;
      box(-S * 0.5, 0, S, S * 0.06, 4);
      break;
    }
    case 'phone': box(-S * 0.25, -S * 0.5, S * 0.5, S, S * 0.07); ctx.fillStyle = acc; ctx.fillRect(-S * 0.2, -S * 0.42, S * 0.4, S * 0.78); break;
    case 'coffee': box(-S * 0.25, -S * 0.3, S * 0.5, S * 0.6, 10); ctx.beginPath(); ctx.arc(S * 0.3, 0, S * 0.12, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(-S * 0.12 + i * S * 0.12, -S * 0.38); ctx.quadraticCurveTo(-S * 0.04 + i * S * 0.12 + Math.sin(t * 3 + i) * 8, -S * 0.5, -S * 0.12 + i * S * 0.12, -S * 0.62); ctx.stroke(); } ctx.globalAlpha = 1; break;
    case 'fridge': box(-S * 0.3, -S * 0.5, S * 0.6, S, 16); line(ctx, -S * 0.3, -S * 0.15, S * 0.3, -S * 0.15); line(ctx, S * 0.2, -S * 0.4, S * 0.2, -S * 0.25); line(ctx, S * 0.2, -S * 0.05, S * 0.2, S * 0.15); break;
    case 'door': box(-S * 0.25, -S * 0.5, S * 0.5, S, 6); ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(S * 0.15, 0, S * 0.03, 0, Math.PI * 2); ctx.fill(); break;
    case 'tree': ctx.fillStyle = a.shade('#3f8f4a', -0.1); line(ctx, 0, S * 0.5, 0, -S * 0.05); ctx.beginPath(); ctx.arc(0, -S * 0.22, S * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
    case 'car': box(-S * 0.75, -S * 0.15, S * 1.5, S * 0.3, 20); box(-S * 0.4, -S * 0.4, S * 0.7, S * 0.27, 18);
      ctx.fillStyle = ink; for (const x of [-0.45, 0.45]) { ctx.beginPath(); ctx.arc(x * S, S * 0.17, S * 0.13, 0, Math.PI * 2); ctx.fill(); } break;
    case 'bed': box(-S * 0.9, -S * 0.05, S * 1.8, S * 0.25, 10); box(-S * 0.9, -S * 0.35, S * 0.12, S * 0.55, 6); ctx.fillStyle = acc; box(-S * 0.7, -S * 0.18, S * 0.4, S * 0.14, 20); break;
    case 'clock': {
      ctx.beginPath(); ctx.arc(0, 0, S * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const sp = n(it.speed, 1);
      ctx.lineWidth *= 1.3;
      line(ctx, 0, 0, Math.sin(t * sp * 0.5) * S * 0.22, -Math.cos(t * sp * 0.5) * S * 0.22);
      ctx.strokeStyle = acc;
      line(ctx, 0, 0, Math.sin(t * sp * 3) * S * 0.36, -Math.cos(t * sp * 3) * S * 0.36);
      break;
    }
    case 'money': for (let i = 0; i < 4; i++) if (t >= i * 0.12) { ctx.fillStyle = a.shade('#4caf50', -0.1 + i * 0.05); box(-S * 0.45, S * 0.3 - i * S * 0.14, S * 0.9, S * 0.12, 4); } break;
    case 'lightbulb': {
      const on = it.on !== false && t >= n(it.onAt, 0);
      if (on) { ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = S * 0.35; }
      ctx.fillStyle = on ? '#ffe680' : fill;
      ctx.beginPath(); ctx.arc(0, -S * 0.12, S * 0.3, Math.PI * 0.8, Math.PI * 2.2); ctx.lineTo(S * 0.12, S * 0.25); ctx.lineTo(-S * 0.12, S * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = ink; ctx.fillRect(-S * 0.12, S * 0.27, S * 0.24, S * 0.12);
      if (on) { ctx.strokeStyle = '#ffd23f'; for (let i = 0; i < 7; i++) { const an = (-90 + (i - 3) * 30) * D, r0 = S * 0.42, r1 = S * (0.52 + 0.05 * Math.sin(t * 6 + i)); line(ctx, Math.cos(an) * r0, -S * 0.12 + Math.sin(an) * r0, Math.cos(an) * r1, -S * 0.12 + Math.sin(an) * r1); } }
      break;
    }
    case 'board': {
      box(-S * 0.7, -S * 0.5, S * 1.4, S * 0.8, 8);
      line(ctx, -S * 0.3, S * 0.3, -S * 0.45, S * 0.55); line(ctx, S * 0.3, S * 0.3, S * 0.45, S * 0.55);
      const vals = arr<number>(it.values).length ? arr<number>(it.values) : [0.3, 0.5, 0.45, 0.8];
      vals.forEach((v, i) => { const e = k(t, 0.3 + i * 0.15, 0.5, 'overshoot'); ctx.fillStyle = i === vals.length - 1 ? acc : a.shade(acc, -0.35); const bw = (S * 1.1) / vals.length; ctx.fillRect(-S * 0.55 + i * bw + bw * 0.15, S * 0.22 - clamp(v) * S * 0.6 * e, bw * 0.7, clamp(v) * S * 0.6 * e); });
      break;
    }
  }
};

/* ---------- bubbles ---------- */
/** Speech / thought bubble: `kind` speech | thought, `text`, `w`, `h`, `tail` [x, y] (tip, relative to the centre). */
const bubble: W = (ctx, it, t, a) => {
  const w = n(it.w, 520), h = n(it.h, 240), kind = str(it.kind, 'speech'), tail = arr<number>(it.tail);
  const tx = n(tail[0], -w * 0.3), ty = n(tail[1], h * 0.9);
  const e = k(t, 0, 0.35, 'overshoot');
  ctx.scale(0.6 + 0.4 * e, 0.6 + 0.4 * e);
  ctx.globalAlpha *= clamp(e * 1.6);
  ctx.fillStyle = str(it.bg, '#fbfaf7');
  ctx.strokeStyle = str(it.line, '#1b1b22');
  ctx.lineWidth = 5;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 18;
  if (kind === 'thought') {
    ctx.beginPath();
    const bumps = 9;
    for (let i = 0; i < bumps; i++) {
      const an = (i / bumps) * Math.PI * 2, bx = Math.cos(an) * w * 0.4, by = Math.sin(an) * h * 0.36;
      ctx.moveTo(bx + w * 0.17, by);
      ctx.arc(bx, by, w * 0.17, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.42, h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(tx * (i / 3.4), ty * (i / 3.4) + h * 0.15, 6 + (4 - i) * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(60, h / 2.5));
    ctx.moveTo(tx * 0.35 - 30, h / 2 - 2);
    ctx.lineTo(tx, ty);
    ctx.lineTo(tx * 0.35 + 30, h / 2 - 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.fillStyle = str(it.bg, '#fbfaf7');
    ctx.fillRect(tx * 0.35 - 26, h / 2 - 8, 52, 10);
  }
  ctx.shadowBlur = 0;
  const text = str(it.text);
  const size = n(it.size, Math.max(30, Math.min(56, (w * 1.4) / Math.max(8, text.length))));
  a.text({ text, size, width: w * 0.78, weight: 800, color: str(it.textColor, '#1b1b22'), align: 'center', font: str(it.font, a.pal.font ?? 'Montserrat'), in: 'none', dur: it.dur }, t);
};

export const STICK_WIDGETS: Record<string, W> = { character, set, prop, bubble };
