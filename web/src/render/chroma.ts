/** v3.6 chroma key: remove a colour (green / blue screen, black, white…) on the GPU, with a CPU fallback. */
import type { Chroma } from '../types';

type Src = CanvasImageSource & ({ width: number; height: number } | { videoWidth: number; videoHeight: number });

export const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const cbcr = (r: number, g: number, b: number): [number, number] => [-0.168736 * r - 0.331264 * g + 0.5 * b, 0.5 * r - 0.418688 * g - 0.081312 * b];
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Opacity (0 = removed, 1 = kept) of an RGB pixel (0..1) for a key colour. Distance is measured on colour (CbCr) for
 * saturated keys, and on brightness for black / white / grey keys.
 */
export function chromaAlpha(px: [number, number, number], key: [number, number, number], tolerance: number, softness: number) {
  const [kb, kr] = cbcr(...key);
  const sat = Math.hypot(kb, kr);
  const d = sat > 0.08 ? Math.hypot(cbcr(...px)[0] - kb, cbcr(...px)[1] - kr) : Math.abs(luma(...px) - luma(...key)) + Math.hypot(...cbcr(...px)) * 0.5;
  const t = tolerance * 0.5, s = Math.max(0.001, softness * 0.3);
  const x = Math.max(0, Math.min(1, (d - t) / s));
  return x * x * (3 - 2 * x);
}

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D tex; uniform vec3 key; uniform float tol, soft, spill, matte;
vec2 cbcr(vec3 c) { return vec2(-0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b, 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec4 c = texture(tex, uv);
  vec2 k = cbcr(key);
  float sat = length(k);
  float d = sat > 0.08 ? distance(cbcr(c.rgb), k) : abs(luma(c.rgb) - luma(key)) + length(cbcr(c.rgb)) * 0.5;
  float a = smoothstep(0.0, 1.0, clamp((d - tol * 0.5) / max(0.001, soft * 0.3), 0.0, 1.0));
  vec3 rgb = c.rgb;
  if (sat > 0.08) {
    // Spill: remove the key colour's tint left on edges (hair, outlines).
    vec2 cc = cbcr(rgb);
    vec2 kn = normalize(k);
    float proj = max(0.0, dot(cc, kn));
    cc -= kn * proj * spill;
    float y = luma(rgb);
    rgb = vec3(y + 1.402 * cc.y, y - 0.344136 * cc.x - 0.714136 * cc.y, y + 1.772 * cc.x);
  }
  o = matte > 0.5 ? vec4(vec3(a), 1.0) : vec4(rgb * a, a * c.a);
}`;

let gl: WebGL2RenderingContext | null | undefined;
let canvas: HTMLCanvasElement;
let prog: WebGLProgram, tex: WebGLTexture;
const U: Record<string, WebGLUniformLocation | null> = {};

function init() {
  canvas = document.createElement('canvas');
  const g = canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!g) return null;
  const sh = (t: number, src: string) => {
    const s = g.createShader(t)!;
    g.shaderSource(s, src);
    g.compileShader(s);
    if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) ?? 'chroma shader');
    return s;
  };
  prog = g.createProgram()!;
  g.attachShader(prog, sh(g.VERTEX_SHADER, VS));
  g.attachShader(prog, sh(g.FRAGMENT_SHADER, FS));
  g.linkProgram(prog);
  g.useProgram(prog);
  const buf = g.createBuffer();
  g.bindBuffer(g.ARRAY_BUFFER, buf);
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
  const loc = g.getAttribLocation(prog, 'p');
  g.enableVertexAttribArray(loc);
  g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
  tex = g.createTexture()!;
  g.bindTexture(g.TEXTURE_2D, tex);
  for (const [k, v] of [[g.TEXTURE_MIN_FILTER, g.LINEAR], [g.TEXTURE_MAG_FILTER, g.LINEAR], [g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE]]) g.texParameteri(g.TEXTURE_2D, k, v);
  for (const n of ['key', 'tol', 'soft', 'spill', 'matte']) U[n] = g.getUniformLocation(prog, n);
  return g;
}

let cpu: HTMLCanvasElement;
/** CPU fallback (slow — images only, used when WebGL2 is unavailable). */
function keyCpu(d: Src, w: number, h: number, c: Chroma) {
  cpu ??= document.createElement('canvas');
  cpu.width = w;
  cpu.height = h;
  const g = cpu.getContext('2d', { willReadFrequently: true })!;
  g.clearRect(0, 0, w, h);
  g.drawImage(d, 0, 0, w, h);
  const im = g.getImageData(0, 0, w, h);
  const key = hexRgb(c.color);
  for (let i = 0; i < im.data.length; i += 4) {
    const a = chromaAlpha([im.data[i] / 255, im.data[i + 1] / 255, im.data[i + 2] / 255], key, c.tolerance, c.softness);
    if (c.matte) im.data[i] = im.data[i + 1] = im.data[i + 2] = a * 255;
    else im.data[i + 3] *= a;
    if (c.matte) im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return cpu;
}

/** Return `d` with the key colour made transparent (a canvas the size of the source, max 1920 px). */
export function keyed(d: Src, c: Chroma): HTMLCanvasElement | Src {
  const sw = 'videoWidth' in d ? d.videoWidth : (d.width as number), sh = 'videoHeight' in d ? d.videoHeight : (d.height as number);
  if (!sw || !sh) return d;
  const k = Math.min(1, 1920 / Math.max(sw, sh));
  const w = Math.round(sw * k), h = Math.round(sh * k);
  if (gl === undefined) {
    try {
      gl = init();
    } catch {
      gl = null;
    }
  }
  if (!gl) return keyCpu(d, w, h, c);
  if (canvas.width !== w || canvas.height !== h) (canvas.width = w), (canvas.height = h);
  gl.viewport(0, 0, w, h);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, d as TexImageSource);
  gl.uniform3fv(U.key, hexRgb(c.color));
  gl.uniform1f(U.tol, c.tolerance);
  gl.uniform1f(U.soft, c.softness);
  gl.uniform1f(U.spill, c.spill);
  gl.uniform1f(U.matte, c.matte ? 1 : 0);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return canvas;
}

export const CHROMA_PRESETS: [string, string][] = [['#00b140', 'Green screen'], ['#0047bb', 'Blue screen'], ['#000000', 'Black'], ['#ffffff', 'White']];
export const defaultChroma = (color = '#00b140'): Chroma => ({ on: true, color, tolerance: 0.25, softness: 0.3, spill: 0.6 });
