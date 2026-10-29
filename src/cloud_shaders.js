// 积云小团的着色器：方片朝向镜头，片元里按（带起伏的）球面重建法线与深度。
import { GLSL_CONST } from './config.js';
import { NOISE } from './noise.js';

export const CLOUD_VERT = /* glsl */ `
${GLSL_CONST}
attribute vec4 aOff;     // xyz = 相对云底中心的偏移, w = 半径
attribute vec2 aSeed;    // x = 属于第几朵云, y = 随机数
uniform vec4 uCloudPos[CLOUD_MAX];   // xyz = 云底中心, w = 淡入淡出
uniform float uTime;
varying vec2 vQ;
varying vec3 vCenterV;
varying vec3 vWorldC;
varying float vR;
varying float vSeed;
varying float vBaseY;
varying float vFade;
void main() {
  vec4 cp = uCloudPos[int(aSeed.x + 0.5)];
  vec3 c = cp.xyz + aOff.xyz;
  float t = mod(uTime, 6283.1853);
  float r = aOff.w;
  // 云在慢慢翻涌
  c += vec3(sin(t * 0.07 + aSeed.y * 20.0), 0.6 * sin(t * 0.05 + aSeed.y * 13.0), cos(t * 0.06 + aSeed.y * 17.0)) * r * 0.05;
  r *= 1.0 + 0.05 * sin(t * 0.09 + aSeed.y * 31.0);
  vec4 cv = viewMatrix * vec4(c, 1.0);
  vQ = position.xy * 1.2;
  vCenterV = cv.xyz;
  vWorldC = c;
  vR = r;
  vSeed = aSeed.y;
  vBaseY = cp.y;
  vFade = cp.w;
  gl_Position = projectionMatrix * (cv + vec4(vQ * r, 0.0, 0.0));
}
`;

export const CLOUD_FRAG = /* glsl */ `
${GLSL_CONST}
uniform mat4 projectionMatrix;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uDeep;
uniform vec3 uFogCol;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogMax;
uniform float uTime;
varying vec2 vQ;
varying vec3 vCenterV;
varying vec3 vWorldC;
varying float vR;
varying float vSeed;
varying float vBaseY;
varying float vFade;
${NOISE}
void main() {
  float ang = atan(vQ.y, vQ.x);
  float s = vSeed * 40.0;
  float edge = 1.0 + 0.07 * sin(ang * 5.0 + s) + 0.045 * sin(ang * 9.0 + s * 1.3) + 0.025 * sin(ang * 15.0 + s * 2.1);
  float e = length(vQ) / edge;
  float aa = fwidth(e) * 1.5 + 0.015;
  float alpha = smoothstep(1.0, 1.0 - aa, e) * vFade;
  if (alpha < 0.02) discard;
  float em = min(e, 1.0);
  float zz = sqrt(max(1.0 - em * em, 0.0));
  vec3 nv = normalize(vec3(vQ / edge, zz));
  vec3 nw = normalize((vec4(nv, 0.0) * viewMatrix).xyz);
  vec3 pv = vCenterV + vec3(vQ * vR, zz * vR * edge);
  vec3 pw = vWorldC + (vec4(pv - vCenterV, 0.0) * viewMatrix).xyz;
  if (pw.y < vBaseY - 0.2) discard;

  // 菜花状的小鼓包：法线上叠两层噪声梯度
  float tt = mod(uTime, 6283.1853);
  vec4 b1 = vnoised3(nw * 2.4 + vSeed * 17.0 + vec3(0.0, sin(tt * 0.02), cos(tt * 0.017)) * 1.5);
  vec4 b2 = vnoised3(nw * 5.2 + vSeed * 9.0);
  vec3 nb = normalize(nw - (b1.yzw * 0.32 + b2.yzw * 0.16));
  float l = clamp(dot(nb, SUN_DIR) * 0.55 + 0.45, 0.0, 1.0);
  vec3 col = mix(uDeep, uShade, smoothstep(0.1, 0.42, l));
  col = mix(col, uLit, smoothstep(0.42, 0.7, l));
  float hgt = clamp((pw.y - vBaseY) / 10.0, 0.0, 1.0);
  col = mix(uDeep, col, mix(0.5, 1.0, smoothstep(0.0, 0.5, hgt)));
  float rim = pow(1.0 - zz, 3.0) * smoothstep(-0.2, 0.6, dot(nw, SUN_DIR));
  col += vec3(1.0, 0.97, 0.9) * rim * 0.22;

  float d = length(pw - cameraPosition);
  col = mix(col, uFogCol, smoothstep(uFogNear, uFogFar, d) * uFogMax);
  vec4 clip = projectionMatrix * vec4(pv, 1.0);
  gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  gl_FragColor = vec4(col, alpha);
}
`;

/* ------------------------------ 2D 云（旧版做法） ------------------------------
 * 每朵云就是一张朝向镜头的方片，形状完全由片元着色器里的 fbm 噪声画出来 ——
 * 和最初俯视版本用的是同一套算法，只是改成 billboard，斜俯视时也是一片柔软的云。
 */

export const FLAT_VERT = /* glsl */ `
${GLSL_CONST}
attribute vec3 aData;                // x = 第几朵云, y = 随机种子, z = 半宽
uniform vec4 uCloudPos[CLOUD_MAX];
uniform float uTime;
varying vec2 vUv;
varying vec3 vCenter;
varying float vExtent;
varying float vSeed;
varying float vFade;
void main() {
  vec4 cp = uCloudPos[int(aData.x + 0.5)];
  float t = mod(uTime, 6283.1853);
  // 云整体慢慢飘、轻轻起伏（一张贴片只能整体动，形状的变化交给片元里的噪声）
  vec3 c = cp.xyz + vec3(0.7 * sin(t * 0.05 + aData.y * 2.0), 0.35 * sin(t * 0.04 + aData.y * 3.0), 0.7 * cos(t * 0.045 + aData.y * 1.7));
  vec4 cv = viewMatrix * vec4(c, 1.0);
  cv.xy += position.xy * aData.z;
  vUv = position.xy * 0.5 + 0.5;
  vCenter = c;
  vExtent = aData.z;
  vSeed = aData.y;
  vFade = cp.w;
  gl_Position = projectionMatrix * cv;
}
`;

export const FLAT_FRAG = /* glsl */ `
${GLSL_CONST}
uniform float uTime;
uniform float uOpacity;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uFogCol;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogMax;
varying vec2 vUv;
varying vec3 vCenter;
varying float vExtent;
varying float vSeed;
varying float vFade;

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.02 + 7.3;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 q = (vUv - 0.5) * 2.0;


  float t = mod(uTime, 6283.1853) * 0.018;
  float n1 = fbm(q * 0.95 + vec2(vSeed * 3.1 + t, vSeed * 7.7 - t * 0.7));
  float n2 = fbm(q * 2.30 - vec2(t * 1.6, vSeed * 2.3));
  float detail = n1 * 0.72 + n2 * 0.28;

  float r = length(q);
  float shape = r + (0.5 - detail) * 1.06;
  float a = smoothstep(0.82, 0.66, shape);
  float core = smoothstep(0.70, 0.42, shape);
  a *= vFade * uOpacity;
  if (a < 0.004) discard;

  vec3 col = uLit * (0.982 + 0.03 * detail);
  col = mix(col, uShade, (1.0 - core) * 0.28);
  float d = length(vCenter - cameraPosition);
  col = mix(col, uFogCol, smoothstep(uFogNear, uFogFar, d) * uFogMax);
  gl_FragColor = vec4(col, a);
}
`;
