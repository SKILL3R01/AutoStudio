/**
 * GPU shader effects: the current frame goes through a GLSL `effect(uv, frame)` function (WebGL2) and is drawn back.
 * Built-ins (fire, fog, god rays, film burn, glow) and user / AI-written custom shaders share this engine.
 * GLSL has no access to files, network or app data, so custom code stays sandboxed on the GPU.
 */
const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;

/** Shared header: uniforms + noise helpers available to every effect. uv: (0,0) = top-left, (1,1) = bottom-right. */
export const SHADER_HEADER = `#version 300 es
precision highp float;
in vec2 uv; out vec4 fragColor;
uniform sampler2D u_frame;
uniform vec2 u_res;
uniform float u_time, u_amount, u_p1, u_p2, u_p3, u_p4;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }
vec4 frameAt(vec2 q) { return texture(u_frame, clamp(q, 0.0, 1.0)); }
`;
const FOOTER = `
void main() { fragColor = effect(uv, texture(u_frame, uv)); }`;

/** Header line count, so compile errors can be reported on the user's own line numbers. */
const HEADER_LINES = SHADER_HEADER.split('\n').length - 1;

export const BUILTIN_SHADERS: Record<string, string> = {
  fire: `vec4 effect(vec2 uv, vec4 frame) {
  float y = 1.0 - uv.y;                       // 0 at the bottom
  vec2 q = vec2(uv.x * 4.0 * (u_res.x / u_res.y) / 1.8, y * 3.0 - u_time * 1.8);
  float n = fbm(q + fbm(q * 1.7 + u_time * 0.5));
  float h = (0.2 + 0.3 * u_amount) * (0.65 + 0.7 * noise(vec2(uv.x * 7.0, u_time * 0.9)));
  float f = smoothstep(0.0, 0.5, h - y + (n - 0.5) * 0.25) ;
  f *= smoothstep(0.15, 0.6, n + 0.25);
  vec3 col = mix(vec3(0.9, 0.12, 0.0), mix(vec3(1.0, 0.55, 0.08), vec3(1.0, 0.92, 0.6), f), f);
  return vec4(mix(frame.rgb, frame.rgb * 0.6 + col, clamp(f * (0.55 + 0.45 * u_amount), 0.0, 0.92)), 1.0);
}`,
  fog: `vec4 effect(vec2 uv, vec4 frame) {
  vec2 q = uv * vec2(u_res.x / u_res.y, 1.0) * 2.0 + vec2(u_time * 0.05, 0.0);
  float n = fbm(q + fbm(q + u_time * 0.03));
  float d = smoothstep(0.2, 1.0, n) * (0.35 + 0.65 * uv.y) * u_amount;
  return vec4(mix(frame.rgb, vec3(0.82, 0.86, 0.9), d * 0.85), 1.0);
}`,
  godRays: `vec4 effect(vec2 uv, vec4 frame) {
  vec2 src = vec2(0.75 + 0.05 * sin(u_time * 0.2), -0.1);
  vec2 d = (uv - src) / 48.0;
  vec2 q = uv; float acc = 0.0, w = 1.0;
  for (int i = 0; i < 48; i++) { q -= d; vec3 c = frameAt(q).rgb; acc += max(0.0, dot(c, vec3(0.333)) - 0.55) * w; w *= 0.97; }
  float beam = 0.6 + 0.4 * noise(vec2(atan(uv.y - src.y, uv.x - src.x) * 18.0, u_time * 0.3));
  return vec4(frame.rgb + vec3(1.0, 0.93, 0.78) * acc * 0.06 * beam * u_amount, 1.0);
}`,
  filmBurn: `vec4 effect(vec2 uv, vec4 frame) {
  float t = u_time * 0.35;
  float n = fbm(uv * 3.0 + vec2(t, -t * 0.7));
  float edge = max(smoothstep(0.78, 1.05, uv.x + n * 0.35 - 0.12 + 0.12 * sin(t)), smoothstep(0.8, 1.05, 1.0 - uv.y + n * 0.3 - 0.1));
  vec3 burn = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.55), n) * edge;
  return vec4(frame.rgb * (1.0 - edge * 0.3 * u_amount) + burn * 0.75 * u_amount, 1.0);
}`,
  glowPulse: `vec4 effect(vec2 uv, vec4 frame) {
  vec2 px = 1.0 / u_res; vec3 blur = vec3(0.0);
  for (int x = -3; x <= 3; x++) for (int y = -3; y <= 3; y++) blur += frameAt(uv + vec2(x, y) * px * 4.0).rgb;
  blur /= 49.0;
  float pulse = 0.55 + 0.45 * sin(u_time * 3.14159 * (0.5 + u_p1));
  vec3 bright = max(blur - 0.45, 0.0) * 2.2;
  return vec4(frame.rgb + bright * pulse * u_amount, 1.0);
}`,
};

