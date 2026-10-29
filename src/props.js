// 房子（按 z 分块实例化）、车、牛羊、帆船。统一一种平涂材质：面法线 + 冷暖光 + 真实阴影 + 云影 + 雾
import * as THREE from 'three';
import { LOOP, wrapNear } from './config.js';
import { curveX, curveDX } from './curves.js';
import { litUniforms, SHADE_VERT, SHADE_FRAG } from './shading.js';
import { houseWalls, houseRoof, carGeo, busGeo, cowGeo, sheepGeo, boatGeo, poleGeo } from './props_geo.js';

const VERT = /* glsl */ `
${SHADE_VERT}
attribute vec3 aCol;
varying vec3 vWorld;
varying vec3 vCol;
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = m * instanceMatrix;
#endif
  vec4 w = m * vec4(position, 1.0);
  vWorld = w.xyz;
  vCol = aCol;
#ifdef USE_INSTANCING_COLOR
  vCol *= instanceColor;
#endif
  sunCoord(w.xyz, normalize(mat3(m) * normal), 0.12);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = /* glsl */ `
${SHADE_FRAG}
varying vec3 vWorld;
varying vec3 vCol;
void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
  float vis = sunShadow() * cloudShade(vWorld.xz);
  float ndl = max(dot(n, SUN_DIR), 0.0);
  vec3 c = vCol * (SKY_COL * (0.82 + 0.18 * n.y) + SUN_COL * ndl / SUN_DIR.y * vis) * 0.9;
  gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
}
`;

export function propMaterial() {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, lights: true, side: THREE.DoubleSide, uniforms: litUniforms({}) });
}

function shadowy(o) {
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

export class Houses {
  constructor(list, mat) {
    this.group = new THREE.Group();
    this.walls = houseWalls();
    this.roof = houseRoof();
    this.chunks = [];
    const CH = 32;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    for (let z0 = -LOOP / 2; z0 < LOOP / 2; z0 += CH) {
      const cz = z0 + CH / 2;
      const hs = list.filter((h) => h.z >= z0 && h.z < z0 + CH);
      if (!hs.length) continue;
      const node = new THREE.Group();
      node.userData.cz = cz;
      const wm = shadowy(new THREE.InstancedMesh(this.walls, mat, hs.length));
      const rm = shadowy(new THREE.InstancedMesh(this.roof, mat, hs.length));
      hs.forEach((h, i) => {
        q.setFromAxisAngle(up, h.rot);
        m.compose(new THREE.Vector3(h.x, h.y, h.z - cz), q, new THREE.Vector3(h.w, h.h, h.d));
        wm.setMatrixAt(i, m);
        rm.setMatrixAt(i, m);
        wm.setColorAt(i, col.set(h.wall));
        rm.setColorAt(i, col.set(h.roof));
      });
      wm.computeBoundingSphere();
      rm.computeBoundingSphere();
      node.add(wm, rm);
      this.chunks.push(node);
      this.group.add(node);
    }
  }

  place(refZ) {
    for (const node of this.chunks) {
      const cz = node.userData.cz;
      node.position.z = cz + Math.round((refZ - cz) / LOOP) * LOOP;
    }
  }

  dispose() {
    this.walls.dispose();
    this.roof.dispose();
  }
}

/** 路上的车：沿曲线走各自的车道 */
export class Traffic {
  constructor(cfg, mat, field) {
    this.group = new THREE.Group();
    this.field = field;
    this.cars = [];
    const T = cfg.traffic;
    if (!T) return;
    T.cars.forEach((c, i) => {
      const geo = c.kind === 'bus' ? busGeo(c.color, c.band) : carGeo(c.color);
      const mesh = shadowy(new THREE.Mesh(geo, mat));
      this.group.add(mesh);
      this.cars.push({ mesh, geo, curve: cfg.curves[c.road], z: c.z, dir: c.dir, lane: c.lane ?? 1.1, speed: c.speed });
    });
  }

  update(dt, refZ) {
    for (const c of this.cars) {
      c.z -= c.dir * c.speed * dt;
      const zb = wrapNear(c.z, 0);
      const x = curveX(c.curve, zb);
      const s = curveDX(c.curve, zb);
      const l = Math.hypot(s, 1);
      const nx = 1 / l, nz = -s / l;
      const px = x + nx * c.lane * c.dir;
      const pz = zb + nz * c.lane * c.dir;
      c.mesh.position.set(px, this.field.height(px, pz) + 0.05, wrapNear(pz, refZ));
      c.mesh.rotation.y = Math.atan2(s * c.dir, c.dir);
    }
  }

  dispose() { this.cars.forEach((c) => c.geo.dispose()); }
}

/** 电线杆和电线：沿一条路每 12.8 个单位一根（整除 LOOP），电线在两杆之间微微下垂 */
export class Poles {
  constructor(cfg, mat, field) {
    this.group = new THREE.Group();
    this.list = [];
    const P = cfg.poles;
    if (!P) return;
    const cv = cfg.curves[P.road];
    const n = Math.round(LOOP / (P.spacing ?? 12.8));
    const step = LOOP / n;
    for (let i = 0; i < n; i++) {
      const z0 = -LOOP / 2 + i * step;
      const s = curveDX(cv, z0);
      const l = Math.hypot(s, 1);
      const x = curveX(cv, z0) + (P.side * P.offset) / l;
      const z = z0 - (P.side * P.offset * s) / l;
      this.list.push({ x, z, y: field.height(x, z) - 0.1, rot: Math.atan2(s, 1) });
    }
    this.geo = poleGeo();
    this.mesh = new THREE.InstancedMesh(this.geo, mat, n);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.SEG = 8;
    const nv = n * 2 * this.SEG * 2;
    this.wpos = new Float32Array(nv * 3);
    this.wgeo = new THREE.BufferGeometry();
    this.wgeo.setAttribute('position', new THREE.BufferAttribute(this.wpos, 3));
    this.wmat = new THREE.LineBasicMaterial({ color: P.wire ?? '#4a4f52', transparent: true, opacity: 0.55, fog: false });
    this.wires = new THREE.LineSegments(this.wgeo, this.wmat);
    this.wires.frustumCulled = false;
    this.group.add(this.mesh, this.wires);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3(1, 1, 1);
    this._v = new THREE.Vector3();
  }

  update(refZ) {
    const L = this.list;
    if (!L.length) return;
    const n = L.length;
    const zs = L.map((p) => wrapNear(p.z, refZ));
    for (let i = 0; i < n; i++) {
      const p = L[i];
      this._q.setFromEuler(this._e.set(0, p.rot, 0));
      this._m.compose(this._v.set(p.x, p.y, zs[i]), this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // 每一跨：从 i 到 i+1（按 z 方向相邻），跨过周期接缝时把下一根挪到同一周期副本
    let k = 0;
    const W = this.wpos;
    for (let i = 0; i < n; i++) {
      const a = L[i], b = L[(i + 1) % n];
      const za = zs[i];
      const zb = wrapNear(b.z, za + LOOP / n);
      for (const side of [-0.7, 0.7]) {
        const ax = a.x + Math.cos(a.rot) * side, az = za - Math.sin(a.rot) * side;
        const bx = b.x + Math.cos(b.rot) * side, bz = zb - Math.sin(b.rot) * side;
        const ay = a.y + 5.54, by = b.y + 5.54;
        for (let j = 0; j < this.SEG; j++) {
          for (const t of [j / this.SEG, (j + 1) / this.SEG]) {
            W[k++] = ax + (bx - ax) * t;
            W[k++] = ay + (by - ay) * t - 0.9 * 4 * t * (1 - t);
            W[k++] = az + (bz - az) * t;
          }
        }
      }
    }
    this.wgeo.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (!this.geo) return;
    this.geo.dispose();
    this.wgeo.dispose();
    this.wmat.dispose();
  }
}

/** 牛羊：一小群一小群，慢慢地挪 */
export class Herds {
  constructor(herds, mat, field, rnd) {
    this.group = new THREE.Group();
    this.field = field;
    this.geos = { cow: cowGeo(), sheep: sheepGeo() };
    this.list = [];
    for (const h of herds) {
      for (let i = 0; i < h.n; i++) {
        const mesh = shadowy(new THREE.Mesh(this.geos[h.kind], mat));
        const s = h.kind === 'cow' ? 0.95 + rnd() * 0.2 : 0.85 + rnd() * 0.25;
        mesh.scale.setScalar(s);
        this.group.add(mesh);
        this.list.push({
          mesh, cx: h.x + (rnd() - 0.5) * 7, cz: h.z + (rnd() - 0.5) * 7,
          r: 0.6 + rnd() * 1.6, w: 0.03 + rnd() * 0.04, ph: rnd() * 100, rot: rnd() * 6.28,
        });
      }
    }
  }

  update(time, refZ) {
    for (const a of this.list) {
      const t = time * a.w + a.ph;
      const x = a.cx + Math.cos(t) * a.r;
      const zb = a.cz + Math.sin(t * 0.7) * a.r;
      const dx = -Math.sin(t), dz = Math.cos(t * 0.7) * 0.7;
      const target = Math.atan2(-dx, -dz);
      let d = target - a.rot;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      a.rot += d * 0.02;
      a.mesh.position.set(x, this.field.height(x, zb), wrapNear(zb, refZ));
      a.mesh.rotation.y = a.rot;
    }
  }

  dispose() { Object.values(this.geos).forEach((g) => g.dispose()); }
}

/** 帆船：慢慢漂，快撞到岸就转向 */
export class Boats {
  constructor(boats, mat, field) {
    this.group = new THREE.Group();
    this.field = field;
    this.geo = boatGeo();
    this.list = boats.map((b) => {
      const mesh = shadowy(new THREE.Mesh(this.geo, mat));
      mesh.scale.setScalar(0.9);
      this.group.add(mesh);
      return { ...b, mesh, z: b.z };
    });
  }

  update(dt, refZ) {
    for (const b of this.list) {
      const fx = -Math.sin(b.rot), fz = -Math.cos(b.rot);
      const zb = wrapNear(b.z, 0);
      if (this.field.water(b.x + fx * 7, zb + fz * 7) < 0.9) b.rot += dt * 0.6;
      b.x += fx * b.speed * dt;
      b.z += fz * b.speed * dt;
      b.mesh.position.set(b.x, 0.05 + Math.sin(performance.now() * 0.0012 + b.speed * 9) * 0.04, wrapNear(b.z, refZ));
      b.mesh.rotation.y = b.rot;
    }
  }

  dispose() { this.geo.dispose(); }
}
