// 布局图：GPU 烘焙出的「高度 + 水 + 地类 + 树/村落密度」，JS 读回来做摆放，
// 运行时顶点着色器读同一张图做位移 —— 同一份数据，地形、树、房子不会对不上。
import { LOOP, WORLD_W, H_MIN, H_MAX } from './config.js';

export const LAY_PPU = 2;   // 布局图：每世界单位 2 像素

export const LAYOUT_GLSL = /* glsl */ `
uniform sampler2D uLayout;
uniform vec2 uLayoutSize;
float decodeH(vec4 t) {
  vec2 b = floor(t.rg * 255.0 + 0.5);
  return H_MIN + (b.x * 256.0 + b.y) / 65535.0 * (H_MAX - H_MIN);
}
vec4 layAt(vec2 c) {
  float y = c.y - uLayoutSize.y * floor(c.y / uLayoutSize.y);
  float x = clamp(c.x, 0.0, uLayoutSize.x - 1.0);
  return texelFetch(uLayout, ivec2(int(x), int(y)), 0);
}
vec2 layCoord(vec2 xz) {
  return vec2(xz.x / WORLD_W + 0.5, 0.5 - xz.y / LOOP) * uLayoutSize - 0.5;
}
// 高度是拆成两个字节存的，不能让硬件插值，手动双线性
float hAt(vec2 xz) {
  vec2 t = layCoord(xz);
  vec2 i = floor(t);
  vec2 f = t - i;
  float a = decodeH(layAt(i)), b = decodeH(layAt(i + vec2(1.0, 0.0)));
  float c = decodeH(layAt(i + vec2(0.0, 1.0))), d = decodeH(layAt(i + vec2(1.0, 1.0)));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec3 nAt(vec2 xz, float e) {
  float l = hAt(xz - vec2(e, 0.0)), r = hAt(xz + vec2(e, 0.0));
  float n = hAt(xz - vec2(0.0, e)), s = hAt(xz + vec2(0.0, e));
  return normalize(vec3(l - r, 2.0 * e, n - s));
}
`;

export const PACK_GLSL = /* glsl */ `
vec2 packH(float h) {
  float v = floor(clamp((h - H_MIN) / (H_MAX - H_MIN), 0.0, 1.0) * 65535.0 + 0.5);
  float hi = floor(v / 256.0);
  return vec2(hi, v - hi * 256.0) / 255.0;
}
`;

export class FieldSampler {
  constructor(lay, den, w, h) {
    this.lay = lay;
    this.den = den;
    this.w = w;
    this.h = h;
  }

  _idx(ix, iy) {
    const x = Math.min(this.w - 1, Math.max(0, ix));
    const y = ((iy % this.h) + this.h) % this.h;
    return (y * this.w + x) * 4;
  }

  _coord(x, z) {
    return [(x + WORLD_W / 2) * LAY_PPU - 0.5, (0.5 - z / LOOP) * this.h - 0.5];
  }

  _bil(x, z, get) {
    const [tx, ty] = this._coord(x, z);
    const ix = Math.floor(tx);
    const iy = Math.floor(ty);
    const fx = tx - ix;
    const fy = ty - iy;
    const a = get(this._idx(ix, iy));
    const b = get(this._idx(ix + 1, iy));
    const c = get(this._idx(ix, iy + 1));
    const d = get(this._idx(ix + 1, iy + 1));
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  height(x, z) {
    const b = this.lay;
    return this._bil(x, z, (i) => H_MIN + ((b[i] * 256 + b[i + 1]) / 65535) * (H_MAX - H_MIN));
  }
  water(x, z) { return this._bil(x, z, (i) => this.lay[i + 2] / 255); }
  tree(x, z) { return this._bil(x, z, (i) => this.den[i] / 255); }
  conifer(x, z) { return this._bil(x, z, (i) => this.den[i + 1] / 255); }
  village(x, z) { return this._bil(x, z, (i) => this.den[i + 2] / 255); }
  lone(x, z) { return this._bil(x, z, (i) => this.den[i + 3] / 255); }

  cls(x, z) {
    const [tx, ty] = this._coord(x, z);
    return this.lay[this._idx(Math.round(tx), Math.round(ty)) + 3] >> 4;
  }

  alt(x, z) {
    const [tx, ty] = this._coord(x, z);
    return (this.lay[this._idx(Math.round(tx), Math.round(ty)) + 3] & 15) >= 8;
  }

  slope(x, z) {
    const e = 0.75;
    const dx = this.height(x + e, z) - this.height(x - e, z);
    const dz = this.height(x, z + e) - this.height(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }
}

// 地类编码（和 GLSL 里的 CL_* 一致）
export const CL = { MEADOW: 0, FOREST: 1, FIELD: 2, ROAD: 3, WATER: 4, SAND: 5, ROCK: 6, YARD: 7, ORCHARD: 8 };
