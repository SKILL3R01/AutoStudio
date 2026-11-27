/** Effects 2.0 shader bodies (looks, lens, retro, energy). Inputs: u_amount, u_p1..u_p4 (0..1), u_c1 / u_c2 (colours 0..1). */
export const LOOK_SHADERS: Record<string, string> = {
  tealOrange: `vec4 effect(vec2 uv, vec4 frame) {
  float l = lum(frame.rgb);
  vec3 tone = mix(vec3(0.0, 0.32, 0.38), vec3(1.0, 0.55, 0.25), smoothstep(0.15, 0.85, l));
  vec3 c = mix(frame.rgb, frame.rgb * 0.75 + tone * 0.35, 0.5 + 0.5 * u_p1 - 0.25);
  c = mix(vec3(l), c, 1.15);
  return vec4(mix(frame.rgb, c, u_amount), 1.0);
}`,
  bwFilm: `vec4 effect(vec2 uv, vec4 frame) {
  float l = lum(frame.rgb);
  l = clamp((l - 0.5) * (1.0 + 1.6 * u_p1) + 0.5, 0.0, 1.0);
  l += (hash(uv * u_res + floor(u_time * 24.0)) - 0.5) * 0.25 * u_p2;
  return vec4(mix(frame.rgb, vec3(l), u_amount), 1.0);
}`,
  sepia: `vec4 effect(vec2 uv, vec4 frame) {
  float l = lum(frame.rgb);
  vec3 c = mix(u_c1 * 0.35, vec3(1.0, 0.96, 0.88), l);
  return vec4(mix(frame.rgb, c, u_amount), 1.0);
}`,
  bleach: `vec4 effect(vec2 uv, vec4 frame) {
  float l = lum(frame.rgb);
  vec3 c = mix(frame.rgb, vec3(l), 0.55);
  c = clamp((c - 0.5) * (1.0 + 0.9 * u_p1) + 0.5, 0.0, 1.0);
  return vec4(mix(frame.rgb, c, u_amount), 1.0);
}`,
  duotone: `vec4 effect(vec2 uv, vec4 frame) {
  float l = smoothstep(0.05, 0.95, lum(frame.rgb));
  return vec4(mix(frame.rgb, mix(u_c1, u_c2, l), u_amount), 1.0);
}`,
  colorPop: `vec4 effect(vec2 uv, vec4 frame) {
  vec3 a = normalize(frame.rgb + 0.001), b = normalize(u_c1 + 0.001);
  float keep = smoothstep(0.985 - 0.12 * u_p1, 1.0 - 0.06 * u_p1, dot(a, b)) * smoothstep(0.05, 0.2, max(frame.r, max(frame.g, frame.b)) - min(frame.r, min(frame.g, frame.b)));
  return vec4(mix(frame.rgb, mix(vec3(lum(frame.rgb)), frame.rgb, keep), u_amount), 1.0);
}`,
  chromatic: `vec4 effect(vec2 uv, vec4 frame) {
  vec2 d = (uv - 0.5) * (0.004 + 0.02 * u_p1) * u_amount;
  return vec4(frameAt(uv + d).r, frame.g, frameAt(uv - d).b, 1.0);
}`,
  rgbSplit: `vec4 effect(vec2 uv, vec4 frame) {
  float a = u_p2 * 6.2832;
  vec2 d = vec2(cos(a), sin(a)) * (0.002 + 0.015 * u_p1) * u_amount * (0.7 + 0.3 * sin(u_time * 7.0));
  return vec4(frameAt(uv + d).r, frame.g, frameAt(uv - d).b, 1.0);
}`,
  zoomBlur: `vec4 effect(vec2 uv, vec4 frame) {
  vec2 c = vec2(u_p1, u_p2); vec3 acc = vec3(0.0);
  for (int i = 0; i < 16; i++) acc += frameAt(c + (uv - c) * (1.0 - float(i) * 0.006 * u_amount)).rgb;
  return vec4(acc / 16.0, 1.0);
}`,
  heatHaze: `vec4 effect(vec2 uv, vec4 frame) {
  float m = smoothstep(1.0 - u_p2, 1.0, uv.y + 0.15);
  vec2 o = vec2(noise(vec2(uv.y * 40.0, u_time * (1.0 + 4.0 * u_p1))) - 0.5, 0.0) * 0.012 * u_amount * m;
  return vec4(frameAt(uv + o).rgb, 1.0);
}`,
  lensDirt: `vec4 effect(vec2 uv, vec4 frame) {
  vec2 px = 1.0 / u_res; vec3 b = vec3(0.0);
  for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) b += frameAt(uv + vec2(x, y) * px * 18.0).rgb;
  float glow = max(lum(b / 25.0) - 0.5, 0.0) * 2.0;
  float dirt = smoothstep(0.55, 0.85, fbm(uv * vec2(u_res.x / u_res.y, 1.0) * 3.0)) + 0.4 * smoothstep(0.8, 0.95, noise(uv * 60.0));
  return vec4(frame.rgb + u_c1 * dirt * glow * u_amount * 0.8, 1.0);
}`,
  halftone: `vec4 effect(vec2 uv, vec4 frame) {
  float cell = mix(4.0, 18.0, u_p1) / u_res.y;
  vec2 g = uv * vec2(u_res.x / u_res.y, 1.0) / cell, f = fract(g) - 0.5;
  vec2 cuv = (floor(g) + 0.5) * cell / vec2(u_res.x / u_res.y, 1.0);
  float r = sqrt(1.0 - lum(frameAt(cuv).rgb)) * 0.6;
  float dotv = 1.0 - smoothstep(r - 0.06, r + 0.06, length(f));
  return vec4(mix(frame.rgb, mix(u_c2, u_c1, dotv), u_amount), 1.0);
}`,
  comic: `vec4 effect(vec2 uv, vec4 frame) {
  float lv = mix(8.0, 3.0, u_p1);
  vec3 q = floor(frame.rgb * lv + 0.5) / lv;
  vec2 px = 1.0 / u_res;
  float gx = lum(frameAt(uv + vec2(px.x, 0.0)).rgb) - lum(frameAt(uv - vec2(px.x, 0.0)).rgb);
  float gy = lum(frameAt(uv + vec2(0.0, px.y)).rgb) - lum(frameAt(uv - vec2(0.0, px.y)).rgb);
  float e = smoothstep(0.08, 0.25, length(vec2(gx, gy)) * (0.5 + u_p2));
  return vec4(mix(frame.rgb, q * (1.0 - e), u_amount), 1.0);
}`,
  pixelate: `vec4 effect(vec2 uv, vec4 frame) {
  float s = mix(3.0, 40.0, u_p1 * u_amount) / u_res.y;
  vec2 a = vec2(s * u_res.y / u_res.x, s);
  return vec4(frameAt((floor(uv / a) + 0.5) * a).rgb, 1.0);
}`,
  oldFilm: `vec4 effect(vec2 uv, vec4 frame) {
  float f = floor(u_time * 24.0);
  vec2 q = uv + vec2(0.0, (hash(vec2(f, 1.0)) - 0.5) * 0.006 * u_p1);
  vec3 c = frameAt(q).rgb;
  float l = lum(c) * (0.92 + 0.12 * hash(vec2(f, 2.0)));
  vec3 tone = mix(u_c1 * 0.25, mix(u_c1, vec3(1.0), 0.6), l);
  float x = hash(vec2(f, 3.0));
  float scratch = step(0.5, hash(vec2(f, 4.0))) * smoothstep(0.0015, 0.0, abs(uv.x - x)) * u_p2;
  vec2 v = uv - 0.5; float vig = 1.0 - dot(v, v) * 1.6;
  return vec4(mix(frame.rgb, tone * vig + scratch * 0.6, u_amount), 1.0);
}`,
  paper: `vec4 effect(vec2 uv, vec4 frame) {
  float n = fbm(uv * u_res / 140.0) * 0.6 + noise(uv * u_res / 3.0) * 0.4;
  vec3 tex = u_c1 * (0.85 + 0.3 * (n - 0.5) * (0.5 + u_p1));
  return vec4(mix(frame.rgb, frame.rgb * tex * 1.08, u_amount), 1.0);
}`,
  rainGlass: `vec4 effect(vec2 uv, vec4 frame) {
  vec2 a = vec2(u_res.x / u_res.y, 1.0);
  vec2 g = uv * a * mix(6.0, 16.0, u_p1); vec2 id = floor(g), f = fract(g) - 0.5;
  float h = hash(id); float t = fract(u_time * (0.05 + 0.1 * h) + h);
  vec2 c = vec2((h - 0.5) * 0.6, -0.4 + t * 0.8);
  float d = length((f - c) * vec2(1.0, 1.4));
  float drop = smoothstep(0.18, 0.12, d) * step(0.35, h);
  vec2 px = 1.0 / u_res; vec3 blur = vec3(0.0);
  for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) blur += frameAt(uv + vec2(x, y) * px * 6.0 * u_p2).rgb;
  vec3 back = mix(frame.rgb, blur / 25.0, u_p2 * u_amount);
  vec3 refr = frameAt(uv - (f - c) * 0.08).rgb * 1.1;
  return vec4(mix(back, refr, drop * u_amount), 1.0);
}`,
  neonEdges: `vec4 effect(vec2 uv, vec4 frame) {
  vec2 px = 1.0 / u_res * 1.5;
  float gx = lum(frameAt(uv + vec2(px.x, 0.0)).rgb) - lum(frameAt(uv - vec2(px.x, 0.0)).rgb);
  float gy = lum(frameAt(uv + vec2(0.0, px.y)).rgb) - lum(frameAt(uv - vec2(0.0, px.y)).rgb);
  float e = smoothstep(0.05, 0.3, length(vec2(gx, gy)));
  vec3 neon = mix(u_c1, u_c2, uv.x + 0.2 * sin(u_time));
  return vec4(mix(frame.rgb, frame.rgb * (1.0 - 0.85 * u_p1) + neon * e * 1.6, u_amount), 1.0);
}`,
};
