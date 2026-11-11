/** Draws Motion groups (shared by preview and export): backgrounds, text, shapes, SVG, icons, lights, placeholders. */
import type { MotionGroup, MotionItem, MotionPalette } from './types';
import { cameraAt, poseAt, type Pose } from './anim';
import { PATHS } from '../components/icons';
import { LUCIDE } from './lucide';

/** Closest icon name in the bundled set ("house" ← "home", "chart" ← "chart-line"…). */
export function iconName(name: string): string {
  const n = name.toLowerCase().trim();
  if (LUCIDE[n]) return n;
  const alias: Record<string, string> = { home: 'house', person: 'user', people: 'users', money: 'banknote', chart: 'chart-line', love: 'heart', idea: 'lightbulb', time: 'clock', email: 'mail', world: 'globe', ok: 'check', close: 'x', warning: 'triangle-alert', fire: 'flame', light: 'lightbulb', face: 'smile', 'face-slightly-smiling': 'smile', 'fingerprint-pattern': 'fingerprint' };
  if (alias[n] && LUCIDE[alias[n]]) return alias[n];
  const k = Object.keys(LUCIDE).find((x) => x.startsWith(n) || n.startsWith(x)) ?? Object.keys(LUCIDE).find((x) => x.split('-').some((p) => n.split('-').includes(p)));
  return k ?? 'star';
}
const iconSvg = (name: string, color: string, width = 2) => `<svg viewBox='0 0 24 24' fill='none' stroke='${color}' stroke-width='${width}' stroke-linecap='round' stroke-linejoin='round'>${LUCIDE[iconName(name)]}</svg>`;

const RTL = /[\u0590-\u08ff]/;
const col = (v: unknown, pal: MotionPalette, d: string): string => {
  if (typeof v !== 'string' || !v) return d;
  const named: Record<string, string> = { gold: '#e8b86a', white: '#ffffff', black: '#000000', dark: pal.bg, cream: '#f6efe4', blue: '#2f6fde', violet: '#7c6cff', green: '#19c39c', pink: '#ff4fa3', red: '#e5484d', orange: '#ff7a1a', cyan: '#21c8e8', teal: '#2fa3a0', yellow: '#ffd23f' };
  return named[v] ?? v.trim();
};

/** Where a group draws on a W×H frame and how its recipe pixels map onto it. */
export function groupRect(g: MotionGroup, W: number, H: number) {
  const r = g.placement === 'band' ? { x: 0, y: g.band?.side === 'bottom' ? H * (1 - (g.band?.h ?? 0.5)) : 0, w: W, h: H * (g.band?.h ?? 0.5) } : { x: 0, y: 0, w: W, h: H };
  const s = Math.min(r.w / g.frame.w, r.h / g.frame.h);
  return { ...r, s, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

const svgCache = new Map<string, HTMLImageElement | 'loading' | 'error'>();
let onLoaded: (() => void) | null = null;
/** Called when an SVG finished loading (the preview repaints). */
export const onMotionAsset = (fn: () => void) => void (onLoaded = fn);
function svgImage(svg: string): HTMLImageElement | undefined {
  const hit = svgCache.get(svg);
  if (hit instanceof HTMLImageElement) return hit;
  if (hit) return undefined;
  const clean = svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+=("[^"]*"|'[^']*')/gi, '').replace(/(href|xlink:href)=("|')(?!#)[^"']*\2/gi, '');
  const withNs = /xmlns=/.test(clean) ? clean : clean.replace('<svg', "<svg xmlns='http://www.w3.org/2000/svg'");
  const img = new Image();
  svgCache.set(svg, 'loading');
  img.onload = () => (svgCache.set(svg, img), onLoaded?.());
  img.onerror = () => svgCache.set(svg, 'error');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(withNs);
  return undefined;
}
/** Resolve once every SVG of these groups is loaded (export waits for it). */
export async function preloadMotion(groups: MotionGroup[]) {
  const svgs = groups.flatMap((g) => g.items.flatMap((i) => {
    if (typeof i.svg === 'string') return [i.svg];
    if (i.type !== 'icon') return [];
    const c = col(i.color, g.palette, g.palette.accents[0]);
    return [iconSvg(String(i.name ?? 'star'), c), iconSvg(String(i.name ?? 'star'), '#ffffff')];
  }));
  svgs.forEach(svgImage);
  const fonts = new Set(groups.flatMap((g) => g.items.filter((i) => i.type === 'text').map((i) => `${i.weight ?? 800} 64px "${String(i.font ?? g.palette.font ?? 'Montserrat')}"`)));
  await Promise.all([...fonts].map((f) => document.fonts.load(f).catch(() => undefined)));
  for (let k = 0; k < 100 && svgs.some((s) => svgCache.get(s) === 'loading'); k++) await new Promise((r) => setTimeout(r, 30));
}

