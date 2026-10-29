// 2D 云：每朵云一张朝向镜头的方片，形状全靠片元着色器里的 fbm 画出来。
// 这是最初俯视版本的做法，换成 billboard 之后在斜俯视里也是同一片柔软的云。
import * as THREE from 'three';
import { LOOP, CLOUD_MAX, SUN_DIR, wrapNear } from './config.js';
import { shared } from './shading.js';
import { FLAT_VERT, FLAT_FRAG } from './cloud_shaders.js';

export class FlatClouds {
  constructor(cfg, rnd) {
    const C = cfg.clouds;
    this.group = new THREE.Group();
    this.list = [];
    const data = [];
    const n = Math.min(CLOUD_MAX, C.count);
    for (let i = 0; i < n; i++) {
      const R = C.size[0] + rnd() * (C.size[1] - C.size[0]);
      const top = (C.top ? C.top[0] + rnd() * (C.top[1] - C.top[0]) : C.base[1]) - R * 0.55;
      const c = { x: (rnd() - 0.5) * 140, z: (rnd() - 0.5) * 220, y: top - R * 1.15, R, fade: 1 };
      this.list.push(c);
      // 半宽 1.15R：形状只占方片中间的 0.85，四周留出余量让 alpha 软下去
      data.push(i, i * 4.7 + 1.3, R * 1.15);
    }

    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(2, 2);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('aData', new THREE.InstancedBufferAttribute(new Float32Array(data), 3));
    geo.instanceCount = n;
    this.geo = geo;

    this.posArr = Array.from({ length: CLOUD_MAX }, () => new THREE.Vector4());
    this.mat = new THREE.ShaderMaterial({
      vertexShader: FLAT_VERT,
      fragmentShader: FLAT_FRAG,
      uniforms: {
        uCloudPos: { value: this.posArr },
        uTime: shared.uTime,
        uOpacity: { value: C.opacity ?? 1.0 },
        uLit: { value: new THREE.Color(C.lit) },
        uShade: { value: new THREE.Color(C.shade) },
        uFogCol: shared.uFogCol,
        uFogNear: shared.uFogNear,
        uFogFar: shared.uFogFar,
        uFogMax: shared.uFogMax,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.group.add(this.mesh);
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
      shadows[i].set(c.x - SUN_DIR.x * k, c.z - SUN_DIR.z * k, c.R * 1.15, 0.38 * c.fade);
    });
    for (let i = this.list.length; i < CLOUD_MAX; i++) shadows[i].set(0, 0, 0, 0);
  }

  shift(dz) { for (const c of this.list) c.z += dz; }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

export { LOOP };