interface Gl {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  tex: WebGLTexture;
  vs: WebGLShader;
  progs: Map<string, { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> } | { error: string }>;
}
let state: Gl | null | undefined;

function init(): Gl | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, VS);
  gl.compileShader(vs);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return { canvas, gl, tex, vs, progs: new Map() };
}

/** Make the GLSL compile errors point at the user's lines (the header is hidden from them). */
export function shiftErrorLines(log: string, offset = HEADER_LINES) {
  return log.replace(/ERROR: 0:(\d+)/g, (_, n) => `line ${Math.max(1, +n - offset)}`).trim();
}

function program(body: string) {
  const s = state!;
  const hit = s.progs.get(body);
  if (hit) return hit;
  const { gl } = s;
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, SHADER_HEADER + body + FOOTER);
  gl.compileShader(fs);
  let entry: { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> } | { error: string };
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) entry = { error: shiftErrorLines(gl.getShaderInfoLog(fs) ?? 'compile error') };
  else {
    const prog = gl.createProgram()!;
    gl.attachShader(prog, s.vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) entry = { error: gl.getProgramInfoLog(prog) ?? 'link error' };
    else {
      const u: Record<string, WebGLUniformLocation | null> = {};
      for (const n of ['u_frame', 'u_res', 'u_time', 'u_amount', 'u_p1', 'u_p2', 'u_p3', 'u_p4']) u[n] = gl.getUniformLocation(prog, n);
      entry = { prog, u };
    }
  }
  if (s.progs.size > 40) s.progs.clear();
  s.progs.set(body, entry);
  return entry;
}

/** Compile only (for the code editor): returns an error message or null. */
export function compileShader(body: string): string | null {
  if (state === undefined) state = init();
  if (!state) return 'WebGL2 is not available on this device';
  const e = program(body);
  return 'error' in e ? e.error : null;
}

/** Run a shader effect over the context's current frame. Returns false when it could not run (e.g. compile error). */
export function applyShader(ctx: CanvasRenderingContext2D, body: string, amount: number, t: number, params: number[] = []): boolean {
  if (state === undefined) {
    try {
      state = init();
    } catch {
      state = null;
    }
  }
  if (!state) return false;
  const e = program(body);
  if ('error' in e) return false;
  const { gl, canvas, tex } = state;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (canvas.width !== W || canvas.height !== H) (canvas.width = W), (canvas.height = H);
  gl.viewport(0, 0, W, H);
  gl.useProgram(e.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.getParameter(gl.ARRAY_BUFFER_BINDING));
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ctx.canvas);
  gl.uniform1i(e.u.u_frame, 0);
  gl.uniform2f(e.u.u_res, W, H);
  gl.uniform1f(e.u.u_time, t);
  gl.uniform1f(e.u.u_amount, amount);
  ['u_p1', 'u_p2', 'u_p3', 'u_p4'].forEach((n, i) => gl.uniform1f(e.u[n], params[i] ?? 0.5));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
  return true;
}
