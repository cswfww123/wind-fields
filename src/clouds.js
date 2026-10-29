// 积云：每朵云是十几个「球形冒充体」(sphere impostor) 叠成的菜花状云团。
// 每个小团是一张朝向镜头的方片，片元里按球面重建法线和深度 —— 所以互相穿插、能挡住飞机、受光有体积。
import * as THREE from 'three';
import { LOOP, CLOUD_MAX, SUN_DIR, wrapNear } from './config.js';
import { shared } from './shading.js';
import { CLOUD_VERT, CLOUD_FRAG } from './cloud_shaders.js';

export class Clouds {
  constructor(cfg, rnd) {
    const C = cfg.clouds;
    this.list = [];
    const offs = [];
    const seeds = [];
    const n = Math.min(CLOUD_MAX, C.count);
    for (let i = 0; i < n; i++) {
      const R = C.size[0] + rnd() * (C.size[1] - C.size[0]);
      // 按云顶高度摆放：最大的一团顶上到 R * 1.6，所以底 = 顶 - 1.6R。
      // 大云自然坐得低一些，云顶就都落在飞机下面。
      const top = C.top[0] + rnd() * (C.top[1] - C.top[0]);
      const c = { x: (rnd() - 0.5) * 140, z: (rnd() - 0.5) * 220, y: top - R * 1.6, R, fade: 1 };
      this.list.push(c);
      const add = (x, y, z, r) => {
        offs.push(x, y, z, r);
        seeds.push(i, rnd());
      };
      add(0, R * 0.32, 0, R * 0.62);
      const nb = 6 + ((rnd() * 3) | 0);
      for (let k = 0; k < nb; k++) {
        const a = (k / nb) * Math.PI * 2 + rnd() * 0.5;
        const d = R * (0.58 + rnd() * 0.22);
        add(Math.cos(a) * d, R * (0.16 + rnd() * 0.1), Math.sin(a) * d * 0.85, R * (0.34 + rnd() * 0.16));
      }
      const nm = 3 + ((rnd() * 2) | 0);
      for (let k = 0; k < nm; k++) {
        const a = rnd() * Math.PI * 2;
        const d = R * (0.25 + rnd() * 0.25);
        add(Math.cos(a) * d, R * (0.62 + rnd() * 0.2), Math.sin(a) * d, R * (0.32 + rnd() * 0.12));
      }
      add((rnd() - 0.5) * R * 0.3, R * (0.95 + rnd() * 0.2), (rnd() - 0.5) * R * 0.3, R * (0.26 + rnd() * 0.08));
      for (let k = 0; k < 3; k++) {
        const a = rnd() * Math.PI * 2;
        add(Math.cos(a) * R * 0.45, R * (0.78 + rnd() * 0.2), Math.sin(a) * R * 0.4, R * (0.16 + rnd() * 0.08));
      }
    }

    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(2, 2);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(offs), 4));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 2));
    geo.instanceCount = offs.length / 4;
    this.geo = geo;

    this.posArr = Array.from({ length: CLOUD_MAX }, () => new THREE.Vector4());
    this.mat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: {
        uCloudPos: { value: this.posArr },
        uTime: shared.uTime,
        uLit: { value: new THREE.Color(C.lit) },
        uShade: { value: new THREE.Color(C.shade) },
        uDeep: { value: new THREE.Color(C.deep) },
        uFogCol: shared.uFogCol,
        uFogNear: shared.uFogNear,
        uFogFar: shared.uFogFar,
        uFogMax: shared.uFogMax,
      },
      alphaToCoverage: true,
      transparent: false,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.wind = new THREE.Vector2(C.wind[0], C.wind[1]);
  }

  /** refZ = 镜头焦点；超出前后范围的云在雾里淡出，从另一头淡入 */
  update(dt, refZ, refX) {
    const span = 230;
    const shadows = shared.uClouds.value;
    this.list.forEach((c, i) => {
      c.x += this.wind.x * dt;
      c.z += this.wind.y * dt;
      const rel = c.z - refZ;
      if (rel > span / 2 || rel < -span / 2) {
        c.z = wrapNear(c.z, refZ);
        c.x = refX + (Math.random() - 0.5) * 140;
      }
      if (c.x - refX > 85) c.x -= 170;
      if (c.x - refX < -85) c.x += 170;
      const e = Math.abs(c.z - refZ) / (span / 2);
      c.fade = 1 - THREE.MathUtils.smoothstep(e, 0.78, 1.0);
      this.posArr[i].set(c.x, c.y, c.z, c.fade);
      // 云影：沿阳光投到地面
      const hgt = c.y + c.R * 0.5;
      const k = hgt / SUN_DIR.y;
      shadows[i].set(c.x - SUN_DIR.x * k, c.z - SUN_DIR.z * k, c.R * 0.95, 0.42 * c.fade);
    });
    for (let i = this.list.length; i < CLOUD_MAX; i++) shadows[i].set(0, 0, 0, 0);
  }

  /** 平移整个世界（重定基）时调用 */
  shift(dz) { for (const c of this.list) c.z += dz; }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

export { LOOP };
