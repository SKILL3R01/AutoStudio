/**
 * Cartoon look (v5.3) for the `character` widget: the same skeleton, poses, faces and talking as the stick figure,
 * drawn as a bean-head character with ink outlines — shirt, trousers, shoes, big eyes, blush, hair. Original art.
 */
import type { MotionItem } from '../types';
import { type WidgetApi, num as n, str } from '../widgets';
import { blinking, mouthAt, skeleton, type Face } from './stick';

type P = [number, number];
const INK = '#2b1a2e';

function tube(ctx: CanvasRenderingContext2D, pts: P[], color: string, w: number, ow: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [c, lw] of [[INK, w + ow * 2], [color, w]] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  }
}
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, ow: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = ow;
  ctx.stroke();
}

function face(ctx: CanvasRenderingContext2D, r: number, f: Face, blink: boolean, mouth: number, gaze: number, ow: number) {
  const ex = r * 0.42, ey = -r * 0.1, erx = r * 0.27, ery = r * (f === 'surprised' ? 0.42 : 0.34);
  for (const sx of [-1, 1]) {
    const x = sx * ex;
    if (blink || (f === 'happy' && mouth < 0.05)) {
      // Closed / smiling eyes: an ink arc.
      ctx.strokeStyle = INK;
      ctx.lineWidth = ow * 1.2;
      ctx.beginPath();
      if (blink) ctx.arc(x, ey, erx * 0.9, 0.15 * Math.PI, 0.85 * Math.PI);
      else ctx.arc(x, ey + ery * 0.4, erx * 0.9, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
    } else {
      blob(ctx, x, ey, erx, ery, '#ffffff', ow * 0.8);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x + gaze * erx * 0.35, ey + (f === 'sad' ? ery * 0.2 : 0), erx * (f === 'surprised' ? 0.38 : 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x + gaze * erx * 0.35 + erx * 0.18, ey - ery * 0.2, erx * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    // Brows.
    const by = ey - ery - r * 0.12, d = r * 0.1;
    const inner = f === 'angry' ? d : f === 'sad' || f === 'worried' ? -d : 0, lift = f === 'surprised' ? -d : f === 'thinking' && sx > 0 ? -d : 0;
    ctx.strokeStyle = INK;
    ctx.lineWidth = ow * 1.4;
    ctx.beginPath();
    ctx.moveTo(x - sx * erx * 1.1, by + inner + lift);
    ctx.lineTo(x + sx * erx * 1.1, by - inner + lift);
    ctx.stroke();
  }
  if (f === 'happy' || mouth > 0.05) {
    ctx.fillStyle = 'rgba(255,110,110,0.45)';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * r * 0.72, r * 0.32, r * 0.17, r * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Mouth: open (talking / surprised) = dark red with a tongue; else a curve per feeling.
  const my = r * 0.52;
  ctx.lineWidth = ow * 1.2;
  ctx.strokeStyle = INK;
  if (mouth > 0.05 || f === 'surprised') {
    const o = f === 'surprised' && mouth < 0.05 ? 0.8 : mouth;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(gaze * r * 0.08, my, r * (0.22 + o * 0.1), r * (0.06 + o * 0.2), 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7a1f2b';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = '#ff7a8a';
    ctx.beginPath();
    ctx.ellipse(gaze * r * 0.08, my + r * (0.06 + o * 0.2), r * 0.2, r * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(gaze * r * 0.08, my, r * (0.22 + o * 0.1), r * (0.06 + o * 0.2), 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  if (f === 'happy') {
    ctx.moveTo(-r * 0.32, my - r * 0.05);
    ctx.quadraticCurveTo(0, my + r * 0.32, r * 0.32, my - r * 0.05);
    ctx.closePath();
    ctx.fillStyle = '#7a1f2b';
    ctx.fill();
  } else if (f === 'sad') ctx.arc(0, my + r * 0.22, r * 0.24, 1.2 * Math.PI, 1.8 * Math.PI);
  else if (f === 'worried') (ctx.moveTo(-r * 0.25, my + r * 0.04), ctx.bezierCurveTo(-r * 0.1, my - r * 0.08, r * 0.1, my + r * 0.12, r * 0.25, my));
  else if (f === 'angry') (ctx.moveTo(-r * 0.25, my + r * 0.06), ctx.lineTo(r * 0.25, my + r * 0.02));
  else if (f === 'thinking') (ctx.moveTo(-r * 0.08, my + r * 0.04), ctx.lineTo(r * 0.24, my - r * 0.03));
  else (ctx.moveTo(-r * 0.2, my), ctx.quadraticCurveTo(0, my + r * 0.12, r * 0.2, my));
  ctx.stroke();
}

/** A bean-head cartoon character (`look: 'cartoon'`): `accent` = shirt, `pants`, `skin`, `hair`, `wear`. */
export function drawCartoon(ctx: CanvasRenderingContext2D, it: MotionItem, t: number, a: WidgetApi) {
  const H = n(it.size, 560), facing = n(it.facing, 1) < 0 ? -1 : 1;
  const sk = skeleton(it, t, H), { r } = sk;
  const ow = Math.max(2, H * 0.011), limb = H * 0.05;
  const skin = str(it.skin, '#ffd7b0'), shirt = str(it.accent, a.pal.accents[0]), pants = str(it.pants, '#3d4f7a'), hair = str(it.hair, '#4a2a1f');
  ctx.scale(facing, 1);
  // Ground shadow.
  ctx.fillStyle = 'rgba(43,26,46,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, sk.ground + ow, H * 0.18 * (1 - sk.pose.jump * 3), H * 0.022, 0, 0, Math.PI * 2);
  ctx.fill();
  const shoe = (q: P, dir = 1) => blob(ctx, q[0] + dir * H * 0.02, q[1] + H * 0.005, H * 0.045, H * 0.024, '#3a2a2a', ow);
  // Back leg + back arm.
  tube(ctx, [sk.hip, sk.lKnee, sk.lFoot], pants, limb * 1.1, ow);
  shoe(sk.lFoot);
  tube(ctx, [sk.sh, sk.lElbow], shirt, limb, ow);
  tube(ctx, [sk.lElbow, sk.lHand], skin, limb * 0.8, ow);
  blob(ctx, sk.lHand[0], sk.lHand[1], limb * 0.55, limb * 0.55, skin, ow);
  // Body: a rounded shirt from the shoulders to the hips, trousers top.
  const [nx, ny] = sk.neck, [hx, hy] = sk.hip, len = Math.hypot(nx - hx, ny - hy) || 1, px = -(ny - hy) / len, py = (nx - hx) / len;
  const sw = H * 0.11, hw = H * 0.095;
  ctx.beginPath();
  ctx.moveTo(nx + px * sw, ny + py * sw);
  ctx.quadraticCurveTo(nx + px * sw * 1.15 + (hx - nx) * 0.5, ny + py * sw * 1.15 + (hy - ny) * 0.5, hx + px * hw, hy + py * hw);
  ctx.lineTo(hx - px * hw, hy - py * hw);
  ctx.quadraticCurveTo(nx - px * sw * 1.15 + (hx - nx) * 0.5, ny - py * sw * 1.15 + (hy - ny) * 0.5, nx - px * sw, ny - py * sw);
  ctx.quadraticCurveTo(nx, ny - H * 0.03, nx + px * sw, ny + py * sw);
  ctx.fillStyle = shirt;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = ow;
  ctx.stroke();
  ctx.fillStyle = pants;
  ctx.beginPath();
  ctx.ellipse(hx, hy, hw * 1.02, H * 0.03, Math.atan2(py, px), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (str(it.wear) === 'tie') {
    ctx.fillStyle = a.pal.accents[1] ?? '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(nx - H * 0.015, ny + H * 0.01);
    ctx.lineTo(nx + H * 0.015, ny + H * 0.01);
    ctx.lineTo(nx + (hx - nx) * 0.55 + H * 0.02, ny + (hy - ny) * 0.55);
    ctx.lineTo(nx + (hx - nx) * 0.62, ny + (hy - ny) * 0.62);
    ctx.lineTo(nx + (hx - nx) * 0.55 - H * 0.02, ny + (hy - ny) * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Front leg + front arm.
  tube(ctx, [sk.hip, sk.rKnee, sk.rFoot], pants, limb * 1.1, ow);
  shoe(sk.rFoot);
  tube(ctx, [sk.sh, sk.rElbow], shirt, limb, ow);
  tube(ctx, [sk.rElbow, sk.rHand], skin, limb * 0.8, ow);
  if (it.hold === 'phone') {
    ctx.save();
    ctx.translate(sk.rHand[0], sk.rHand[1] - r * 0.4);
    ctx.fillStyle = '#20232c';
    ctx.strokeStyle = INK;
    ctx.lineWidth = ow;
    ctx.beginPath();
    ctx.roundRect(-r * 0.28, -r * 0.5, r * 0.56, r, r * 0.1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#9be7ff';
    ctx.fillRect(-r * 0.2, -r * 0.4, r * 0.4, r * 0.78);
    ctx.restore();
  }
  blob(ctx, sk.rHand[0], sk.rHand[1], limb * 0.55, limb * 0.55, skin, ow);
  // Head: a bean, hair, face.
  ctx.save();
  ctx.translate(sk.head[0], sk.head[1] - r * 0.2);
  ctx.rotate(sk.headRot);
  const R = r * 1.25;
  const wear = str(it.wear);
  if (wear === 'ponytail') blob(ctx, -R * 0.95, R * 0.05 + Math.sin(t * 4) * R * 0.04, R * 0.32, R * 0.5, hair, ow, 0.5);
  blob(ctx, 0, 0, R, R * 1.12, skin, ow * 1.3);
  ctx.fillStyle = hair;
  ctx.strokeStyle = INK;
  ctx.lineWidth = ow;
  ctx.beginPath();
  if (wear === 'ponytail') {
    ctx.ellipse(0, -R * 0.55, R * 0.98, R * 0.6, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
  } else {
    ctx.moveTo(-R * 0.95, -R * 0.35);
    ctx.quadraticCurveTo(-R * 0.9, -R * 1.2, 0, -R * 1.15);
    ctx.quadraticCurveTo(R * 0.6, -R * 1.25, R * 0.95, -R * 0.4);
    ctx.lineTo(R * 0.55, -R * 0.65);
    ctx.lineTo(R * 0.25, -R * 0.5);
    ctx.lineTo(-R * 0.1, -R * 0.7);
    ctx.lineTo(-R * 0.45, -R * 0.55);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  if (wear === 'cap' || wear === 'hat') {
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.75, R * 0.95, R * 0.45, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(wear === 'cap' ? R * 0.6 : 0, -R * 0.75, wear === 'cap' ? R * 0.7 : R * 1.3, R * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  face(ctx, R, sk.face, blinking(it, t), mouthAt(it, t, a), n(it.gaze, 0.5), ow);
  if (wear === 'glasses') {
    ctx.strokeStyle = INK;
    ctx.lineWidth = ow * 1.2;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * R * 0.42, -R * 0.1, R * 0.36, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
