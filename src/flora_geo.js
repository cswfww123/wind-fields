// 树的几何：几团带起伏的「叶团」拼成树冠（阔叶 / 杉 / 伞松 / 灌木），单位尺寸，实例矩阵再缩放。
// 每个顶点带 aTrunk（树干=1）和 aH（在树里的相对高度，做底部暗部用）。
import * as THREE from 'three';
import { mergeGeometries, fillAttr, mulberry32 } from './config.js';

function vnoise3(x, y, z, seed) {
  const h = (i, j, k) => {
    let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(
    L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w
  );
}

/** 一团叶子：细分二十面体 → 椭球 → 噪声起伏；法线和整棵树冠的球面法线混合，明暗才像一团而不是一堆球 */
function lobe([cx, cy, cz, r], center, seed, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const n = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.2 * (vnoise3(x * 2.3 + cx * 5, y * 2.3 + cy * 5, z * 2.3, seed) - 0.5)
                + 0.1 * (vnoise3(x * 5 + 9, y * 5, z * 5, seed + 7) - 0.5);
    const X = cx + x * r * k, Y = cy + y * r * 0.9 * k, Z = cz + z * r * k;
    p.setXYZ(i, X, Y, Z);
    const lx = x, ly = y / 0.9, lz = z;
    const ll = Math.hypot(lx, ly, lz);
    let gx = X - center[0], gy = (Y - center[1]) * 1.3, gz = Z - center[2];
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    const mx = lx / ll * 0.45 + gx * 0.55, my = ly / ll * 0.45 + gy * 0.55, mz = lz / ll * 0.45 + gz * 0.55;
    const ml = Math.hypot(mx, my, mz) || 1;
    n[i * 3] = mx / ml; n[i * 3 + 1] = my / ml; n[i * 3 + 2] = mz / ml;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

function trunk(h, r) {
  const g = new THREE.CylinderGeometry(r * 0.7, r, h, 6, 1, true);
  g.translate(0, h / 2, 0);
  return g;
}

const SHAPES = {
  // 阔叶树：一大团在中间，四周几团小的，像夏天的樟树/榉树
  broad: { trunk: [0.55, 0.12], lobes: [[0, 1.2, 0, 0.82], [0.48, 1.0, 0.2, 0.55], [-0.45, 1.05, -0.15, 0.58], [0.1, 1.05, -0.5, 0.52], [-0.15, 0.98, 0.5, 0.5], [0.05, 1.68, 0.05, 0.5]] },
  // 杉：一节节往上收的尖塔
  conifer: { trunk: [0.5, 0.09], lobes: [[0, 0.95, 0, 0.62], [0, 1.6, 0, 0.5], [0, 2.18, 0, 0.38], [0, 2.66, 0, 0.26], [0, 3.0, 0, 0.15]] },
  // 伞松：细高的干，扁平宽大的冠
  umbrella: { trunk: [1.5, 0.09], lobes: [[0, 1.75, 0, 0.62], [0.55, 1.7, 0.1, 0.48], [-0.5, 1.72, -0.15, 0.5], [0.1, 1.68, 0.55, 0.45], [-0.1, 1.7, -0.55, 0.45]] },
  // 灌木：贴地的几团
  bush: { trunk: null, lobes: [[0, 0.42, 0, 0.5], [0.4, 0.34, 0.1, 0.36], [-0.35, 0.36, -0.12, 0.38]] },
};

export function makeTreeGeometry(kind, seed = 1, detail = 1) {
  const sh = SHAPES[kind];
  const rnd = mulberry32(seed * 131 + 7);
  const top = Math.max(...sh.lobes.map((l) => l[1] + l[3]));
  const center = [0, sh.lobes[0][1], 0];
  const parts = [];
  if (sh.trunk) parts.push(fillAttr(fillAttr(trunk(sh.trunk[0] + 0.25, sh.trunk[1]), 'aTrunk', [1]), 'aH', [0]));
  for (const l of sh.lobes) {
    const j = [l[0] + (rnd() - 0.5) * 0.12, l[1] + (rnd() - 0.5) * 0.08, l[2] + (rnd() - 0.5) * 0.12, l[3] * (0.92 + rnd() * 0.16)];
    const g = lobe(j, center, (seed * 977 + parts.length * 31) | 0, detail);
    fillAttr(g, 'aTrunk', [0]);
    const p = g.attributes.position;
    const hh = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) hh[i] = p.getY(i) / top;
    g.setAttribute('aH', new THREE.BufferAttribute(hh, 1));
    parts.push(g);
  }
  return mergeGeometries(parts, [{ name: 'aTrunk', size: 1 }, { name: 'aH', size: 1 }]);
}
