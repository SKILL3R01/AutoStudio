/**
 * Living illustration renderer (WebGL2). Per clip, once: a "plate" = the picture with every moving piece removed and
 * filled from its surroundings (push-pull). Per frame: the plate, then each moving piece back-to-front as a warped
 * 24×24 mesh (rotate around its pivot, shift, bend from its anchor, water flow, flicker), children following parents.
 */
import type { Clip } from '../types';
import type { Drawable, FrameSource } from './renderer';
import { poseAt, type LivingPart, type PartPose } from '../living/model';

const MAXW = 1280, N = 24;
const dims = (d: Drawable) => (d instanceof HTMLVideoElement ? { w: d.videoWidth, h: d.videoHeight } : { w: d.width, h: d.height });

const VS = `#version 300 es
in vec2 pos; in vec2 uv; out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(pos.x * 2.0 - 1.0, 1.0 - pos.y * 2.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D img; uniform sampler2D msk; uniform int useMask; uniform float bright; uniform float flow; uniform float flowAmp;
void main() {
  vec2 uv = vUv;
  if (flowAmp > 0.0) uv += flowAmp * vec2(sin(uv.y * 40.0 + flow * 6.2831853), cos(uv.x * 34.0 + flow * 6.2831853) * 0.6);
  vec4 c = texture(img, clamp(uv, 0.001, 0.999));
  float a = useMask == 1 ? texture(msk, vUv).a : 1.0;
  c.rgb *= 1.0 + bright;
  o = vec4(c.rgb * a, a);
}`;

interface Gl { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; prog: WebGLProgram; buf: WebGLBuffer; idx: WebGLBuffer; img: WebGLTexture; plate: WebGLTexture; masks: Map<string, WebGLTexture>; lastImg?: Drawable; plateKey?: string; u: Record<string, WebGLUniformLocation | null> }
let G: Gl | null | undefined;

function init(): Gl | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true });
  if (!gl) return null;
  const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader'); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer()!, idx = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const lp = gl.getAttribLocation(prog, 'pos'), lu = gl.getAttribLocation(prog, 'uv');
  gl.enableVertexAttribArray(lp);
  gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(lu);
  gl.vertexAttribPointer(lu, 2, gl.FLOAT, false, 16, 8);
  const ind: number[] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i; ind.push(a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1); }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ind), gl.STATIC_DRAW);
  const tex = () => { const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; };
  const u: Gl['u'] = {};
  for (const n of ['img', 'msk', 'useMask', 'bright', 'flow', 'flowAmp']) u[n] = gl.getUniformLocation(prog, n);
  gl.uniform1i(u.img, 0);
  gl.uniform1i(u.msk, 1);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  return { canvas, gl, prog, buf, idx, img: tex(), plate: tex(), masks: new Map(), u };
}

