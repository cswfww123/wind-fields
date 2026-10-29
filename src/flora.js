// 树林：按 z 分块的 InstancedMesh（每块 32 单位），每帧把块挪到离镜头最近的那个周期；
// 着色是「三段色阶 + 叶簇凹凸 + 逆光描边」的动画背景画法，同时接收真实阴影和云影。
import * as THREE from 'three';
import { LOOP } from './config.js';
import { shared, litUniforms, SHADE_VERT, SHADE_FRAG } from './shading.js';
import { makeTreeGeometry } from './flora_geo.js';

const CHUNK = 32;
const NCH = LOOP / CHUNK;

const VERT = /* glsl */ `
${SHADE_VERT}
uniform float uTime;
attribute float aTrunk;
attribute float aH;
attribute vec4 aSeed;
varying vec3 vN;
varying vec3 vL;
varying vec3 vWorld;
varying float vTrunk;
varying float vH;
varying vec4 vSeed;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  float sway = (1.0 - aTrunk) * aH * aH;
  float ph = aSeed.w * 6.2831853;
  float t = mod(uTime, 6283.1853);
  w.x += sway * (0.22 * sin(t * 0.9 + ph) + 0.1 * sin(t * 2.1 + ph * 1.7));
  w.z += sway * 0.08 * sin(t * 1.3 + ph * 2.3);
  vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vN = n;
  vL = position * 2.2 + aSeed.w * 37.0;
  vWorld = w.xyz;
  vTrunk = aTrunk;
  vH = aH;
  vSeed = aSeed;
  sunCoord(w.xyz, n, 0.35);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = /* glsl */ `
${SHADE_FRAG}
uniform vec3 uPal[24];
uniform vec3 uBark;
varying vec3 vN;
varying vec3 vL;
varying vec3 vWorld;
varying float vTrunk;
varying float vH;
varying vec4 vSeed;
void main() {
  float vis = sunShadow() * cloudShade(vWorld.xz);
  if (vTrunk > 0.5) {
    float l = max(dot(normalize(vN), SUN_DIR), 0.0) * vis;
    vec3 c = uBark * (0.55 + 0.6 * l);
    gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
    return;
  }
  // 叶簇：两层 3D 值噪声的梯度扰动法线，球面上长出一簇簇的叶团
  vec4 n1 = vnoised3(vL);
  vec4 n2 = vnoised3(vL * 2.3 + 11.0);
  vec3 n = normalize(normalize(vN) - (n1.yzw * 0.38 + n2.yzw * 0.2));
  float ndl = dot(n, SUN_DIR);
  float l = clamp(ndl * 0.6 + 0.4, 0.0, 1.0) * mix(0.25, 1.0, vis);
  int k = int(vSeed.x + 0.5) * 4;
  vec3 c = mix(uPal[k], uPal[k + 1], smoothstep(0.16, 0.36, l));
  c = mix(c, uPal[k + 2], smoothstep(0.5, 0.68, l));
  c = mix(c, uPal[k + 3], smoothstep(0.8, 0.95, l) * smoothstep(0.45, 0.75, n1.x));
  c *= vSeed.y * vec3(1.0 + vSeed.z * 0.06, 1.0, 1.0 - vSeed.z * 0.06);
  // 逆光：朝太阳那一侧的轮廓透出一圈亮黄绿
  vec3 v = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * smoothstep(-0.1, 0.5, dot(n, SUN_DIR));
  c += uPal[k + 3] * rim * 0.35 * vis;
  c *= mix(0.62, 1.0, smoothstep(0.05, 0.55, vH));
  gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
}
`;

export const VARIANTS = [
  { shape: 'broad', seed: 3, detail: 2 },
  { shape: 'broad', seed: 8, detail: 1 },
  { shape: 'conifer', seed: 5, detail: 1 },
  { shape: 'umbrella', seed: 9, detail: 1 },
  { shape: 'bush', seed: 4, detail: 1 },
];

export class Forest {
  /** trees: [{ x, y, z, s, sy, rot, v (variant), pal, b, hue, ph }] */
  constructor(trees, palettes) {
    this.group = new THREE.Group();
    this.geos = VARIANTS.map((v) => makeTreeGeometry(v.shape, v.seed, v.detail));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      lights: true,
      uniforms: litUniforms({
        uPal: { value: Array.from({ length: 6 }, (_, i) => palettes[i] ?? palettes[0]).flat().map((h) => new THREE.Color(h)) },
        uBark: { value: new THREE.Color('#5a4434') },
      }),
    });
    this.chunks = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let c = 0; c < NCH; c++) {
      const z0 = -LOOP / 2 + c * CHUNK;
      const cz = z0 + CHUNK / 2;
      const node = new THREE.Group();
      node.userData.cz = cz;
      for (let v = 0; v < VARIANTS.length; v++) {
        const list = trees.filter((t) => t.v === v && t.z >= z0 && t.z < z0 + CHUNK);
        if (!list.length) continue;
        const mesh = new THREE.InstancedMesh(this.geos[v], this.mat, list.length);
        const seeds = new Float32Array(list.length * 4);
        list.forEach((t, i) => {
          q.setFromAxisAngle(up, t.rot);
          m.compose(new THREE.Vector3(t.x, t.y, t.z - cz), q, new THREE.Vector3(t.s, t.s * t.sy, t.s));
          mesh.setMatrixAt(i, m);
          seeds.set([t.pal, t.b, t.hue, t.ph], i * 4);
        });
        mesh.geometry = this.geos[v].clone();
        mesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        node.add(mesh);
      }
      this.chunks.push(node);
      this.group.add(node);
    }
  }

  /** 每块挪到离 refZ 最近的那个周期 */
  place(refZ) {
    for (const node of this.chunks) {
      const cz = node.userData.cz;
      const k = Math.round((refZ - cz) / LOOP);
      node.position.z = cz + k * LOOP;
    }
  }

  dispose() {
    this.group.traverse((o) => { if (o.isInstancedMesh) o.geometry.dispose(); });
    this.geos.forEach((g) => g.dispose());
    this.mat.dispose();
  }
}
