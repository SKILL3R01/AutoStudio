import type { ParallaxCamera } from './motion';
import type { Drawable } from './renderer';

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;

// Iterative inverse displacement: near pixels (depth → 1) move and magnify more than far ones.
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D img; uniform sampler2D dep;
uniform vec2 off; uniform float push; uniform float zoom; uniform float strength;
void main() {
  vec2 s = uv;
  for (int i = 0; i < 5; i++) {
    float d = texture(dep, clamp(s, 0.0, 1.0)).r * strength;
    s = (uv - 0.5) / (zoom * (1.0 + push * d)) + 0.5 - off * d;
  }
  o = texture(img, clamp(s, 0.001, 0.999));
}`;

interface Gl {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  img: WebGLTexture;
  dep: WebGLTexture;
  lastDepth?: Drawable;
}

let ctx: Gl | null | undefined;

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
  const tex = (unit: number) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const img = tex(0), dep = tex(1);
  gl.uniform1i(gl.getUniformLocation(prog, 'img'), 0);
  gl.uniform1i(gl.getUniformLocation(prog, 'dep'), 1);
  return { canvas, gl, prog, img, dep };
}

const dims = (d: Drawable) => (d instanceof HTMLVideoElement ? { w: d.videoWidth, h: d.videoHeight } : { w: d.width, h: d.height });

/** Render `color` displaced by `depth` for the given camera. Returns null when WebGL2 is unavailable. */
export function renderParallax(color: Drawable, depth: Drawable, cam: ParallaxCamera): HTMLCanvasElement | null {
  if (ctx === undefined) {
    try {
      ctx = init();
    } catch {
      ctx = null;
    }
  }
  if (!ctx) return null;
  const { gl, canvas, prog } = ctx;
  const { w, h } = dims(color);
  const s = Math.min(1, 1920 / Math.max(w, h));
  const W = Math.round(w * s), H = Math.round(h * s);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  gl.viewport(0, 0, W, H);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, ctx.img);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, color as TexImageSource);
  if (ctx.lastDepth !== depth) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ctx.dep);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, depth as TexImageSource);
    ctx.lastDepth = depth;
  }
  gl.uniform2f(gl.getUniformLocation(prog, 'off'), cam.ox, cam.oy);
  gl.uniform1f(gl.getUniformLocation(prog, 'push'), cam.push);
  gl.uniform1f(gl.getUniformLocation(prog, 'zoom'), cam.zoom);
  gl.uniform1f(gl.getUniformLocation(prog, 'strength'), cam.strength);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return canvas;
}
