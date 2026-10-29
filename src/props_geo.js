// 小物件的几何：房子（墙+山墙 / 屋顶）、车、牛、羊、帆船。顶点色放在 aCol 里。
import * as THREE from 'three';
import { mergeGeometries, fillAttr } from './config.js';

export function rgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

function box(w, h, d, x, y, z, col) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return fillAttr(g, 'aCol', rgb(col));
}

const EX = [{ name: 'aCol', size: 3 }];

function tri(verts, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return fillAttr(g, 'aCol', rgb(col));
}

// 单位房子：墙高 1，屋脊沿 x，山墙高 GH（实例缩放 (w, h, d)）
const GH = 0.6;
export function houseWalls() {
  const b = box(1, 1, 1, 0, 0.5, 0, '#ffffff');
  const parts = [b];
  for (const s of [-1, 1]) {
    const x = s * 0.5;
    const v = s > 0
      ? [x, 1, -0.5, x, 1 + GH, 0, x, 1, 0.5]
      : [x, 1, 0.5, x, 1 + GH, 0, x, 1, -0.5];
    parts.push(tri(v, '#ffffff'));
  }
  // 门和窗（深色）
  parts.push(box(0.16, 0.42, 0.02, -0.18, 0.21, 0.505, '#4d4036'));
  parts.push(box(0.2, 0.2, 0.02, 0.2, 0.55, 0.505, '#4b5a63'));
  parts.push(box(0.2, 0.2, 0.02, 0.2, 0.55, -0.505, '#4b5a63'));
  return mergeGeometries(parts, EX);
}

export function houseRoof() {
  const ov = 0.1;
  const ez = 0.64;
  const ey = 1 + GH * (1 - ez / 0.5) + 0.03;
  const ry = 1 + GH + 0.03;
  const x0 = -0.5 - ov, x1 = 0.5 + ov;
  const v = [];
  for (const s of [-1, 1]) {
    const z = s * ez;
    const a = [x0, ry, 0], b = [x1, ry, 0], c = [x1, ey, z], d = [x0, ey, z];
    if (s > 0) v.push(...a, ...d, ...c, ...a, ...c, ...b);
    else v.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const g = tri(v, '#ffffff');
  const ridge = box(1 + ov * 2, 0.05, 0.08, 0, ry + 0.01, 0, '#ffffff');
  return mergeGeometries([g, ridge], EX);
}

export function carGeo(col) {
  return mergeGeometries([
    box(1.7, 0.62, 3.6, 0, 0.55, 0, col),
    box(1.46, 0.5, 1.8, 0, 1.1, 0.25, '#4c606b'),
    box(1.5, 0.08, 1.7, 0, 1.38, 0.25, col),
    box(1.6, 0.06, 0.5, 0, 0.88, -1.45, '#f2efe6'),
    ...[[-0.8, -1.15], [0.8, -1.15], [-0.8, 1.15], [0.8, 1.15]].map(([x, z]) => box(0.22, 0.5, 0.62, x, 0.25, z, '#2e2b29')),
  ], EX);
}

export function cowGeo() {
  return mergeGeometries([
    box(0.85, 0.75, 1.6, 0, 0.95, 0, '#f4f0e6'),
    box(0.6, 0.06, 0.6, 0.12, 1.34, -0.2, '#3a312a'),
    box(0.5, 0.06, 0.45, -0.15, 1.34, 0.45, '#3a312a'),
    box(0.5, 0.5, 0.55, 0, 1.15, -1.0, '#efe8da'),
    box(0.3, 0.22, 0.15, 0, 1.0, -1.32, '#c9b49a'),
    ...[[-0.3, -0.6], [0.3, -0.6], [-0.3, 0.6], [0.3, 0.6]].map(([x, z]) => box(0.18, 0.6, 0.18, x, 0.3, z, '#d8d0c2')),
  ], EX);
}

export function sheepGeo() {
  return mergeGeometries([
    box(0.8, 0.62, 1.05, 0, 0.72, 0, '#f7f4ea'),
    box(0.68, 0.18, 0.9, 0, 1.08, 0, '#fbf9f2'),
    box(0.34, 0.36, 0.4, 0, 0.82, -0.68, '#4a4238'),
    ...[[-0.24, -0.35], [0.24, -0.35], [-0.24, 0.35], [0.24, 0.35]].map(([x, z]) => box(0.12, 0.42, 0.12, x, 0.21, z, '#4a4238')),
  ], EX);
}

export function boatGeo() {
  const sail = tri([0, 0.5, -0.6, 0, 4.2, 0.1, 0, 0.5, 1.4], '#fbfaf4');
  const jib = tri([0, 0.5, -1.0, 0, 3.4, -0.7, 0, 0.5, -1.9], '#f3efe2');
  return mergeGeometries([
    box(1.3, 0.5, 4.2, 0, 0.2, 0, '#f6f3ec'),
    box(0.9, 0.35, 1.4, 0, 0.6, 0.5, '#2f6f8f'),
    box(0.08, 4.0, 0.08, 0, 2.3, -0.5, '#8a6a4a'),
    sail,
    jib,
  ], EX);
}

// 乡下的巴士：奶油色车身 + 一道绿腰线，车头朝 -z（和车一致）
export function busGeo(body = '#f2ead2', band = '#5f9a6e') {
  return mergeGeometries([
    box(2.0, 1.5, 6.4, 0, 1.15, 0, body),
    box(2.04, 0.36, 6.44, 0, 0.62, 0, band),
    box(2.06, 0.5, 5.6, 0, 1.45, 0.15, '#4c606b'),
    box(1.9, 0.5, 0.06, 0, 1.5, -3.2, '#4c606b'),
    box(1.8, 0.1, 6.0, 0, 1.95, 0, body),
    ...[[-0.9, -2.2], [0.9, -2.2], [-0.9, 2.2], [0.9, 2.2]].map(([x, z]) => box(0.24, 0.56, 0.7, x, 0.28, z, '#2e2b29')),
  ], EX);
}

// 木电线杆：杆 + 两根横担 + 白瓷瓶。原点在杆脚，横担沿 x
export function poleGeo() {
  return mergeGeometries([
    box(0.2, 5.8, 0.2, 0, 2.9, 0, '#6b5a48'),
    box(1.6, 0.12, 0.14, 0, 5.4, 0, '#5a4c3e'),
    box(1.1, 0.1, 0.12, 0, 4.9, 0, '#5a4c3e'),
    ...[-0.7, 0.7].map((x) => box(0.12, 0.16, 0.12, x, 5.54, 0, '#eeeae0')),
  ], EX);
}
