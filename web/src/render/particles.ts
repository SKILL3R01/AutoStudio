/**
 * Deterministic particle effects: every particle's position is a closed-form function of time (no stored simulation),
 * so preview, scrubbing and export always match frame for frame. Used by built-ins and the particle designer.
 */
import { hash } from '../lib/util';

export type Emitter = 'bottom' | 'top' | 'area' | 'center' | 'left' | 'right';
export type Shape = 'dot' | 'streak' | 'spark' | 'heart' | 'star' | 'square' | 'smoke';

export interface ParticleSpec {
  emitter: Emitter;
  /** Particles alive at once at 100 % intensity. */
  count: number;
  /** Seconds each particle lives. */
  life: number;
  /** Speed in screen heights per second. */
  speed: number;
  /** Direction in degrees (0 = up, 90 = right, 180 = down). */
  direction: number;
  /** Random spread around the direction, degrees. */
  spread: number;
  /** Screen heights per second² (positive = falls). */
  gravity: number;
  wind: number;
  /** Size in % of screen height. */
  size: number;
  sizeEnd: number;
  colors: string[];
  shape: Shape;
  blend: 'add' | 'normal';
  glow: number;
  spin: number;
}

export const PARTICLE_PRESETS: Record<string, { label: string; spec: ParticleSpec }> = {
  sparks: { label: 'Sparks', spec: { emitter: 'bottom', count: 90, life: 1.6, speed: 0.75, direction: 0, spread: 35, gravity: 0.55, wind: 0.05, size: 0.35, sizeEnd: 0.1, colors: ['#fff4c2', '#ffb43d', '#ff6a1a'], shape: 'spark', blend: 'add', glow: 0.8, spin: 0 } },
  smoke: { label: 'Smoke', spec: { emitter: 'bottom', count: 26, life: 6, speed: 0.07, direction: 0, spread: 25, gravity: -0.01, wind: 0.03, size: 9, sizeEnd: 26, colors: ['rgba(200,200,205,0.22)', 'rgba(150,150,160,0.12)'], shape: 'smoke', blend: 'normal', glow: 0, spin: 0.2 } },
  confetti: { label: 'Confetti', spec: { emitter: 'top', count: 120, life: 4.5, speed: 0.12, direction: 180, spread: 30, gravity: 0.05, wind: 0.04, size: 1.1, sizeEnd: 1.1, colors: ['#ff4d6d', '#ffd23f', '#3bceac', '#4d96ff', '#b388ff'], shape: 'square', blend: 'normal', glow: 0, spin: 4 } },
  hearts: { label: 'Hearts', spec: { emitter: 'bottom', count: 28, life: 4, speed: 0.22, direction: 0, spread: 20, gravity: -0.02, wind: 0.02, size: 2.6, sizeEnd: 1.4, colors: ['#ff4d8d', '#ff7aa8', '#ffb3c8'], shape: 'heart', blend: 'normal', glow: 0.3, spin: 0.6 } },
  stars: { label: 'Star burst', spec: { emitter: 'center', count: 60, life: 2.2, speed: 0.35, direction: 0, spread: 180, gravity: 0.04, wind: 0, size: 1.6, sizeEnd: 0.2, colors: ['#fff6b0', '#ffd23f', '#ffffff'], shape: 'star', blend: 'add', glow: 0.6, spin: 2 } },
};

const rnd = (i: number, k: number) => hash(i * 12.9898 + k * 78.233);

function shapePath(g: CanvasRenderingContext2D, shape: Shape, r: number) {
  g.beginPath();
  if (shape === 'heart') {
    g.moveTo(0, r * 0.35);
    g.bezierCurveTo(-r * 1.2, -r * 0.45, -r * 0.45, -r * 1.25, 0, -r * 0.45);
    g.bezierCurveTo(r * 0.45, -r * 1.25, r * 1.2, -r * 0.45, 0, r * 0.35);
  } else if (shape === 'star') {
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r;
      k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  } else if (shape === 'square') g.rect(-r, -r * 0.6, r * 2, r * 1.2);
  else g.arc(0, 0, r, 0, Math.PI * 2);
}

