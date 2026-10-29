// 世界尺度与光照常量：烘焙着色器、运行时着色器、JS 摆放三处共用同一套数值
import * as THREE from 'three';

export const LOOP = 256;        // z 方向循环周期（世界单位），地形首尾无缝
export const WORLD_W = 160;     // 地形宽度，x ∈ [-80, 80]
export const H_MIN = -8;        // 高度编码范围（16 bit）
export const H_MAX = 40;

// 太阳在画面左侧、略偏镜头这边（西偏南），仰角约 57°：
// 影子落向右上，飞机的影子正好落在它右前方看得见的地方；朝镜头的这一面是亮的，画面高调
export const SUN_DIR = new THREE.Vector3(-0.46, 0.84, 0.26).normalize();
export const SUN_COL = new THREE.Vector3(0.62, 0.52, 0.34);   // 直射：暖
export const SKY_COL = new THREE.Vector3(0.5, 0.58, 0.76);    // 天光：冷，阴影因此偏青蓝

export const CLOUD_MAX = 28;

const v3 = (v) => `vec3(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;

export const GLSL_CONST = /* glsl */ `
#define LOOP ${LOOP.toFixed(1)}
#define WORLD_W ${WORLD_W.toFixed(1)}
#define H_MIN ${H_MIN.toFixed(1)}
#define H_MAX ${H_MAX.toFixed(1)}
#define CLOUD_MAX ${CLOUD_MAX}
const vec3 SUN_DIR = ${v3(SUN_DIR)};
const vec3 SUN_COL = ${v3(SUN_COL)};
const vec3 SKY_COL = ${v3(SKY_COL)};
`;

/** '#9CC456' → GLSL vec3 字面量（颜色管理已关闭，十六进制即最终颜色） */
export function C(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (x) => (x / 255).toFixed(4);
  return `vec3(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 把 z 绕到 ref 附近的一个周期内 */
export function wrapNear(z, ref) {
  let d = z - ref;
  d = ((((d + LOOP / 2) % LOOP) + LOOP) % LOOP) - LOOP / 2;
  return ref + d;
}

/** 合并若干 BufferGeometry（只保留 position / normal 和自定义 float 属性） */
export function mergeGeometries(parts, extra = []) {
  const geos = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const ex = extra.map((e) => new Float32Array(n * e.size));
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
    extra.forEach((e, k) => {
      const a = g.attributes[e.name];
      if (a) ex[k].set(a.array.subarray(0, c * e.size), o * e.size);
    });
    o += c;
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  extra.forEach((e, k) => out.setAttribute(e.name, new THREE.BufferAttribute(ex[k], e.size)));
  return out;
}

/** 给几何体的每个顶点写同一个属性值 */
export function fillAttr(geo, name, values) {
  const c = geo.attributes.position.count;
  const size = values.length;
  const arr = new Float32Array(c * size);
  for (let i = 0; i < c; i++) for (let k = 0; k < size; k++) arr[i * size + k] = values[k];
  geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
  return geo;
}