/* ---------- plate: moving pieces removed and filled from around them (push-pull, CPU, once per clip) ---------- */
function makePlate(img: Drawable, masks: Drawable[], W: number, H: number): HTMLCanvasElement {
  const S = Math.min(1, 480 / Math.max(W, H)), w = Math.max(8, Math.round(W * S)), h = Math.max(8, Math.round(H * S));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h);
  const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
  const mg = mc.getContext('2d', { willReadFrequently: true })!;
  mg.filter = 'blur(2px)';
  for (const m of masks) mg.drawImage(m, 0, 0, w, h);
  const hole = mg.getImageData(0, 0, w, h).data;
  // pyramid of known colours
  let lw = w, lh = h, col = new Float32Array(w * h * 3), wt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) if (hole[i * 4 + 3] < 20) (col[i * 3] = px.data[i * 4]), (col[i * 3 + 1] = px.data[i * 4 + 1]), (col[i * 3 + 2] = px.data[i * 4 + 2]), (wt[i] = 1);
  const levels: { w: number; h: number; col: Float32Array; wt: Float32Array }[] = [{ w, h, col, wt }];
  while (lw > 2 && lh > 2) {
    const nw = Math.ceil(lw / 2), nh = Math.ceil(lh / 2), nc = new Float32Array(nw * nh * 3), nwt = new Float32Array(nw * nh);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) { const i = y * lw + x, j = (y >> 1) * nw + (x >> 1), k = wt[i]; nwt[j] += k; nc[j * 3] += col[i * 3] * k; nc[j * 3 + 1] += col[i * 3 + 1] * k; nc[j * 3 + 2] += col[i * 3 + 2] * k; }
    for (let j = 0; j < nw * nh; j++) if (nwt[j] > 0) (nc[j * 3] /= nwt[j]), (nc[j * 3 + 1] /= nwt[j]), (nc[j * 3 + 2] /= nwt[j]), (nwt[j] = Math.min(1, nwt[j]));
    levels.push({ w: nw, h: nh, col: nc, wt: nwt });
    (lw = nw), (lh = nh), (col = nc), (wt = nwt);
  }
  for (let l = levels.length - 2; l >= 0; l--) {
    const L = levels[l], U = levels[l + 1];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) { const i = y * L.w + x; if (L.wt[i] >= 1) continue; const j = Math.min(U.h - 1, y >> 1) * U.w + Math.min(U.w - 1, x >> 1), a = L.wt[i];
      for (let ch = 0; ch < 3; ch++) L.col[i * 3 + ch] = L.col[i * 3 + ch] * a + U.col[j * 3 + ch] * (1 - a); L.wt[i] = 1; }
  }
  const F = levels[0];
  for (let i = 0; i < w * h; i++) { const a = Math.min(1, hole[i * 4 + 3] / 160); for (let ch = 0; ch < 3; ch++) px.data[i * 4 + ch] = px.data[i * 4 + ch] * (1 - a) + F.col[i * 3 + ch] * a; }
  g.putImageData(px, 0, 0);
  // full size: the original where nothing moves, the filled plate where pieces were
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const og = out.getContext('2d')!;
  og.drawImage(c, 0, 0, W, H);
  const keep = document.createElement('canvas'); keep.width = W; keep.height = H;
  const kg = keep.getContext('2d')!;
  kg.drawImage(img, 0, 0, W, H);
  kg.globalCompositeOperation = 'destination-out';
  kg.filter = `blur(${Math.max(1, Math.round(3 / S))}px)`;
  for (const m of masks) kg.drawImage(m, 0, 0, W, H);
  og.drawImage(keep, 0, 0);
  return out;
}

/* ---------- mesh warp ---------- */
/** Position of image point (u,v) after a piece's pose (pixel-correct rotation, bend from its anchor). */
export function warp(p: LivingPart, pose: PartPose, u: number, v: number, W: number, H: number): [number, number] {
  const [bx, by, bw, bh] = p.bbox, [px, py] = p.pivot;
  let x = u * W, y = v * H;
  if (pose.bend) {
    const nx = (u - bx) / Math.max(1e-3, bw), ny = (v - by) / Math.max(1e-3, bh);
    if (p.motion === 'billow') { // anchored at the top edge: the cloth swells sideways, more towards the free edge
      const free = Math.max(0, Math.min(1, ny)), swell = Math.sin(Math.PI * Math.max(0, Math.min(1, nx)));
      x += pose.bend * W * free * (0.5 + 0.5 * swell) * Math.cos(pose.phase * 0.5 + ny * 2);
      y += pose.bend * H * 0.3 * free * swell;
    } else if (p.motion === 'sway') { const free = Math.max(0, Math.min(1, 1 - ny)); x += pose.bend * W * free * free; }
    else if (p.motion === 'glide') { // tail sway along the body axis
      const ax = Math.cos(p.axis), ay = Math.sin(p.axis), along = ((u - (bx + bw / 2)) * W * ax + (v - (by + bh / 2)) * H * ay) / Math.max(1, Math.hypot(bw * W, bh * H) / 2);
      const off = pose.bend * Math.max(W, H) * along * along * Math.sin(pose.phase - along * 2.5);
      x += -ay * off; y += ax * off;
    }
  }
  if (pose.rot) { const cx = px * W, cy = py * H, c = Math.cos(pose.rot), s = Math.sin(pose.rot), dx = x - cx, dy = y - cy; x = cx + dx * c - dy * s; y = cy + dx * s + dy * c; }
  return [x / W + pose.dx, y / H + pose.dy];
}

function maskTex(g: Gl, id: string, m: Drawable) {
  let t = g.masks.get(id);
  if (!t) {
    const gl = g.gl;
    t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    // soften the mask edge (masks are lower resolution than the picture)
    const { w, h } = dims(m), sc = document.createElement('canvas');
    sc.width = w * 2; sc.height = h * 2;
    const sg = sc.getContext('2d')!;
    sg.filter = 'blur(1.6px)';
    sg.drawImage(m, 0, 0, w * 2, h * 2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sc);
    g.masks.set(id, t);
    if (g.masks.size > 200) g.masks.clear();
  }
  return t;
}