/** Draw a particle system at time t. `amount` 0..1 scales the count; `quality` thins it for fast preview. */
export function drawParticles(g: CanvasRenderingContext2D, s: ParticleSpec, amount: number, t: number, W: number, H: number, quality = 1, seed = 1) {
  const n = Math.max(1, Math.round(s.count * amount * quality));
  g.save();
  g.globalCompositeOperation = s.blend === 'add' ? 'lighter' : 'source-over';
  for (let i = 0; i < n; i++) {
    // Each slot respawns every `life` seconds with a phase offset, so the stream is continuous.
    const phase = rnd(i, seed) * s.life;
    const cycle = Math.floor((t + phase) / s.life);
    const a = (t + phase) / s.life - cycle; // 0..1 age
    const age = a * s.life;
    const k = i * 7.13 + cycle * 3.71 + seed;
    const ex = rnd(k, 1), ey = rnd(k, 2);
    let x = ex * W, y = ey * H;
    if (s.emitter === 'bottom') y = H * (1.02 + 0.02 * ey);
    else if (s.emitter === 'top') y = -H * 0.03;
    else if (s.emitter === 'left') (x = -W * 0.02), (y = ey * H);
    else if (s.emitter === 'right') (x = W * 1.02), (y = ey * H);
    else if (s.emitter === 'center') (x = W * (0.5 + (ex - 0.5) * 0.08)), (y = H * (0.5 + (ey - 0.5) * 0.08));
    const dir = ((s.direction + (rnd(k, 3) - 0.5) * 2 * s.spread) * Math.PI) / 180;
    const sp = s.speed * H * (0.6 + 0.8 * rnd(k, 4));
    x += Math.sin(dir) * sp * age + s.wind * H * age * age * 0.5 * (0.5 + rnd(k, 5));
    y += -Math.cos(dir) * sp * age + 0.5 * s.gravity * H * age * age;
    const size = ((s.size + (s.sizeEnd - s.size) * a) / 100) * H * (0.6 + 0.8 * rnd(k, 6));
    const fade = Math.min(1, a / 0.12, (1 - a) / 0.3);
    if (fade <= 0 || size <= 0) continue;
    g.globalAlpha = fade;
    const col = s.colors[Math.floor(rnd(k, 7) * s.colors.length)] ?? '#fff';
    g.save();
    g.translate(x, y);
    if (s.spin) g.rotate((rnd(k, 8) - 0.5) * 6 + age * s.spin * (rnd(k, 9) > 0.5 ? 1 : -1));
    if (s.glow > 0) (g.shadowColor = col), (g.shadowBlur = size * 3 * s.glow);
    if (s.shape === 'streak' || s.shape === 'spark') {
      const vx = Math.sin(dir) * sp, vy = -Math.cos(dir) * sp + s.gravity * H * age;
      const len = Math.hypot(vx, vy) || 1, l = size * (s.shape === 'spark' ? 6 : 10);
      g.strokeStyle = col;
      g.lineWidth = Math.max(1, size);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo((-vx / len) * l, (-vy / len) * l);
      g.stroke();
    } else if (s.shape === 'smoke') {
      const r = g.createRadialGradient(0, 0, 0, 0, 0, size);
      r.addColorStop(0, col);
      r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r;
      g.fillRect(-size, -size, size * 2, size * 2);
    } else {
      g.fillStyle = col;
      shapePath(g, s.shape, size);
      g.fill();
    }
    g.restore();
  }
  g.restore();
}

/** Lightning: occasional flashes with a branching bolt (seeded per strike). */
export function drawLightning(g: CanvasRenderingContext2D, amount: number, t: number, W: number, H: number) {
  const period = 3.2 - 1.6 * amount;
  const strike = Math.floor(t / period), local = t - strike * period;
  if (local > 0.35) return;
  const flash = local < 0.06 ? 1 : local < 0.12 ? 0.3 : local < 0.18 ? 0.8 : Math.max(0, 1 - (local - 0.18) / 0.17);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = `rgba(200,215,255,${0.35 * flash * amount})`;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = `rgba(235,240,255,${flash})`;
  g.shadowColor = '#9fb8ff';
  g.shadowBlur = H * 0.03;
  const bolt = (x: number, y: number, depth: number, k: number) => {
    g.lineWidth = Math.max(1, (H * 0.006) / (depth + 1));
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 14 && y < H * 0.85; s++) {
      x += (rnd(k, s) - 0.5) * W * 0.06;
      y += H * (0.035 + 0.04 * rnd(k, s + 30));
      g.lineTo(x, y);
      if (depth < 2 && rnd(k, s + 60) > 0.86) bolt(x, y, depth + 1, k * 1.7 + s);
    }
    g.stroke();
  };
  bolt(W * (0.2 + 0.6 * rnd(strike, 99)), 0, 0, strike + 1);
  g.restore();
}
