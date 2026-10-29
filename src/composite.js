// 合成：把 3D 画面贴进撕纸窗口，加一点柔光（亮处晕开）、夏天的暖调、左上角的阳光。
export const COMPOSITE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uHalf;
uniform float uRtHalf;
uniform vec2 uRtSize;
uniform float uReveal;
uniform vec3 uPaper;
uniform vec3 uGlow;
uniform float uSat;

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.02 + 7.3; a *= 0.5; }
  return v;
}
vec3 blur(vec2 uv, float lod) {
  vec2 o = exp2(lod) / uRtSize;
  return 0.25 * (textureLod(tScene, uv + o, lod).rgb + textureLod(tScene, uv - o, lod).rgb
    + textureLod(tScene, uv + vec2(o.x, -o.y), lod).rgb + textureLod(tScene, uv + vec2(-o.x, o.y), lod).rgb);
}

void main() {
  vec2 px = vUv * uRes;
  vec2 d2 = abs(px - uCenter) - vec2(uHalf);
  float d = max(d2.x, d2.y);
  float n1 = fbm(px / 58.0 + 3.7);
  float n2 = fbm(px / 13.0 - 11.2);
  float n3 = fbm(px / 3.1 + 41.0);
  float n4 = fbm(px / 3.4 + 7.0);
  float edge = d + (n1 - 0.5) * 16.0 + (n2 - 0.5) * 4.2 + (n3 - 0.5) * 1.4;
  float mask = smoothstep(1.1, -1.1, edge + (n4 - 0.5) * 2.4);
  float fiber = smoothstep(5.0, -2.0, edge) * smoothstep(0.42, 0.68, n4);
  mask = max(mask, fiber);

  vec3 paper = uPaper * (0.995 + 0.012 * fbm(px / 210.0));
  vec2 rel = (px - uCenter) / uRtHalf;
  vec2 suv = clamp(rel * 0.5 + 0.5, 0.0, 1.0);
  vec3 scene = texture2D(tScene, suv).rgb;

  // 柔光：亮处（云顶、水面碎光）向外晕开一点
  vec3 bl = blur(suv, 3.0) * 0.55 + blur(suv, 5.0) * 0.45;
  scene += max(bl - 0.7, 0.0) * 0.6;
  // 夏天的空气：整体轻微提亮、暗部带一点青、亮部偏暖
  float lum = dot(scene, vec3(0.299, 0.587, 0.114));
  scene = mix(vec3(lum), scene, uSat);
  scene = mix(scene * vec3(0.96, 1.0, 1.04), scene * vec3(1.04, 1.01, 0.96), smoothstep(0.2, 0.8, lum));
  scene += vec3(0.012, 0.02, 0.026) * (1.0 - lum);
  // 左上角的阳光
  float g = smoothstep(1.6, 0.0, length(rel - vec2(-1.0, 1.05)));
  scene += uGlow * g * g * 0.16;

  float rim = smoothstep(-7.0, 0.0, edge);
  scene *= mix(1.0, 0.965, rim);
  scene = mix(scene, scene * scene * 1.03, rim * 0.3);
  vec3 col = mix(paper, scene, mask * uReveal);

  vec2 cell = floor(px / 2.0);
  float speck = step(0.9968, hash21(cell + 91.7)) * step(0.0, edge) * step(edge, 30.0);
  col = mix(col, uPaper * 0.86, speck * uReveal);
  col += (hash21(px + 13.0) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;