/** Draw every visible group of one placement layer at time t. */
export function drawMotion(g2: CanvasRenderingContext2D, groups: MotionGroup[] | undefined, layer: 'full' | 'overlay', t: number, W: number, H: number) {
  for (const g of groups ?? []) {
    if (g.hidden || t < g.start || t >= g.start + g.dur) continue;
    if ((layer === 'full') !== (g.placement === 'full' || g.placement === 'band')) continue;
    drawGroup(g2, g, t - g.start, W, H);
  }
}

export function drawGroup(ctx: CanvasRenderingContext2D, g: MotionGroup, lt: number, W: number, H: number) {
  const R = groupRect(g, W, H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x, R.y, R.w, R.h);
  ctx.clip();
  const cam = cameraAt(g.items, lt);
  for (const it of g.items) {
    if (lt < it.start || lt >= it.start + it.dur || it.type === 'camera' || it.type === 'marker') continue;
    const local = lt - it.start;
    ctx.save();
    if (it.type === 'background') drawBackground(ctx, it, local, g.palette, R);
    else if (it.type === 'light') drawLight(ctx, it, local, R);
    else {
      // Camera: zoom around its look-at point, everything except backgrounds and lights follows it.
      ctx.translate(R.cx, R.cy);
      ctx.scale(R.s, R.s);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.rotate((cam.rot * Math.PI) / 180);
      ctx.translate(-cam.x, -cam.y);
      drawItem(ctx, it, local, g.palette);
    }
    ctx.restore();
  }
  ctx.restore();
}

function place(ctx: CanvasRenderingContext2D, it: MotionItem, p: Pose) {
  ctx.translate((it.x ?? 0) + p.dx + (p.jitter ? Math.sin(p.jitter * 97) * p.jitter : 0), (it.y ?? 0) + p.dy);
  ctx.rotate((((it.rotation ?? 0) + p.rot) * Math.PI) / 180);
  const sc = (it.scale ?? 1) * p.scale;
  ctx.scale(sc * p.sx, sc * p.sy);
  ctx.globalAlpha *= Math.max(0, Math.min(1, p.alpha));
  if (p.blur > 0.3) ctx.filter = `blur(${p.blur.toFixed(1)}px)`;
}

/** Mask reveal: a left-to-right (or other direction) wipe of the box w×h around the origin. */
function revealClip(ctx: CanvasRenderingContext2D, dir: string | undefined, k: number, w: number, h: number) {
  if (k >= 1) return;
  ctx.beginPath();
  const d = dir ?? 'right';
  if (d === 'left') ctx.rect(w / 2 - w * k, -h / 2, w * k, h);
  else if (d === 'up') ctx.rect(-w / 2, h / 2 - h * k, w, h * k);
  else if (d === 'down') ctx.rect(-w / 2, -h / 2, w, h * k);
  else if (d === 'center') ctx.rect((-w / 2) * k, -h / 2, w * k, h);
  else ctx.rect(-w / 2, -h / 2, w * k, h);
  ctx.clip();
}

