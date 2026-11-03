/**
 * Colour grading: exposure, white balance, highlights/shadows, vibrance, split toning, fade and 3D LUTs (.cube)
 * in one WebGL2 pass. Grades that only use brightness / contrast / saturation keep the cheap ctx.filter path.
 */
import type { ColorAdjust, Lut } from '../types';
import type { Drawable } from './renderer';

export const NEUTRAL: ColorAdjust = { brightness: 1, contrast: 1, saturation: 1 };

const ADDITIVE = ['exposure', 'temperature', 'tint', 'highlights', 'shadows', 'vibrance', 'split'] as const;

/** Project grade + clip grade → the grade to draw (multiplied / added; the clip's LUT wins). */
export function combineGrades(project: ColorAdjust, clip?: ColorAdjust): ColorAdjust {
  if (!clip) return project;
  const out: ColorAdjust = {
    brightness: project.brightness * clip.brightness, contrast: project.contrast * clip.contrast, saturation: project.saturation * clip.saturation,
    fade: Math.min(1, (project.fade ?? 0) + (clip.fade ?? 0)), vignette: Math.max(project.vignette ?? 0, clip.vignette ?? 0),
    lut: clip.lut ?? project.lut, lutAmount: clip.lut ? clip.lutAmount ?? 1 : project.lutAmount ?? 1,
  };
  for (const k of ADDITIVE) out[k] = (project[k] ?? 0) + (clip[k] ?? 0);
  return out;
}

/** True when the grade needs the GPU pass (anything beyond brightness / contrast / saturation). */
export const needsGpu = (g: ColorAdjust) => !!(g.lut && (g.lutAmount ?? 1) > 0) || ADDITIVE.some((k) => Math.abs(g[k] ?? 0) > 1e-3) || (g.fade ?? 0) > 1e-3;

export const cssFilter = (g: ColorAdjust) => `brightness(${g.brightness}) contrast(${g.contrast}) saturate(${g.saturation})`;

// ---------- .cube LUTs ----------

/** Parse an Adobe / Resolve `.cube` 3D LUT into 8-bit RGB (red changes fastest). */
export function parseCube(text: string, name = 'LUT'): Omit<Lut, 'id'> {
  let size = 0, min = [0, 0, 0], max = [1, 1, 1], title = '';
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [k, ...rest] = line.split(/\s+/);
    if (k === 'TITLE') title = line.slice(5).trim().replace(/^"|"$/g, '');
    else if (k === 'LUT_3D_SIZE') size = +rest[0];
    else if (k === 'LUT_1D_SIZE') throw new Error('1D LUTs are not supported — export a 3D .cube LUT.');
    else if (k === 'DOMAIN_MIN') min = rest.map(Number);
    else if (k === 'DOMAIN_MAX') max = rest.map(Number);
    else if (/^[-+\d.]/.test(k)) values.push(+k, +rest[0], +rest[1]);
  }
  if (size < 2 || size > 128) throw new Error('Not a valid 3D .cube LUT (missing LUT_3D_SIZE).');
  if (values.length < size ** 3 * 3) throw new Error(`The LUT is incomplete (${values.length / 3} of ${size ** 3} entries).`);
  const bytes = new Uint8Array(size ** 3 * 3);
  for (let i = 0; i < bytes.length; i++) {
    const c = i % 3;
    bytes[i] = Math.round(Math.max(0, Math.min(1, (values[i] - min[c]) / ((max[c] - min[c]) || 1))) * 255);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { name: title || name, size, data: btoa(bin) };
}

