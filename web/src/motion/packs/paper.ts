/**
 * "Paper explainer" style pack: documentary collage on warm paper (cut-out photos with tape, graph-paper panels,
 * slam headlines with a highlighter swipe, typewriter tags, red pen arrows and circles). Procedural — no bundled art.
 */
import type { MotionItem } from '../types';
import { type WidgetApi, arr, clamp, label, num as n, palOf, rnd, stepK as k, str } from '../widgets';

type W = (ctx: CanvasRenderingContext2D, it: MotionItem, t: number, a: WidgetApi) => void;
const RED = '#d8342c', MARKER = '#ffe14a', INK = '#1f1e1d';

/** Masking tape strip: off-white, translucent, torn ends. */
function tapeStrip(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, color = 'rgba(236,226,196,0.82)') {
  ctx.fillStyle = color;
  ctx.beginPath();
  const teeth = 6;
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  for (let i = 0; i <= teeth; i++) ctx.lineTo(w / 2 + (i % 2 ? -5 : 0) - rnd(i, seed) * 4, -h / 2 + (i / teeth) * h);
  ctx.lineTo(-w / 2, h / 2);
  for (let i = teeth; i >= 0; i--) ctx.lineTo(-w / 2 + (i % 2 ? 5 : 0) + rnd(i, seed + 1) * 4, -h / 2 + (i / teeth) * h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-w / 2 + 6, -h / 2 + 3, w - 12, h * 0.3);
}

