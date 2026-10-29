// 河、路、水道都是「x 关于 z 的正弦和」：x(z) = c + Σ a·sin(k·2πz/LOOP + φ)
// k 是整数，所以每条曲线天然以 LOOP 为周期；JS（摆放车/房子）和 GLSL（烘焙地形）用同一份参数。
import { LOOP } from './config.js';

export const CURVE_SLOTS = 12;
const W = (Math.PI * 2) / LOOP;

/** curve = { c, t: [[k, amp, phase], ...] }（最多 4 项） */
export function curveX(cv, z) {
  let x = cv.c;
  for (const [k, a, p] of cv.t) x += a * Math.sin(k * W * z + p);
  return x;
}

export function curveDX(cv, z) {
  let d = 0;
  for (const [k, a, p] of cv.t) d += a * k * W * Math.cos(k * W * z + p);
  return d;
}

/** 到曲线的有符号距离（+ 在 x 正侧）与最近点的 z */
export function curveDist(cv, x, z) {
  let zc = z;
  for (let i = 0; i < 3; i++) {
    const f = curveX(cv, zc);
    const d = curveDX(cv, zc);
    zc += ((z - zc) + (x - f) * d) / (1 + d * d);
  }
  const f = curveX(cv, zc);
  const d = curveDX(cv, zc);
  const dist = Math.hypot(x - f, z - zc);
  return { d: Math.sign(x - f) * dist, z: zc, slope: d };
}

/** 打包成 uniform：每条曲线 4 个 vec4 = (c,k1,a1,p1) (k2,a2,p2,k3) (a3,p3,k4,a4) (p4,-,-,-) */
export function packCurves(curves) {
  const out = new Float32Array(CURVE_SLOTS * 4 * 4);
  curves.forEach((cv, i) => {
    if (!cv || i >= CURVE_SLOTS) return;
    const t = [...cv.t, [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]].slice(0, 4);
    const v = [cv.c, ...t[0], ...t[1], ...t[2], ...t[3]];
    out.set(v, i * 16);
  });
  return out;
}

export const CURVES_GLSL = /* glsl */ `
uniform vec4 uCurves[${CURVE_SLOTS * 4}];
const float CW = 6.2831853 / LOOP;

float cX(int i, float z) {
  vec4 a = uCurves[i * 4], b = uCurves[i * 4 + 1], c = uCurves[i * 4 + 2], d = uCurves[i * 4 + 3];
  return a.x + a.z * sin(a.y * CW * z + a.w) + b.y * sin(b.x * CW * z + b.z)
       + c.x * sin(b.w * CW * z + c.y) + c.w * sin(c.z * CW * z + d.x);
}
float cDX(int i, float z) {
  vec4 a = uCurves[i * 4], b = uCurves[i * 4 + 1], c = uCurves[i * 4 + 2], d = uCurves[i * 4 + 3];
  return CW * (a.z * a.y * cos(a.y * CW * z + a.w) + b.y * b.x * cos(b.x * CW * z + b.z)
       + c.x * b.w * cos(b.w * CW * z + c.y) + c.w * c.z * cos(c.z * CW * z + d.x));
}
float cDDX(int i, float z) {
  vec4 a = uCurves[i * 4], b = uCurves[i * 4 + 1], c = uCurves[i * 4 + 2], d = uCurves[i * 4 + 3];
  return -CW * CW * (a.z * a.y * a.y * sin(a.y * CW * z + a.w) + b.y * b.x * b.x * sin(b.x * CW * z + b.z)
       + c.x * b.w * b.w * sin(b.w * CW * z + c.y) + c.w * c.z * c.z * sin(c.z * CW * z + d.x));
}
// 返回 (有符号距离, 最近点 z, 斜率)
vec3 cDist(int i, vec2 p) {
  float zc = p.y;
  for (int k = 0; k < 3; k++) {
    float f = cX(i, zc);
    float d = cDX(i, zc);
    zc += ((p.y - zc) + (p.x - f) * d) / (1.0 + d * d);
  }
  float f = cX(i, zc);
  float d = length(vec2(p.x - f, p.y - zc));
  return vec3(sign(p.x - f) * d, zc, cDX(i, zc));
}
`;