function drawItem(ctx: CanvasRenderingContext2D, it: MotionItem, t: number, pal: MotionPalette) {
  const size = typeof it.size === 'number' ? it.size : Math.max(it.w ?? 0, it.h ?? 0, 100);
  const p = poseAt(it, t, size);
  place(ctx, it, p);
  if (it.type === 'text') return drawText(ctx, it, t, p, pal);
  const w = it.w ?? size, h = it.h ?? size;
  revealClip(ctx, typeof it.reveal === 'string' ? it.reveal : 'right', p.reveal, w * 1.2, h * 1.2);
  if (it.type === 'shape') return drawShape(ctx, it, t, pal, w, h);
  if (it.type === 'svg' || it.type === 'vector') {
    const img = typeof it.svg === 'string' ? svgImage(it.svg) : undefined;
    if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h);
    return;
  }
  if (it.type === 'icon') return drawIcon(ctx, String(it.name ?? 'star'), col(it.color, pal, pal.accents[0]), typeof it.size === 'number' ? it.size : 120, String(it.style ?? 'line'));
  if (it.type === 'widget' && FX_WIDGETS.has(String(it.widget))) return;
  drawPlaceholder(ctx, it, pal);
}

/** Effect / transition widgets: no placeholder card (they draw nothing until they are built natively). */
const FX_WIDGETS = new Set(['burst', 'wipe', 'slices', 'band-wipe', 'sparkles', 'rays', 'speed-lines', 'light-streaks', 'confetti', 'fog', 'glow-arc', 'eclipse', 'spotlight', 'click-pulse', 'cursor', 'arrow', 'circle-draw', 'diagonal-bg', 'plus-badge', 'hud-rings', 'starburst']);

function drawShape(ctx: CanvasRenderingContext2D, it: MotionItem, t: number, pal: MotionPalette, w: number, h: number) {
  const c = col(it.color, pal, pal.accents[0]);
  const lw = typeof it.lineWidth === 'number' ? it.lineWidth : 6;
  const fill = it.fill !== false && it.shape !== 'ring' && it.shape !== 'frame' && it.shape !== 'line';
  const path = new Path2D();
  const r = typeof it.radius === 'number' ? it.radius : 24;
  switch (it.shape) {
    case 'ellipse': case 'ring': path.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case 'roundrect': case 'frame': path.roundRect(-w / 2, -h / 2, w, h, r); break;
    case 'line': path.moveTo(-w / 2, 0); path.lineTo(w / 2, 0); break;
    case 'triangle': path.moveTo(0, -h / 2); path.lineTo(w / 2, h / 2); path.lineTo(-w / 2, h / 2); path.closePath(); break;
    case 'star': case 'polygon': {
      const n = typeof it.points === 'number' ? it.points : it.shape === 'star' ? 5 : 6;
      for (let k = 0; k < n * (it.shape === 'star' ? 2 : 1); k++) {
        const a = (k / (n * (it.shape === 'star' ? 2 : 1))) * Math.PI * 2 - Math.PI / 2, rr = it.shape === 'star' && k % 2 ? 0.45 : 1;
        k ? path.lineTo(Math.cos(a) * (w / 2) * rr, Math.sin(a) * (h / 2) * rr) : path.moveTo(Math.cos(a) * (w / 2), Math.sin(a) * (h / 2));
      }
      path.closePath();
      break;
    }
    case 'path': {
      const vb = Array.isArray(it.viewBox) ? (it.viewBox as number[]) : [w, h];
      const m = new DOMMatrix().translate(-w / 2, -h / 2).scale(w / vb[0], h / vb[1]);
      path.addPath(new Path2D(String(it.d ?? '')), m);
      break;
    }
    default: path.rect(-w / 2, -h / 2, w, h);
  }
  if (it.glow) (ctx.shadowColor = col(it.glow, pal, c)), (ctx.shadowBlur = 30);
  else if (it.shadow) (ctx.shadowColor = 'rgba(0,0,0,0.35)'), (ctx.shadowBlur = 24), (ctx.shadowOffsetY = 10);
  if (fill) {
    if (typeof it.color2 === 'string') {
      const gr = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      gr.addColorStop(0, c);
      gr.addColorStop(1, col(it.color2, pal, c));
      ctx.fillStyle = gr;
    } else ctx.fillStyle = c;
    ctx.fill(path);
  } else {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    if (Array.isArray(it.dash)) ctx.setLineDash(it.dash as number[]);
    const draw = typeof it.draw === 'number' ? it.draw : 0;
    if (draw > 0) {
      // Stroke draws on over `draw` seconds (dash trick, measured length approximated by the box perimeter).
      const L = (w + h) * 2.2;
      ctx.setLineDash([L, L]);
      ctx.lineDashOffset = L * (1 - Math.min(1, t / draw));
    }
    ctx.stroke(path);
    if (it.strokeChase) {
      const L = (w + h) * 2.2;
      ctx.setLineDash([L * 0.06, L]);
      ctx.lineDashOffset = -((t * L * 0.35) % L);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = lw * 1.2;
      ctx.stroke(path);
    }
  }
}