/** Cut-out picture: white border, drop shadow, slight tilt, drops in with a small bounce, taped at the corners. */
const cutout: W = (ctx, it, t, a) => {
  const w = n(it.w, 520), h = n(it.h, 380), b = n(it.border, 16), seed = n(it.seed, 3);
  const e = k(t, 0, 0.45, 'overshoot');
  const tilt = n(it.tiltDeg, (rnd(seed, 2) - 0.5) * 8);
  ctx.rotate((tilt * Math.PI) / 180);
  ctx.scale(0.85 + 0.15 * e, 0.85 + 0.15 * e);
  ctx.globalAlpha *= clamp(e * 2);
  ctx.save();
  ctx.shadowColor = 'rgba(40,25,10,0.38)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetX = 8;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#fdfbf6';
  ctx.fillRect(-w / 2 - b, -h / 2 - b, w + b * 2, h + b * 2);
  ctx.restore();
  const img = typeof it.asset === 'string' ? a.image(it.asset) : undefined;
  if (img) a.cover(img, w, h);
  else {
    ctx.fillStyle = str(it.fill, '#d9cfbd');
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.save();
    ctx.translate(0, -16);
    a.icon(str(it.icon, 'image'), '#8a7d68', Math.min(w, h) * 0.28);
    ctx.restore();
    if (it.label) label(ctx, str(it.label), 0, Math.min(w, h) * 0.22, Math.min(34, w / 12), '#6b604e', { weight: 700, fam: 'Oswald', max: w - 40 });
  }
  if (it.caption) {
    ctx.save();
    ctx.globalAlpha *= k(t, 0.4, 0.4);
    label(ctx, str(it.caption).toUpperCase(), 0, h / 2 + b + 30, 24, INK, { weight: 500, fam: 'Consolas', spacing: 2, max: w });
    ctx.restore();
  }
  if (it.tape !== false) {
    const te = k(t, 0.25, 0.3);
    ctx.globalAlpha *= te;
    for (const [x, y, r] of [[-w / 2 + 10, -h / 2 - 6, -0.6], [w / 2 - 10, -h / 2 - 6, 0.55]] as [number, number, number][]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r);
      tapeStrip(ctx, Math.min(150, w * 0.32), 40, seed + x);
      ctx.restore();
    }
  }
};
/** A loose strip of masking tape (to stick things down). */
const tape: W = (ctx, it, t) => {
  ctx.globalAlpha *= k(t, 0, 0.25);
  ctx.rotate((n(it.angle, -8) * Math.PI) / 180);
  tapeStrip(ctx, n(it.w, 220), n(it.h, 46), n(it.seed, 5), typeof it.color === 'string' ? it.color : undefined);
};
/** Graph-paper panel (a sheet with blue grid lines) — a stage for diagrams, tallies, numbers. */
const graphPanel: W = (ctx, it, t, a) => {
  const w = n(it.w, 900), h = n(it.h, 560), e = k(t, 0, 0.45, 'overshoot'), p = palOf(it, a);
  ctx.rotate((n(it.tiltDeg, -1.5) * Math.PI) / 180);
  ctx.scale(0.9 + 0.1 * e, 0.9 + 0.1 * e);
  ctx.globalAlpha *= clamp(e * 2);
  ctx.save();
  ctx.shadowColor = 'rgba(40,25,10,0.3)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#f7f9f6';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  for (let x = -w / 2, i = 0; x < w / 2; x += 28, i++) {
    ctx.strokeStyle = i % 5 ? 'rgba(80,140,200,0.18)' : 'rgba(80,140,200,0.38)';
    ctx.lineWidth = i % 5 ? 1 : 1.6;
    ctx.beginPath();
    ctx.moveTo(x, -h / 2);
    ctx.lineTo(x, h / 2);
    ctx.stroke();
  }
  for (let y = -h / 2, i = 0; y < h / 2; y += 28, i++) {
    ctx.strokeStyle = i % 5 ? 'rgba(80,140,200,0.18)' : 'rgba(80,140,200,0.38)';
    ctx.lineWidth = i % 5 ? 1 : 1.6;
    ctx.beginPath();
    ctx.moveTo(-w / 2, y);
    ctx.lineTo(w / 2, y);
    ctx.stroke();
  }
  if (it.title) label(ctx, str(it.title).toUpperCase(), -w / 2 + 40, -h / 2 + 50, 34, INK, { align: 'left', weight: 700, fam: 'Oswald', spacing: 2 });
  // Optional tally / big number written on the sheet.
  if (it.value) label(ctx, str(it.value), 0, 20, Math.min(w, h) * 0.32, n(it.red, 1) ? RED : INK, { weight: 700, fam: 'Permanent Marker' });
  const items = arr<string>(it.items);
  items.forEach((s, i) => {
    ctx.save();
    ctx.globalAlpha *= k(t, 0.35 + i * 0.3, 0.3);
    label(ctx, `• ${s}`, -w / 2 + 50, -h / 2 + 130 + i * 64, 36, INK, { align: 'left', weight: 400, fam: 'Permanent Marker', max: w - 90 });
    ctx.restore();
  });
  void p;
};
/** Headline that slams in on its word, with a yellow highlighter swipe behind the key word. */
const slam: W = (ctx, it, t, a) => {
  const size = n(it.size, 130), txt = str(it.text).toUpperCase(), key = str(it.key).toUpperCase();
  const e = k(t, 0, 0.22, 'ease-out');
  ctx.scale(1 + (1 - e) * 0.9, 1 + (1 - e) * 0.9);
  ctx.globalAlpha *= clamp(e * 3);
  ctx.font = `700 ${size}px "Oswald"`;
  ctx.textBaseline = 'middle';
  const words = txt.split(/\s+/), sp = ctx.measureText(' ').width, ws = words.map((w) => ctx.measureText(w).width);
  const total = ws.reduce((x, y) => x + y, 0) + sp * (words.length - 1);
  // Keep it inside the frame: shrink a headline wider than maxW (default: what fits from its position to the safe edge).
  const maxW = n(it.maxW, Math.max(400, (a.frame.w * 0.9 - Math.abs(it.x ?? 0) * 2)));
  if (total > maxW) ctx.scale(maxW / total, maxW / total);
  let x = -total / 2;
  words.forEach((w, i) => {
    if (key && w.replace(/[^\p{L}\p{N}]/gu, '') === key.replace(/[^\p{L}\p{N}]/gu, '')) {
      const m = k(t, n(it.markAt, 0.35), 0.3, 'ease-out');
      ctx.save();
      ctx.fillStyle = str(it.marker, MARKER);
      ctx.globalAlpha *= 0.9;
      ctx.beginPath();
      ctx.moveTo(x - 14, -size * 0.34);
      ctx.lineTo(x - 14 + (ws[i] + 28) * m, -size * 0.4);
      ctx.lineTo(x - 14 + (ws[i] + 28) * m, size * 0.36);
      ctx.lineTo(x - 14, size * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = str(it.color, INK);
    ctx.textAlign = 'left';
    ctx.fillText(w, x, 4);
    x += ws[i] + sp;
  });
};
/** Small typewriter label typed letter by letter (dates, places, sources). */
const typewriterTag: W = (ctx, it, t) => {
  const txt = str(it.text, 'LONDON, 1952'), size = n(it.size, 30);
  const shown = txt.slice(0, Math.floor(clamp(t / Math.max(0.3, Math.min(1.2, txt.length * 0.05))) * txt.length));
  ctx.font = `500 ${size}px Consolas, "Courier New", monospace`;
  const w = ctx.measureText(txt).width + 36;
  ctx.fillStyle = str(it.bg, '#fdfbf6');
  ctx.save();
  ctx.shadowColor = 'rgba(40,25,10,0.25)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillRect(-w / 2, -size * 0.85, w, size * 1.7);
  ctx.restore();
  ctx.fillStyle = str(it.color, INK);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(shown, -w / 2 + 18, 2);
  if (shown.length < txt.length || Math.floor(t * 2) % 2) ctx.fillRect(-w / 2 + 20 + ctx.measureText(shown).width, -size * 0.4, size * 0.5, size * 0.8);
};
/** Red pen tally marks (counting up). */
const tally: W = (ctx, it, t) => {
  const count = Math.max(1, n(it.count, 7)), shown = Math.floor(clamp(t / Math.max(0.5, Math.min(2, count * 0.25))) * count);
  ctx.strokeStyle = str(it.color, RED);
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  for (let i = 0; i < shown; i++) {
    const g = Math.floor(i / 5), j = i % 5, gx = g * 170 - (Math.ceil(count / 5) * 170) / 2;
    ctx.beginPath();
    if (j < 4) (ctx.moveTo(gx + j * 30, -60 + rnd(i, 2) * 8), ctx.lineTo(gx + j * 30 + 4, 60));
    else (ctx.moveTo(gx - 20, 40), ctx.lineTo(gx + 115, -40));
    ctx.stroke();
  }
};

export const PAPER_WIDGETS: Record<string, W> = { cutout, tape, 'graph-panel': graphPanel, slam, 'typewriter-tag': typewriterTag, tally };

/** Style pack definition: what the prompt asks for and what Motion Studio offers. */
export interface StylePack {
  id: string;
  name: string;
  palette: { bg: string; card: string; text: string; muted: string; accents: string[]; font: string };
  direction: string;
  widgets: Record<string, string>;
  script?: string;
}
export const PAPER_PACK: StylePack = {
  id: 'paper-explainer',
  name: 'Paper explainer (documentary collage)',
  palette: { bg: '#efe6d4', card: '#fdfbf6', text: INK, muted: '#6b604e', accents: [RED, MARKER, '#2f6fde'], font: 'Oswald' },
  direction: `STYLE PACK "Paper explainer" (documentary collage, like the best explainer channels):
- Background: "paper" (colours ["#efe6d4"] or ["#efe6d4","creased"] for the richer sheet) on every beat, sometimes a "graph-panel" sheet as the stage. Add "light" "film-grain" and "vignette" for the whole sequence.
- Pictures are "cutout" widgets (white border, drop shadow, tape; "asset":"<my file>" when I have one, else a "label" saying what the photo shows), slightly tilted, landing one after another.
- Headlines are "slam" widgets: Oswald CAPS that slam in ON their spoken word, the key word gets a yellow highlighter swipe ("key"). Max 4 words.
- Mark things with "arrow" and "circle-draw" in red (#d8342c) that draw themselves on; dates / places / sources are "typewriter-tag" labels; counts are "tally" marks; numbers can sit big on a "graph-panel" ("value").
- Camera: a slow drift / push on every beat (zoom 1 → 1.05), a quick push-in on the reveal. Transitions: paper slides (keys on x), "wipe" in paper colours, hard cuts on the beat. No neon, no glow, no gradients.
- Every sentence gets a visual idea, not just text: a cut-out object, a diagram that draws itself, a tally, a document with a highlighted line, a before / after.`,
  widgets: {
    cutout: '{asset:"my file name" or label:"what the photo shows", w:520, h:380, caption:"SOURCE · 1952", tape:true, tiltDeg:-3}',
    'graph-panel': '{w:900, h:560, title:"THE PROBLEM", value:"3x", items:["…"]}',
    slam: '{text:"WHY SQUARE?", key:"SQUARE", size:130, markAt:0.35 (when the highlighter swipes)}',
    'typewriter-tag': '{text:"LONDON, 1952"}',
    tally: '{count:7, color:"#d8342c"}',
    tape: '{w:220, angle:-8}',
  },
  script: 'hook paradox → context with a date and place → the problem → the reveal of the real reason → what changed because of it → a short closing line',
};
export const STYLE_PACKS: StylePack[] = [PAPER_PACK];
