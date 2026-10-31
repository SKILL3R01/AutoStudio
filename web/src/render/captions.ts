import type { CaptionLine, CaptionSettings } from '../types';
import { clamp, easeOutBack, isRtl } from '../lib/util';

export type CaptionAnim = 'none' | 'pop' | 'rise' | 'punch' | 'karaoke' | 'typewriter' | 'bounce' | 'slide';

export interface CaptionStyle {
  id: string;
  name: string;
  font?: string;
  weight: number;
  base: string;
  active: string;
  stroke?: string;
  strokeW?: number;
  glow?: string;
  /** Background pill behind the active word. */
  pill?: string;
  /** Text colour of the active word when a pill is drawn. */
  pillText?: string;
  /** Background box behind the whole line. */
  box?: string;
  anim: CaptionAnim;
  upper?: boolean;
  shadow?: boolean;
  italic?: boolean;
}

export const CAPTION_STYLES: CaptionStyle[] = [
  { id: 'spotlight', name: 'Spotlight', weight: 800, base: '#ffffff', active: '#ffe14d', stroke: '#000', strokeW: 0.12, anim: 'pop' },
  { id: 'ember', name: 'Ember', weight: 800, base: '#ffffff', active: '#ff7a1a', stroke: '#000', strokeW: 0.1, glow: '#ff5500', anim: 'pop' },
  { id: 'neon', name: 'Neon', weight: 800, base: '#ffffff', active: '#22e3ff', glow: '#00c8ff', shadow: true, anim: 'none' },
  { id: 'pill', name: 'Pill', weight: 800, base: '#ffffff', active: '#111', pill: '#ffd400', pillText: '#111', stroke: '#000', strokeW: 0.08, anim: 'pop' },
  { id: 'rise', name: 'Rise', weight: 800, base: '#ffffff', active: '#7dffb2', shadow: true, anim: 'rise' },
  { id: 'punch', name: 'Punch', weight: 900, base: '#ffffff', active: '#ff2d55', stroke: '#000', strokeW: 0.14, anim: 'punch', upper: true },
  { id: 'gold', name: 'Gold', weight: 800, base: '#fff7e0', active: '#ffc53d', glow: '#b07b00', shadow: true, anim: 'none' },
  { id: 'grape', name: 'Grape', weight: 800, base: '#ffffff', active: '#b388ff', pill: '#6a3cff', pillText: '#fff', anim: 'pop' },
  { id: 'beast', name: 'Beast', font: 'Bangers', weight: 400, base: '#ffffff', active: '#ffe600', stroke: '#000', strokeW: 0.18, anim: 'bounce', upper: true },
  { id: 'hormozi', name: 'Bold Green', font: 'Montserrat', weight: 900, base: '#ffffff', active: '#39ff14', stroke: '#000', strokeW: 0.14, anim: 'punch', upper: true },
  { id: 'karaoke', name: 'Karaoke', weight: 800, base: 'rgba(255,255,255,0.55)', active: '#ffffff', stroke: '#000', strokeW: 0.08, anim: 'karaoke' },
  { id: 'typewriter', name: 'Typewriter', font: 'Inter', weight: 600, base: '#ffffff', active: '#ffffff', box: 'rgba(0,0,0,0.6)', anim: 'typewriter' },
  { id: 'boxed', name: 'Boxed', font: 'Inter', weight: 600, base: '#ffffff', active: '#ffd166', box: 'rgba(0,0,0,0.65)', anim: 'none' },
  { id: 'classic', name: 'Classic', font: 'Inter', weight: 600, base: '#ffffff', active: '#ffffff', stroke: '#000', strokeW: 0.1, anim: 'none' },
  { id: 'cinema', name: 'Cinema', font: 'Playfair Display', weight: 700, base: '#f4f1ea', active: '#ffffff', shadow: true, anim: 'none', italic: true },
  { id: 'bubble', name: 'Bubble', font: 'Poppins', weight: 800, base: '#111', active: '#fff', pill: '#ff3d7f', pillText: '#fff', box: '#ffffff', anim: 'pop' },
  { id: 'impact', name: 'Impact', font: 'Anton', weight: 400, base: '#ffffff', active: '#ff4d4d', stroke: '#000', strokeW: 0.12, anim: 'slide', upper: true },
  { id: 'marker', name: 'Marker', font: 'Permanent Marker', weight: 400, base: '#ffffff', active: '#ffb3c7', stroke: '#000', strokeW: 0.1, anim: 'rise' },
  { id: 'ocean', name: 'Ocean', weight: 800, base: '#e8f7ff', active: '#4dd0ff', glow: '#0077ff', stroke: '#002244', strokeW: 0.08, anim: 'pop' },
  { id: 'minimal', name: 'Minimal', font: 'Inter', weight: 400, base: 'rgba(255,255,255,0.92)', active: '#ffffff', shadow: true, anim: 'none' },
];

export const CAPTION_FONTS = [
  'Montserrat', 'Poppins', 'Inter', 'Bebas Neue', 'Anton', 'Bangers', 'Permanent Marker', 'Playfair Display',
  'Cairo', 'Noto Naskh Arabic', 'Amiri', 'Noto Nastaliq Urdu',
];

const styleById = (id: string) => CAPTION_STYLES.find((s) => s.id === id) ?? CAPTION_STYLES[0];

/** Find the line visible at time t (binary search on sorted lines). */
export function lineAt(lines: CaptionLine[], t: number) {
  let lo = 0, hi = lines.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].end <= t) lo = mid + 1;
    else if (lines[mid].start > t) hi = mid - 1;
    else return lines[mid];
  }
  return undefined;
}