export function lutBytes(l: Lut): Uint8Array {
  const bin = atob(l.data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** CPU version of the LUT lookup (trilinear) — used by tests and as a reference. */
export function sampleLut(l: Lut, r: number, g: number, b: number, bytes = lutBytes(l)): [number, number, number] {
  const n = l.size, f = (v: number) => Math.max(0, Math.min(n - 1, v * (n - 1)));
  const [x, y, z] = [f(r), f(g), f(b)];
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1), z1 = Math.min(n - 1, z0 + 1);
  const at = (i: number, j: number, k: number, c: number) => bytes[(i + j * n + k * n * n) * 3 + c] / 255;
  const lerp = (a: number, b2: number, t: number) => a + (b2 - a) * t;
  return [0, 1, 2].map((c) => lerp(
    lerp(lerp(at(x0, y0, z0, c), at(x1, y0, z0, c), x - x0), lerp(at(x0, y1, z0, c), at(x1, y1, z0, c), x - x0), y - y0),
    lerp(lerp(at(x0, y0, z1, c), at(x1, y0, z1, c), x - x0), lerp(at(x0, y1, z1, c), at(x1, y1, z1, c), x - x0), y - y0),
    z - z0,
  )) as [number, number, number];
}

// ---------- looks ----------

export const LOOKS: { id: string; name: string; grade: ColorAdjust }[] = [
  { id: 'natural', name: 'Natural', grade: NEUTRAL },
  { id: 'teal-orange', name: 'Teal & orange', grade: { brightness: 1, contrast: 1.1, saturation: 1.05, split: 0.7, temperature: 0.05 } },
  { id: 'warm-film', name: 'Warm film', grade: { brightness: 1, contrast: 0.95, saturation: 0.9, temperature: 0.35, fade: 0.35, split: 0.2 } },
  { id: 'golden', name: 'Golden hour', grade: { brightness: 1, contrast: 1, saturation: 1.1, temperature: 0.5, exposure: 0.1, highlights: -0.2, split: 0.3 } },
  { id: 'cool-night', name: 'Cool night', grade: { brightness: 1, contrast: 1.1, saturation: 0.85, temperature: -0.45, tint: 0.05, exposure: -0.25 } },
  { id: 'moody', name: 'Moody', grade: { brightness: 1, contrast: 1.2, saturation: 0.75, exposure: -0.2, shadows: -0.2, highlights: -0.3, vignette: 0.4 } },
  { id: 'vivid', name: 'Vivid', grade: { brightness: 1, contrast: 1.08, saturation: 1.15, vibrance: 0.5 } },
  { id: 'bleach', name: 'Bleach bypass', grade: { brightness: 1, contrast: 1.35, saturation: 0.5, highlights: -0.2 } },
  { id: 'vintage', name: 'Vintage', grade: { brightness: 1, contrast: 0.9, saturation: 0.7, temperature: 0.25, tint: 0.1, fade: 0.5, vignette: 0.35 } },
  { id: 'matte', name: 'Matte', grade: { brightness: 1, contrast: 0.9, saturation: 0.95, fade: 0.6, highlights: -0.25 } },
  { id: 'noir', name: 'Noir B&W', grade: { brightness: 1, contrast: 1.3, saturation: 0, vignette: 0.45 } },
];

// ---------- GPU pass ----------

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float; precision highp sampler3D;
in vec2 uv; out vec4 o;
uniform sampler2D img; uniform sampler3D lut;
uniform float bright, expo, contr, satur, temp, tnt, hil, sha, vib, fade, split, lutAmt, lutN;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec4 src = texture(img, uv);
  vec3 c = src.rgb * bright * exp2(expo);
  c *= vec3(1.0 + temp * 0.12 + tnt * 0.05, 1.0 - tnt * 0.08, 1.0 - temp * 0.12 + tnt * 0.05);
  float l = luma(c);
  c += c * sha * 0.7 * (1.0 - smoothstep(0.0, 0.5, l));
  c += c * hil * 0.45 * smoothstep(0.45, 1.0, l);
  c = (c - 0.5) * contr + 0.5;
  l = luma(c);
  float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(l), c, satur * (1.0 + vib * (1.0 - clamp(chroma * 2.0, 0.0, 1.0))));
  c += split * (vec3(-0.06, 0.015, 0.06) * (1.0 - smoothstep(0.0, 0.6, l)) + vec3(0.07, 0.02, -0.07) * smoothstep(0.4, 1.0, l));
  c = c * (1.0 - fade * 0.22) + fade * 0.1;
  c = clamp(c, 0.0, 1.0);
  if (lutAmt > 0.0) c = mix(c, texture(lut, c * ((lutN - 1.0) / lutN) + 0.5 / lutN).rgb, lutAmt);
  o = vec4(c, src.a);
}`;

interface Gl {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  u: Record<string, WebGLUniformLocation | null>;
  img: WebGLTexture;
  luts: Map<string, { tex: WebGLTexture; n: number }>;
}
let state: Gl | null | undefined;

function init(): Gl | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const img = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, img);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const u: Gl['u'] = {};
  for (const n of ['img', 'lut', 'bright', 'expo', 'contr', 'satur', 'temp', 'tnt', 'hil', 'sha', 'vib', 'fade', 'split', 'lutAmt', 'lutN']) u[n] = gl.getUniformLocation(prog, n);
  gl.uniform1i(u.img, 0);
  gl.uniform1i(u.lut, 1);
  // A 2×2×2 identity LUT keeps the sampler valid when no LUT is used.
  const id = new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 255, 255, 0, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255]);
  const luts = new Map<string, { tex: WebGLTexture; n: number }>();
  luts.set('', { tex: upload3d(gl, id, 2), n: 2 });
  return { canvas, gl, u, img, luts };
}

function upload3d(gl: WebGL2RenderingContext, bytes: Uint8Array, n: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_3D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, n, n, n, 0, gl.RGB, gl.UNSIGNED_BYTE, bytes);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
  gl.activeTexture(gl.TEXTURE0);
  return t;
}

const MAX_DIM = 2560;

/** Run the grade on the GPU. Returns a canvas (reused — draw it before grading the next source) or undefined. */
export function gradeDrawable(src: Drawable, w: number, h: number, g: ColorAdjust, luts: Lut[]): HTMLCanvasElement | undefined {
  if (state === undefined) {
    try {
      state = init();
    } catch {
      state = null;
    }
  }
  if (!state) return undefined;
  const { gl, canvas, u, luts: cache } = state;
  const s = Math.min(1, MAX_DIM / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
  if (canvas.width !== cw || canvas.height !== ch) (canvas.width = cw), (canvas.height = ch);
  gl.viewport(0, 0, cw, ch);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.img);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
  const lut = g.lut ? luts.find((l) => l.id === g.lut) : undefined;
  let entry = cache.get(lut?.id ?? '')!;
  if (lut && !cache.has(lut.id)) cache.set(lut.id, (entry = { tex: upload3d(gl, lutBytes(lut), lut.size), n: lut.size }));
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_3D, (entry ?? cache.get(''))!.tex);
  gl.activeTexture(gl.TEXTURE0);
  const set = (n: string, v: number) => gl.uniform1f(u[n], v);
  set('bright', g.brightness); set('expo', g.exposure ?? 0); set('contr', g.contrast); set('satur', g.saturation);
  set('temp', g.temperature ?? 0); set('tnt', g.tint ?? 0); set('hil', g.highlights ?? 0); set('sha', g.shadows ?? 0);
  set('vib', g.vibrance ?? 0); set('fade', g.fade ?? 0); set('split', g.split ?? 0);
  set('lutAmt', lut ? g.lutAmount ?? 1 : 0); set('lutN', entry?.n ?? 2);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return canvas;
}

/** Darkened edges, drawn over the clip in frame space. */
export function drawVignette(g: CanvasRenderingContext2D, W: number, H: number, amount: number) {
  if (amount <= 0) return;
  const r = Math.hypot(W, H) / 2;
  const grad = g.createRadialGradient(W / 2, H / 2, r * (0.55 - amount * 0.25), W / 2, H / 2, r);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, amount * 0.85)})`);
  g.save();
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.restore();
}
