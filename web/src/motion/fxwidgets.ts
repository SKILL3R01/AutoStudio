/** Motion effect + transition widgets. Frame-coordinate widgets draw around the frame centre (their own x / y = a point in the frame). */
import type { MotionItem } from './types';
import { type WidgetApi, accent, arr, clamp, label, num as n, palOf, rnd, stepK as k, str } from './widgets';

type W = (ctx: CanvasRenderingContext2D, it: MotionItem, t: number, a: WidgetApi) => void;
const cols = (it: MotionItem, a: WidgetApi) => {
  const c = arr<string>(it.colors);
  return c.length ? c : [palOf(it, a).accents[0], palOf(it, a).accents[1] ?? '#ffffff', palOf(it, a).bg];
};

/** Transition: colour circles grow from a point over the cut, then the last one opens up again. */
const burst: W = (ctx, it, t, a) => {
  const c = cols(it, a), d = it.dur, R = Math.hypot(a.frame.w, a.frame.h);
  const x0 = -(it.x ?? 0), y0 = -(it.y ?? 0); // cover the whole frame even when the burst is off-centre
  c.forEach((col, i) => {
    const grow = k(t, i * 0.08, d * 0.45, 'ease-in');
    const shrink = k(t, d * 0.55 + i * 0.06, d * 0.4, 'ease-out');
    const r = R * grow * (1 - shrink);
    if (r <= 0) return;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  });
  void x0, y0;
};
/** Transition: colour panels sweep across the frame (in the direction of motion). */
const wipe: W = (ctx, it, t, a) => {
  const c = cols(it, a), d = it.dur, { w, h } = a.frame, dir = str(it.dir, 'left');
  c.forEach((col, i) => {
    const p = k(t, i * 0.07, d * 0.8 - i * 0.05, 'strong');
    const off = -1 + 2 * p; // -1 = off one side, 1 = off the other side
    ctx.fillStyle = col;
    const horiz = dir === 'left' || dir === 'right', sgn = dir === 'left' || dir === 'up' ? -1 : 1;
    const len = horiz ? w : h;
    const pos = sgn * off * len * 1.05;
    if (horiz) ctx.fillRect(-w / 2 + pos * -1, -h / 2, w, h);
    else ctx.fillRect(-w / 2, -h / 2 + pos * -1, w, h);
  });
};
/** Transition: vertical strips slide over the cut, staggered. */
const slices: W = (ctx, it, t, a) => {
  const c = cols(it, a), count = Math.max(3, n(it.count, 10)), { w, h } = a.frame, d = it.dur, up = it.dir !== 'down';
  const sw = w / count;
  for (let i = 0; i < count; i++) {
    const p = k(t, (i / count) * d * 0.3, d * 0.65, 'strong');
    const y = (up ? 1 : -1) * h * (1 - 2 * p);
    ctx.fillStyle = c[i % c.length];
    ctx.fillRect(-w / 2 + i * sw - 1, -h / 2 + y, sw + 2, h);
  }
};
/** Transition: slanted colour bands sweep across. */
const bandWipe: W = (ctx, it, t, a) => {
  const c = cols(it, a), { w, h } = a.frame, d = it.dur, sgn = it.dir === 'left' ? -1 : 1;
  ctx.save();
  ctx.rotate(-0.25 * sgn);
  c.forEach((col, i) => {
    const p = k(t, i * 0.08, d * 0.8, 'strong');
    const x = sgn * (-1.6 + 3.2 * p) * w;
    ctx.fillStyle = col;
    ctx.fillRect(x - w * 0.55, -h, w * 1.1, h * 2);
  });
  ctx.restore();
};
/** 4-point sparkles twinkling around a point. */
function star4(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? s * 0.18 : s / 2, ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
    i ? ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r) : ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
  }
  ctx.closePath();
  ctx.fill();
}
const sparkles: W = (ctx, it, t) => {
  const count = n(it.count, 7), spread = n(it.spread, 320), size = n(it.size, 46), color = str(it.color, '#ffffff');
  const ats = arr<number>(it.at).length ? arr<number>(it.at) : [0.2];
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.5;
  for (const at of ats)
    for (let i = 0; i < count; i++) {
      const lt = t - at - rnd(i, 3) * 0.4;
      if (lt < 0 || lt > 1.1) continue;
      const s = size * (0.5 + rnd(i, 7)) * Math.sin(Math.PI * clamp(lt / 1.1));
      ctx.save();
      ctx.translate((rnd(i, 1) - 0.5) * spread * 2, (rnd(i, 2) - 0.5) * spread * 1.2);
      ctx.rotate(lt * 1.5);
      star4(ctx, s);
      ctx.restore();
    }
};
/** Light rays rotating behind a hero, with a flash on key moments. */
const rays: W = (ctx, it, t) => {
  const num = n(it.n, 16), size = n(it.size, 420), color = str(it.color, '#ffd27a'), strength = n(it.strength, 0.5), speed = n(it.speed, 1);
  const flash = Math.max(0, ...arr<number>(it.flashes).map((f) => Math.exp(-Math.abs(t - f) * 6) * (t >= f - 0.05 ? 1 : 0)));
  const R = size * (2.2 + flash * 0.6);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha *= clamp((strength + flash * 0.5) * k(t, 0, 0.6));
  ctx.fillStyle = g;
  ctx.rotate(t * 0.15 * speed);
  for (let i = 0; i < num; i++) {
    const a0 = (i / num) * Math.PI * 2, wd = (Math.PI / num) * 0.55;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a0 - wd, a0 + wd);
    ctx.closePath();
    ctx.fill();
  }
  if (flash > 0.05) {
    ctx.globalAlpha = flash * 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
};
/** Speed lines rushing across (or out from a centre). */
const speedLines: W = (ctx, it, t, a) => {
  const count = n(it.count, 22), color = str(it.color, '#ffffff'), dir = str(it.dir, 'left'), { w, h } = a.frame;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const fade = Math.sin(Math.PI * clamp(t / it.dur));
  for (let i = 0; i < count; i++) {
    const len = 200 + rnd(i, 5) * 500, ph = (t * (2.5 + rnd(i, 9) * 2) + rnd(i, 4)) % 1;
    ctx.globalAlpha = fade * (0.3 + rnd(i, 6) * 0.6);
    ctx.lineWidth = 2 + rnd(i, 8) * 5;
    ctx.beginPath();
    if (dir === 'radial') {
      const ang = rnd(i, 1) * Math.PI * 2, r0 = 120 + ph * Math.max(w, h) * 0.6;
      ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
      ctx.lineTo(Math.cos(ang) * (r0 + len * 0.6), Math.sin(ang) * (r0 + len * 0.6));
    } else {
      const horiz = dir === 'left' || dir === 'right', sgn = dir === 'left' || dir === 'up' ? -1 : 1;
      const along = (horiz ? w : h) * (0.6 - 1.2 * ph) * -sgn, across = (rnd(i, 2) - 0.5) * (horiz ? h : w);
      if (horiz) (ctx.moveTo(along, across), ctx.lineTo(along - sgn * len, across));
      else (ctx.moveTo(across, along), ctx.lineTo(across, along - sgn * len));
    }
    ctx.stroke();
  }
};
/** Anamorphic light streaks sliding across with a flash. */
const lightStreaks: W = (ctx, it, t, a) => {
  const count = n(it.count, 6), color = str(it.color, '#ff7a1a'), { w } = a.frame;
  const ats = arr<number>(it.at).length ? arr<number>(it.at) : [0.2];
  ctx.globalCompositeOperation = 'lighter';
  for (const at of ats)
    for (let i = 0; i < count; i++) {
      const lt = (t - at - i * 0.05) / 0.9;
      if (lt < 0 || lt > 1) continue;
      const x = -w * 0.7 + lt * w * 1.4, y = (rnd(i, 3) - 0.5) * 160, len = 300 + rnd(i, 2) * 600;
      const g = ctx.createLinearGradient(x - len, 0, x + len, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = Math.sin(Math.PI * lt) * 0.8;
      ctx.fillStyle = g;
      ctx.fillRect(x - len, y - 2 - rnd(i, 4) * 3, len * 2, 4 + rnd(i, 4) * 6);
    }
  ctx.globalCompositeOperation = 'source-over';
};
/** Hand-drawn arrow drawing itself from → to (frame coordinates). */
const arrow: W = (ctx, it, t, a) => {
  const p = palOf(it, a), from = arr<number>(it.from), to = arr<number>(it.to);
  if (from.length < 2 || to.length < 2) return;
  const bend = n(it.bend, 0.3), dx = to[0] - from[0], dy = to[1] - from[1];
  const cx = (from[0] + to[0]) / 2 - dy * bend, cy = (from[1] + to[1]) / 2 + dx * bend;
  const prog = k(t, 0.05, 0.6, 'ease');
  const pt = (u: number) => [(1 - u) ** 2 * from[0] + 2 * (1 - u) * u * cx + u * u * to[0], (1 - u) ** 2 * from[1] + 2 * (1 - u) * u * cy + u * u * to[1]];
  ctx.translate(-(it.x ?? 0), -(it.y ?? 0));
  ctx.strokeStyle = str(it.color, accent(it, p));
  ctx.lineWidth = n(it.lineWidth, 8);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 30; i++) {
    const [x, y] = pt((i / 30) * prog);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  if (prog > 0.9) {
    const [x1, y1] = pt(prog), [x0, y0] = pt(prog - 0.05), ang = Math.atan2(y1 - y0, x1 - x0), hl = 34 * clamp((prog - 0.9) * 10);
    ctx.beginPath();
    ctx.moveTo(x1 - Math.cos(ang - 0.5) * hl, y1 - Math.sin(ang - 0.5) * hl);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(ang + 0.5) * hl, y1 - Math.sin(ang + 0.5) * hl);
    ctx.stroke();
  }
};
/** Hand-drawn loop around something (draws on, slight overshoot like a pen). */
const circleDraw: W = (ctx, it, t, a) => {
  const p = palOf(it, a), w = n(it.w, 360), h = n(it.h, 160), prog = k(t, 0.05, 0.7, 'ease');
  ctx.strokeStyle = str(it.color, '#e5484d');
  ctx.lineWidth = n(it.lineWidth, 7);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const end = Math.PI * 2.15 * prog;
  for (let i = 0; i <= 60; i++) {
    const u = (i / 60) * end - 2.2, wob = 1 + Math.sin(u * 3) * 0.03 + (u / (Math.PI * 2)) * 0.06;
    const x = (Math.cos(u) * w * wob) / 2, y = (Math.sin(u) * h * wob) / 2 - 4;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  void p;
};
/** Confetti burst with gravity. */
const confetti: W = (ctx, it, t, a) => {
  const c = cols(it, a), count = n(it.count, 40);
  for (let i = 0; i < count; i++) {
    const ang = rnd(i, 1) * Math.PI * 2, sp = 500 + rnd(i, 2) * 700;
    const x = Math.cos(ang) * sp * t, y = Math.sin(ang) * sp * t * 0.8 + 900 * t * t;
    ctx.save();
    ctx.globalAlpha *= clamp(1.6 - t / Math.max(0.5, it.dur) * 1.6);
    ctx.translate(x, y);
    ctx.rotate(t * (4 + rnd(i, 3) * 6));
    ctx.fillStyle = c[i % c.length];
    ctx.fillRect(-8, -4, 16, 8 + rnd(i, 4) * 8);
    ctx.restore();
  }
};
/** Mouse pointer moving along points (frame coordinates) and clicking. */
const cursor: W = (ctx, it, t, a) => {
  const raw = arr<unknown>(it.points);
  const pts = raw.map((q) => (Array.isArray(q) ? { x: n(q[0], 0), y: n(q[1], 0), click: q[2] === 'click' } : { x: n((q as { x?: number }).x, 0), y: n((q as { y?: number }).y, 0), click: !!(q as { click?: boolean }).click }));
  if (!pts.length) return;
  ctx.translate(-(it.x ?? 0), -(it.y ?? 0));
  const seg = it.dur / Math.max(1, pts.length);
  const i = Math.min(pts.length - 1, Math.floor(t / seg)), lt = (t - i * seg) / seg;
  const a0 = pts[Math.max(0, i - 1)], b0 = pts[i];
  const mv = i === 0 ? 1 : k(lt, 0, 0.6, 'strong');
  const x = a0.x + (b0.x - a0.x) * mv, y = a0.y + (b0.y - a0.y) * mv;
  const press = b0.click && lt > 0.6 ? Math.sin(Math.PI * clamp((lt - 0.6) / 0.25)) : 0;
  if (b0.click && lt > 0.62) {
    const r = clamp((lt - 0.62) / 0.35);
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha *= 1 - r;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(b0.x, b0.y, 14 + r * 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const size = n(it.size, 56) * (1 - press * 0.15);
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1.4;
  const path = new Path2D(it.style === 'hand' ? 'M9 11V4.5a1.5 1.5 0 013 0V10m0-1.5a1.5 1.5 0 013 0V11m0-1a1.5 1.5 0 013 0v4.5a6.5 6.5 0 01-6.5 6.5h-.5a6 6 0 01-5-2.7L4 15a1.6 1.6 0 012.6-1.8L9 15V11' : 'M3 2l15 7.5-6.5 1.8L8 18z');
  ctx.fill(path);
  ctx.stroke(path);
  void a;
};
/** Click pulse rings (+ a small tap) at times. */
const clickPulse: W = (ctx, it, t, a) => {
  const ats = arr<number>(it.at).length ? arr<number>(it.at) : [0.4];
  ctx.strokeStyle = str(it.color, '#ffffff');
  for (const at of ats) {
    const r = (t - at) / 0.6;
    if (r < 0 || r > 1) continue;
    for (const d of [0, 0.25]) {
      const rr = clamp(r - d);
      ctx.globalAlpha = (1 - rr) * 0.9;
      ctx.lineWidth = 5 * (1 - rr) + 1;
      ctx.beginPath();
      ctx.arc(0, 0, 18 + rr * 70, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  void a;
};
/** Comic starburst behind a punch word. */
const starburst: W = (ctx, it, t, a) => {
  const pts = n(it.points, 14), size = n(it.size, 420), e = k(t, 0, 0.35, 'overshoot');
  ctx.rotate(Math.sin(t * 3) * 0.03);
  ctx.scale(e, e);
  const ring = (r: number, c: string) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const rr = i % 2 ? r * 0.72 : r, ang = (i / (pts * 2)) * Math.PI * 2;
      i ? ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();
  };
  ring(size / 2, str(it.color2, '#ff3b5c'));
  ring(size * 0.42, str(it.color, '#ffd23f'));
  if (it.text) label(ctx, str(it.text), 0, 4, size * 0.2, '#1a1a1a', { weight: 900, fam: 'Bangers' });
  void a;
};
/** "+1" / like badge popping and floating up. */
const plusBadge: W = (ctx, it, t, a) => {
  const ats = arr<number>(it.at).length ? arr<number>(it.at) : [0.2];
  const c = str(it.color, '#ff3b5c');
  for (const at of ats) {
    const lt = t - at;
    if (lt < 0 || lt > 1.4) continue;
    ctx.save();
    const e = k(lt, 0, 0.3, 'overshoot');
    ctx.translate(0, -lt * 90);
    ctx.globalAlpha *= clamp(1.4 - lt);
    ctx.scale(e, e);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.roundRect(-70, -40, 140, 80, 40);
    ctx.fill();
    if (it.icon) (ctx.save(), ctx.translate(-32, 0), a.icon(str(it.icon), '#ffffff', 34), ctx.restore());
    label(ctx, str(it.text, '+1'), it.icon ? 18 : 0, 2, 40, '#ffffff', { weight: 900 });
    ctx.restore();
  }
};
/** HUD target rings rotating around a point. */
const hudRings: W = (ctx, it, t) => {
  const size = n(it.size, 520), c = str(it.color, '#21c8e8'), e = k(t, 0, 0.6);
  ctx.strokeStyle = c;
  ctx.globalAlpha *= e;
  [[1, 0.6, [40, 20]], [0.82, -0.9, [8, 14]], [0.64, 1.4, [120, 30]]].forEach(([r, sp, dash]) => {
    ctx.save();
    ctx.rotate(t * (sp as number));
    ctx.setLineDash(dash as number[]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, (size / 2) * (r as number) * (0.7 + 0.3 * e), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
  if (it.label) label(ctx, str(it.label), 0, size / 2 + 40, 26, c, { weight: 700, fam: 'Oswald', spacing: 6 });
};
/** Stage spotlight cone from above with dust. */
const spotlight: W = (ctx, it, t, a) => {
  const w = n(it.w, 700), c = str(it.color, '#fff2cf'), on = k(t, n(it.on, 0.2), 0.3);
  const { h } = a.frame;
  ctx.globalAlpha *= on * 0.55;
  const g = ctx.createLinearGradient(0, -h, 0, 0);
  g.addColorStop(0, c);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w * 0.12, -h);
  ctx.lineTo(w * 0.12, -h);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(-w / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c;
  for (let i = 0; i < 24; i++) {
    ctx.globalAlpha = on * 0.5 * rnd(i, 3);
    ctx.fillRect((rnd(i, 1) - 0.5) * w * 0.7, -((rnd(i, 2) + t * 0.05 * (1 + rnd(i, 5))) % 1) * h, 3, 3);
  }
};

export const FX_WIDGET_DRAW: Record<string, W> = {
  burst, wipe, slices, 'band-wipe': bandWipe, sparkles, rays, 'speed-lines': speedLines, 'light-streaks': lightStreaks, arrow, 'circle-draw': circleDraw,
  confetti, cursor, 'click-pulse': clickPulse, starburst, 'plus-badge': plusBadge, 'hud-rings': hudRings, spotlight,
};
/** Widgets drawn in screen space (no camera): full-frame transitions and screen effects. */
export const SCREEN_WIDGETS = new Set(['burst', 'wipe', 'slices', 'band-wipe', 'speed-lines', 'light-streaks']);