/** The clip's picture with its living pieces animated at local time t (0..span). Null when WebGL2 or masks are missing. */
export function renderLiving(d: Drawable, clip: Clip, t: number, span: number, src: FrameSource): HTMLCanvasElement | null {
  const L = clip.living;
  if (!L) return null;
  if (G === undefined) { try { G = init(); } catch { G = null; } }
  if (!G) return null;
  const parts = L.parts.filter((p) => p.on && p.motion !== 'still' || (p.on && p.parentId && L.parts.find((q) => q.id === p.parentId && q.on && q.motion !== 'still')));
  const masks = parts.map((p) => src.image(p.maskId));
  if (!parts.length || masks.some((m) => !m)) return null;
  const { gl, canvas, u } = G;
  const { w, h } = dims(d), s = Math.min(1, MAXW / Math.max(w, h)), W = Math.round(w * s), H = Math.round(h * s);
  if (canvas.width !== W || canvas.height !== H) (canvas.width = W), (canvas.height = H);
  gl.viewport(0, 0, W, H);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, G.img);
  if (G.lastImg !== d) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, d as TexImageSource);
  const pk = `${clip.id}|${clip.assetId}|${parts.map((p) => p.maskId).join(',')}|${W}x${H}`;
  if (G.plateKey !== pk || G.lastImg !== d) {
    gl.bindTexture(gl.TEXTURE_2D, G.plate);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makePlate(d, masks as Drawable[], W, H));
    G.plateKey = pk;
  }
  G.lastImg = d;
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const verts = new Float32Array((N + 1) * (N + 1) * 4);
  const drawMesh = (fn: (u: number, v: number) => [number, number], box: [number, number, number, number]) => {
    const [bx, by, bw, bh] = box;
    for (let j = 0, k = 0; j <= N; j++) for (let i = 0; i <= N; i++, k += 4) { const uu = bx + (bw * i) / N, vv = by + (bh * j) / N, [x, y] = fn(uu, vv); verts[k] = x; verts[k + 1] = y; verts[k + 2] = uu; verts[k + 3] = vv; }
    gl.bindBuffer(gl.ARRAY_BUFFER, G!.buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, N * N * 6, gl.UNSIGNED_SHORT, 0);
  };
  // 1. the plate
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, G.plate);
  gl.uniform1i(u.useMask, 0); gl.uniform1f(u.bright, 0); gl.uniform1f(u.flowAmp, 0); gl.uniform1f(u.flow, 0);
  drawMesh((x, y) => [x, y], [0, 0, 1, 1]);
  // 2. the pieces, far to near; a child applies its own pose, then its parent's
  gl.bindTexture(gl.TEXTURE_2D, G.img);
  // one image-wide clock: per-piece speed is ignored for the rhythm (only the image's speed), so pieces stay in step
  const poses = new Map(L.parts.map((p) => [p.id, poseAt({ ...p, strength: p.strength * L.strength, speed: L.speed }, t, span)]));
  const order = parts.map((p, i) => ({ p, m: masks[i]! })).sort((a, b) => a.p.depth - b.p.depth);
  for (const { p, m } of order) {
    const pose = poses.get(p.id)!, parent = p.parentId ? L.parts.find((q) => q.id === p.parentId && q.on) : undefined, pp = parent ? poses.get(parent.id) : undefined;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTex(G, p.maskId, m));
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u.useMask, 1);
    gl.uniform1f(u.bright, pose.bright);
    gl.uniform1f(u.flow, pose.flow);
    gl.uniform1f(u.flowAmp, p.motion === 'flow' ? pose.bend : 0);
    // a slightly larger box so bends and rotations are not cut
    const [bx, by, bw, bh] = p.bbox, pad = 0.02, box: [number, number, number, number] = [Math.max(0, bx - pad), Math.max(0, by - pad), Math.min(1, bw + 2 * pad), Math.min(1, bh + 2 * pad)];
    drawMesh((x, y) => {
      let q = p.motion === 'still' ? [x, y] as [number, number] : warp(p, pose, x, y, W, H);
      if (parent && pp) q = warp(parent, { ...pp, bend: 0 }, q[0], q[1], W, H);
      return q;
    }, box);
  }
  return canvas;
}