function drawIcon(ctx: CanvasRenderingContext2D, name: string, color: string, size: number, style: string) {
  let stroke = color;
  if (style === 'badge' || style === 'squircle' || style === 'soft' || style === 'glass' || style === 'gradient') {
    ctx.save();
    if (style === 'gradient') {
      const g = ctx.createLinearGradient(-size * 0.7, -size * 0.7, size * 0.7, size * 0.7);
      g.addColorStop(0, color);
      g.addColorStop(1, shade(color, -0.35));
      ctx.fillStyle = g;
    } else ctx.fillStyle = style === 'glass' ? 'rgba(255,255,255,0.14)' : style === 'soft' ? shade(color, 0.75) : color;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = size * 0.2;
    ctx.shadowOffsetY = size * 0.06;
    ctx.beginPath();
    ctx.roundRect(-size * 0.75, -size * 0.75, size * 1.5, size * 1.5, style === 'badge' ? size * 0.75 : size * 0.36);
    ctx.fill();
    ctx.restore();
    stroke = style === 'glass' || style === 'soft' ? color : '#ffffff';
  }
  if (style === 'neon') (ctx.shadowColor = color), (ctx.shadowBlur = size * 0.35);
  const img = svgImage(iconSvg(name, stroke));
  if (img) ctx.drawImage(img, -size / 2, -size / 2, size, size);
  else if (PATHS[name]) {
    ctx.scale(size / 24, size / 24);
    ctx.translate(-12, -12);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke(new Path2D(PATHS[name]));
  }
}

/** Lighten (k > 0) or darken (k < 0) a #hex colour. */
export function shade(hex: string, k: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return '#' + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, it: MotionItem, pal: MotionPalette) {
  const w = it.w ?? 520, h = it.h ?? 300;
  ctx.fillStyle = pal.card;
  ctx.globalAlpha *= 0.92;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 22);
  ctx.fill();
  ctx.setLineDash([12, 10]);
  ctx.strokeStyle = pal.accents[0];
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = pal.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = String(it.type === 'widget' ? it.widget ?? 'widget' : it.kind ?? it.label ?? it.type);
  const sub = String(it.title ?? it.text ?? it.label ?? it.value ?? '');
  ctx.font = `800 ${Math.min(56, w / 8)}px "${pal.font ?? 'Montserrat'}"`;
  ctx.fillText(label.toUpperCase(), 0, sub ? -18 : 0);
  if (sub) (ctx.font = `500 ${Math.min(34, w / 14)}px "${pal.font ?? 'Montserrat'}"`), ctx.fillText(sub.slice(0, 40), 0, 30);
}