export function drawCaptions(ctx: CanvasRenderingContext2D, lines: CaptionLine[], t: number, s: CaptionSettings, W: number, H: number) {
  if (!s.enabled) return;
  const line = lineAt(lines, t);
  if (!line) return;
  drawCaptionLine(ctx, line, t, s, W, H);
}

export function drawCaptionLine(ctx: CanvasRenderingContext2D, line: CaptionLine, t: number, s: CaptionSettings, W: number, H: number, styleOverride?: CaptionStyle) {
  const st = styleOverride ?? styleById(s.style);
  const base = Math.min(W, H * 16 / 9);
  const fs = Math.round(base * 0.032 * s.size);
  const font = s.font || st.font || 'Montserrat';
  ctx.save();
  ctx.font = `${st.italic ? 'italic ' : ''}${st.weight} ${fs}px "${font}", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  const upper = s.uppercase || st.upper;
  const rtl = isRtl(line.words.map((w) => w.text).join(' '));
  const words = line.words.map((w) => ({ ...w, label: upper ? w.text.toLocaleUpperCase() : w.text }));
  const space = ctx.measureText(' ').width;
  const widths = words.map((w) => ctx.measureText(w.label).width);
  // Wrap into rows.
  const maxW = W * 0.86;
  const rows: number[][] = [[]];
  let rowW = 0;
  words.forEach((_, i) => {
    const w = widths[i] + (rows[rows.length - 1].length ? space : 0);
    if (rowW + w > maxW && rows[rows.length - 1].length) {
      rows.push([]);
      rowW = 0;
    }
    rows[rows.length - 1].push(i);
    rowW += widths[i] + (rows[rows.length - 1].length > 1 ? space : 0);
  });
  const lh = fs * 1.25;
  const cy = (clamp(s.position, 0, 100) / 100) * H;
  const top = clamp(cy - ((rows.length - 1) * lh) / 2, lh, H - lh * rows.length);
  // Line entrance.
  const enter = clamp((t - line.start) / 0.18, 0, 1);
  ctx.globalAlpha = enter;
  const activeIdx = s.wordLevel ? words.findIndex((w, i) => t >= w.start && (i + 1 >= words.length || t < words[i + 1].start)) : -1;

  rows.forEach((row, r) => {
    const order = rtl ? [...row].reverse() : row;
    const totalW = order.reduce((a, i, k) => a + widths[i] + (k ? space : 0), 0);
    let x = (W - totalW) / 2;
    const y = top + r * lh;
    if (st.box) {
      ctx.fillStyle = st.box;
      roundRect(ctx, x - fs * 0.4, y - lh / 2, totalW + fs * 0.8, lh, fs * 0.25);
      ctx.fill();
    }
    order.forEach((i) => {
      const w = words[i];
      const isActive = i === activeIdx;
      const spoken = t >= w.start;
      if (st.anim === 'typewriter' && !spoken && s.wordLevel) {
        x += widths[i] + space;
        return;
      }
      const age = t - w.start;
      let scale = 1, dy = 0, alpha = 1;
      if (s.wordLevel) {
        if (st.anim === 'pop' && isActive) scale = 1 + 0.12 * easeOutBack(clamp(age / 0.15, 0, 1));
        if (st.anim === 'punch' && isActive) scale = 1.25 - 0.15 * clamp(age / 0.2, 0, 1);
        if (st.anim === 'bounce' && isActive) dy = -Math.abs(Math.sin(clamp(age / 0.25, 0, 1) * Math.PI)) * fs * 0.25;
        if (st.anim === 'rise') {
          const k = clamp(age / 0.2, 0, 1);
          alpha = spoken ? k : 0.0;
          dy = (1 - k) * fs * 0.5;
        }
        if (st.anim === 'slide' && spoken) dy = (1 - clamp(age / 0.12, 0, 1)) * fs * 0.4;
      }
      const cx = x + widths[i] / 2;
      ctx.save();
      ctx.globalAlpha = enter * alpha;
      ctx.translate(cx, y + dy);
      ctx.scale(scale, scale);
      const color = !s.wordLevel ? st.base : st.anim === 'karaoke' ? (spoken ? st.active : st.base) : isActive ? st.active : st.base;
      if (isActive && st.pill) {
        ctx.fillStyle = st.pill;
        roundRect(ctx, -widths[i] / 2 - fs * 0.22, -fs * 0.62, widths[i] + fs * 0.44, fs * 1.24, fs * 0.28);
        ctx.fill();
      }
      if (st.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = fs * 0.25;
        ctx.shadowOffsetY = fs * 0.06;
      }
      if (st.stroke) {
        ctx.strokeStyle = st.stroke;
        ctx.lineWidth = fs * (st.strokeW ?? 0.1);
        ctx.strokeText(w.label, -widths[i] / 2, 0);
      }
      if (st.glow && (isActive || !s.wordLevel || st.id === 'neon' || st.id === 'gold')) {
        ctx.shadowColor = st.glow;
        ctx.shadowBlur = fs * (isActive ? 0.6 : 0.3);
        ctx.shadowOffsetY = 0;
      }
      ctx.fillStyle = isActive && st.pill ? st.pillText ?? color : color;
      ctx.fillText(w.label, -widths[i] / 2, 0);
      ctx.restore();
      x += widths[i] + space;
    });
  });
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