/** Text: wrapping, right-to-left, per-word highlights, letter / word reveals, gradient / stroke / glow. */
function drawText(ctx: CanvasRenderingContext2D, it: MotionItem, t: number, p: Pose, pal: MotionPalette) {
  const raw = String(it.text ?? '');
  const text = it.upper ? raw.toUpperCase() : raw;
  const size = typeof it.size === 'number' ? it.size : 80;
  const font = String(it.font ?? pal.font ?? 'Montserrat');
  const weight = it.weight ?? 800;
  ctx.font = `${it.italic ? 'italic ' : ''}${weight} ${size}px "${font}"`;
  const rtl = RTL.test(text);
  ctx.direction = rtl ? 'rtl' : 'ltr';
  const spacing = typeof it.spacing === 'number' ? it.spacing : 0;
  if (spacing) (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing}px`;
  const maxW = typeof it.width === 'number' ? it.width : 1600;
  const words = text.split(/\s+/).filter(Boolean);
  const space = ctx.measureText(' ').width;
  const lines: { w: string; width: number }[][] = [[]];
  let lineW = 0;
  for (const w of words) {
    const ww = ctx.measureText(w).width;
    if (lineW && lineW + space + ww > maxW) (lines.push([]), (lineW = 0));
    lines[lines.length - 1].push({ w, width: ww });
    lineW += (lineW ? space : 0) + ww;
  }
  const lh = size * (typeof it.lineHeight === 'number' ? it.lineHeight : 1.15);
  const align = String(it.align ?? 'center');
  const total = words.length;
  const shown = p.letters < 1 ? p.letters : 1;
  const famWords = /word/.test(String(it.in ?? ''));
  const chars = text.replace(/\s+/g, '').length;
  let wi = 0, ci = 0;
  const hl = Array.isArray(it.highlight) ? (it.highlight as { word: string; style?: string; bg?: string; color?: string; gradient?: string[]; at?: number }[]) : [];
  const baseColor = col(it.color, pal, pal.text);
  if (it.glow) (ctx.shadowColor = col(it.glow, pal, baseColor)), (ctx.shadowBlur = size * 0.35);
  else if (it.shadow !== false) (ctx.shadowColor = 'rgba(0,0,0,0.35)'), (ctx.shadowBlur = size * 0.12), (ctx.shadowOffsetY = size * 0.04);
  if (p.glow > 0) (ctx.shadowColor = baseColor), (ctx.shadowBlur = size * 0.6 * p.glow);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  lines.forEach((ln, li) => {
    const lw = ln.reduce((a, x) => a + x.width, 0) + space * (ln.length - 1);
    const y = (li - (lines.length - 1) / 2) * lh;
    let x = align === 'left' ? -maxW / 2 : align === 'right' ? maxW / 2 - lw : -lw / 2;
    const order = rtl ? [...ln].reverse() : ln;
    for (const w of order) {
      const myIndex = rtl ? wi + ln.length - 1 - order.indexOf(w) : wi + order.indexOf(w);
      const clean = w.w.replace(/[.,!?؟،:;"'«»]+/g, '').toLowerCase();
      const h = hl.find((q) => clean === q.word.toLowerCase() || clean.includes(q.word.toLowerCase()));
      let vis = 1, partial = w.w;
      if (shown < 1) {
        if (famWords) vis = Math.max(0, Math.min(1, shown * total - myIndex));
        else {
          const n = Math.floor(shown * chars) - ci;
          partial = n <= 0 ? '' : w.w.slice(0, n);
        }
      }
      ctx.save();
      ctx.globalAlpha *= vis;
      if (famWords && vis < 1) ctx.translate(0, (1 - vis) * size * 0.4);
      const hk = h ? Math.max(0, Math.min(1, (t - (h.at ?? 0.6)) / 0.35)) : 0;
      if (h && hk > 0 && (h.style === 'marker' || h.style === 'box')) {
        ctx.save();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = col(h.bg, pal, pal.accents[1] ?? '#ffd23f');
        ctx.fillRect(x - size * 0.08, y - size * 0.42, (w.width + size * 0.16) * hk, size * 0.84);
        ctx.restore();
      }
      if (h && hk > 0 && (h.gradient || h.style === 'color')) {
        const gr = ctx.createLinearGradient(x, y - size / 2, x + w.width, y + size / 2);
        const gc = h.gradient ?? [col(h.color, pal, pal.accents[0]), col(h.color, pal, pal.accents[0])];
        gr.addColorStop(0, col(gc[0], pal, baseColor));
        gr.addColorStop(1, col(gc[gc.length - 1], pal, baseColor));
        ctx.fillStyle = hk < 1 ? baseColor : gr;
      } else if (Array.isArray(it.gradient) && it.gradient.length > 1) {
        const gr = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
        gr.addColorStop(0, col(it.gradient[0], pal, baseColor));
        gr.addColorStop(1, col(it.gradient[it.gradient.length - 1], pal, baseColor));
        ctx.fillStyle = gr;
      } else ctx.fillStyle = h?.color && hk > 0 && h.style !== 'underline' && h.style !== 'circle' ? col(h.color, pal, baseColor) : baseColor;
      if (it.stroke && typeof it.stroke === 'object') {
        const s = it.stroke as { color?: string; width?: number };
        ctx.strokeStyle = col(s.color, pal, '#000');
        ctx.lineWidth = s.width ?? 6;
        ctx.lineJoin = 'round';
        ctx.strokeText(partial, x, y);
      }
      ctx.fillText(partial, x, y);
      if (h && hk > 0 && (h.style === 'underline' || h.style === 'strike')) {
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = col(h.color, pal, pal.accents[0]);
        ctx.fillRect(x, h.style === 'strike' ? y - size * 0.04 : y + size * 0.42, w.width * hk, size * 0.08);
      }
      if (h && hk > 0 && h.style === 'circle') {
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = col(h.color, pal, pal.accents[0]);
        ctx.lineWidth = size * 0.06;
        ctx.beginPath();
        ctx.ellipse(x + w.width / 2, y, w.width * 0.62, size * 0.62, -0.05, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hk);
        ctx.stroke();
      }
      ctx.restore();
      ci += w.w.length;
      x += w.width + space;
    }
    wi += ln.length;
  });
}

function drawBackground(ctx: CanvasRenderingContext2D, it: MotionItem, t: number, pal: MotionPalette, R: { x: number; y: number; w: number; h: number }) {
  const cs = (Array.isArray(it.colors) ? (it.colors as string[]) : []).map((c) => col(c, pal, pal.bg));
  const c0 = cs[0] ?? pal.bg, c1 = cs[1] ?? pal.card, c2 = cs[2] ?? pal.accents[0];
  const kind = String(it.kind ?? 'flat');
  const { x, y, w, h } = R;
  const fade = Math.min(1, t / 0.15);
  ctx.globalAlpha *= fade;
  if (kind === 'gradient' || kind === 'theme' || kind === 'studio') {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, c0);
    g.addColorStop(1, cs[1] ?? pal.card);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    return;
  }
  ctx.fillStyle = c0;
  ctx.fillRect(x, y, w, h);
  if (kind === 'split') {
    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.55, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w * 0.4, y + h);
    ctx.fill();
  } else if (kind === 'glow' || kind === 'spotlight' || kind === 'mesh' || kind === 'aurora' || kind === 'wave') {
    const blobs = kind === 'glow' || kind === 'spotlight' ? [[0.5, kind === 'spotlight' ? 0.2 : 0.5, c1]] : [[0.25 + Math.sin(t * 0.4) * 0.08, 0.35, c1], [0.75, 0.6 + Math.cos(t * 0.3) * 0.08, c2], [0.5 + Math.sin(t * 0.25) * 0.1, 0.9, cs[3] ?? c1]];
    for (const [bx, by, bc] of blobs as [number, number, string][]) {
      const g = ctx.createRadialGradient(x + w * bx, y + h * by, 0, x + w * bx, y + h * by, Math.max(w, h) * 0.6);
      g.addColorStop(0, bc);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = fade * (kind === 'glow' ? 0.55 : 0.5);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
  } else if (kind === 'grid' || kind === 'dots' || kind === 'lines' || kind === 'hud' || kind === 'paper') {
    const step = Math.max(24, Math.round(Math.min(w, h) / 18));
    ctx.strokeStyle = cs[1] ?? (kind === 'hud' ? pal.accents[0] : 'rgba(0,0,0,0.12)');
    ctx.fillStyle = ctx.strokeStyle;
    ctx.globalAlpha = fade * (kind === 'hud' ? 0.25 : kind === 'paper' ? 0.06 : 0.35);
    ctx.lineWidth = 1;
    if (kind === 'dots') for (let i = x; i < x + w; i += step) for (let j = y; j < y + h; j += step) ctx.fillRect(i, j, 2, 2);
    else if (kind === 'paper') for (let k = 0; k < 400; k++) ctx.fillRect(x + ((k * 7919) % w), y + ((k * 104729) % h), 2, 2);
    else {
      ctx.beginPath();
      for (let j = y; j < y + h; j += step) (ctx.moveTo(x, j), ctx.lineTo(x + w, j));
      if (kind !== 'lines') for (let i = x; i < x + w; i += step) (ctx.moveTo(i, y), ctx.lineTo(i, y + h));
      ctx.stroke();
    }
    if (kind === 'hud') {
      ctx.globalAlpha = fade * 0.5;
      const sy = y + ((t * 0.25) % 1) * h;
      ctx.fillRect(x, sy, w, 2);
    }
  } else if (kind === 'floor') {
    ctx.strokeStyle = c1;
    ctx.globalAlpha = fade * 0.5;
    ctx.beginPath();
    const hy = y + h * 0.55;
    for (let k = -12; k <= 12; k++) (ctx.moveTo(x + w / 2, hy), ctx.lineTo(x + w / 2 + k * w * 0.12, y + h));
    for (let k = 0; k < 10; k++) {
      const yy = hy + (h - (hy - y)) * ((k + ((t * 0.5) % 1)) / 10) ** 2;
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
    }
    ctx.stroke();
  }
}

function drawLight(ctx: CanvasRenderingContext2D, it: MotionItem, t: number, R: { x: number; y: number; w: number; h: number }) {
  const kind = String(it.light ?? it.name ?? '');
  const { x, y, w, h } = R;
  if (/vignette/.test(kind)) {
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.35, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  } else if (/grain/.test(kind)) {
    ctx.globalAlpha = 0.06;
    const seed = Math.floor(t * 24);
    for (let k = 0; k < 900; k++) {
      ctx.fillStyle = (k + seed) % 2 ? '#fff' : '#000';
      ctx.fillRect(x + (((k + 1) * 7919 * (seed + 3)) % w), y + (((k + 7) * 104729 * (seed + 5)) % h), 2, 2);
    }
  } else if (/sweep|flare|leak|rays/.test(kind)) {
    const k = (t / Math.max(0.5, it.dur)) % 1;
    const g = ctx.createLinearGradient(x + w * (k - 0.3), y, x + w * k, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, /warm|gold/.test(kind) ? 'rgba(255,190,110,0.28)' : 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  } else if (/bars/.test(kind)) {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h * 0.1);
    ctx.fillRect(x, y + h * 0.9, w, h * 0.1);
  }
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** Layer boxes on the preview at time t (normalised 0..1 like `hitBoxes`), topmost last. `k` = canvas px per recipe px. */
export function motionHits(groups: MotionGroup[] | undefined, t: number, W: number, H: number) {
  const out: { ref: string; x: number; y: number; w: number; h: number; k: number }[] = [];
  measureCtx ??= document.createElement('canvas').getContext('2d');
  for (const g of groups ?? []) {
    if (g.hidden || t < g.start || t >= g.start + g.dur) continue;
    const lt = t - g.start, R = groupRect(g, W, H), cam = cameraAt(g.items, lt), k = R.s * cam.zoom;
    for (const it of g.items) {
      if (lt < it.start || lt >= it.start + it.dur || ['background', 'light', 'camera', 'marker'].includes(it.type)) continue;
      if (it.type === 'widget' && FX_WIDGETS.has(String(it.widget))) continue;
      const p = poseAt(it, lt - it.start, 100);
      const sc = (it.scale ?? 1) * p.scale;
      let w = it.w ?? 0, h = it.h ?? 0;
      if (it.type === 'text') {
        const size = typeof it.size === 'number' ? it.size : 80;
        measureCtx!.font = `${it.weight ?? 800} ${size}px "${String(it.font ?? g.palette.font ?? 'Montserrat')}"`;
        const tw = measureCtx!.measureText(String(it.text ?? '')).width, maxW = typeof it.width === 'number' ? it.width : 1600;
        const lines = Math.max(1, Math.ceil(tw / maxW));
        w = Math.min(tw, maxW);
        h = lines * size * (typeof it.lineHeight === 'number' ? it.lineHeight : 1.15);
      } else if (it.type === 'icon') w = h = (typeof it.size === 'number' ? it.size : 120) * (/badge|squircle|soft|glass|gradient/.test(String(it.style)) ? 1.5 : 1);
      else if (it.type === 'widget' || it.type === 'placeholder') (w ||= 520), (h ||= 300);
      else (w ||= 100), (h ||= w);
      const cx = R.cx + ((it.x ?? 0) + p.dx - cam.x) * k, cy = R.cy + ((it.y ?? 0) + p.dy - cam.y) * k;
      out.push({ ref: `${g.id}/${it.id}`, x: cx / W, y: cy / H, w: (w * sc * k) / W, h: (h * sc * k) / H, k });
    }
  }
  return out;
}
