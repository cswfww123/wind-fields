// 运行时地形：一张跟着镜头走的网格，顶点按布局图抬高；片元贴烘焙好的油画地面，
// 再叠实时的东西：树/房子/飞机的阴影、云影、风吹草浪、水面波光与焦散、岸边白浪、远处的雾。
import * as THREE from 'three';
import { LOOP, WORLD_W } from './config.js';
import { LAYOUT_GLSL } from './field.js';
import { shared, litUniforms, SHADE_VERT, SHADE_FRAG } from './shading.js';

const VERT = /* glsl */ `
${SHADE_VERT}
${LAYOUT_GLSL}
uniform vec2 uOrigin;
varying vec3 vWorld;
varying vec2 vUv;
varying float vRatio;
void main() {
  vec2 xz = position.xz + uOrigin;
  float h = hAt(xz);
  vec3 n = nAt(xz, 0.5);
  vec3 w = vec3(xz.x, max(h, 0.0), xz.y);
  vWorld = w;
  vUv = vec2(xz.x / WORLD_W + 0.5, 0.5 - xz.y / LOOP);
  // 阴影里只剩天光：按法线算出「被挡住时」应变暗的比例，和烘焙光照一致
  float ndl = max(dot(n, SUN_DIR) + 0.35, 0.0) / (SUN_DIR.y + 0.35);
  vRatio = 1.0 / (1.0 + ndl * 1.05);
  sunCoord(w, n, 0.25);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const FRAG = /* glsl */ `
${SHADE_FRAG}
uniform sampler2D uPaint;
uniform sampler2D uMask;
uniform vec3 uSkyRefl;
uniform vec3 uGustCol;
varying vec3 vWorld;
varying vec2 vUv;
varying float vRatio;

void main() {
  vec2 xz = vWorld.xz;
  vec4 mk = texture2D(uMask, vUv);
  float water = mk.g;
  float tw = mod(uTime, 6283.1853);

  // 水面涟漪：扭曲采样坐标（两层错开相位交叉淡入，周期内无缝）
  vec2 uv = vUv;
  float ph = fract(uTime / 400.0);
  if (water > 0.01) {
    vec2 q = xz / LOOP * 64.0;
    vec2 off = vec2(gnoise2p(q + vec2(0.0, ph * 64.0), vec2(64.0), 71u), gnoise2p(q + vec2(ph * 64.0, 7.0), vec2(64.0), 72u));
    uv += off * vec2(0.6 / WORLD_W, 0.6 / LOOP) * water;
  }
  vec3 col = texture2D(uPaint, uv).rgb;

  // 风吹草浪：被风压低的草露出浅色的叶背
  float gs = gust(xz) * mk.r;
  col = mix(col, col * 0.86 + uGustCol * 0.22, gs * 0.55);

  // 实时阴影（树/房子/飞机）+ 云影：被挡住时只剩天光
  float sv = sunShadow();
  float cv = cloudShade(xz);
  float vis = sv * cv;
  vec3 ratio = mix(vec3(1.0), vec3(0.78, 0.86, 1.05) * vRatio + 0.06, 0.92);
  col *= mix(ratio, vec3(1.0), vis);

  if (water > 0.01) {
    float dep = mk.a;
    // 天光倒影
    col = mix(col, uSkyRefl, water * (0.12 + 0.18 * dep));
    // 浅水焦散
    vec2 cq = xz / LOOP * 128.0;
    float n1 = gnoise2p(cq + vec2(ph * 128.0, 0.0), vec2(128.0), 81u);
    float n2 = gnoise2p(cq * 1.25 + vec2(0.0, ph * 160.0), vec2(160.0), 82u);
    float caus = smoothstep(0.07, 0.0, abs(n1 - n2));
    col += vec3(0.95, 1.0, 0.92) * caus * water * (1.0 - dep) * 0.22 * vis;
    // 粼粼波光
    float s1 = gnoise2p(xz / LOOP * 384.0 + vec2(ph * 1152.0, 0.0), vec2(384.0), 91u);
    float s2 = gnoise2p(xz / LOOP * 320.0 - vec2(0.0, ph * 640.0), vec2(320.0), 92u);
    float cl = smoothstep(-0.1, 0.45, gnoise2p(xz / LOOP * 16.0 + vec2(ph * 32.0, 0.0), vec2(16.0), 94u));
    float glint = smoothstep(0.6, 0.78, s1 + s2) * (0.15 + 0.85 * cl);
    col += vec3(1.0, 0.98, 0.9) * glint * water * 0.36 * vis;
    // 岸边白浪：一圈圈往岸上推
    float sh = mk.b;
    float band = smoothstep(0.55, 1.0, sin(tw * 1.1 - sh * 9.0 + wn(xz, 64.0, 93u) * 6.0) * 0.5 + 0.5);
    col = mix(col, vec3(0.97, 0.98, 0.96), clamp(sh * (0.35 + 0.65 * band), 0.0, 1.0) * 0.8);
  }

  col = applyFog(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Terrain {
  constructor(tex) {
    this.size = { x: 150, z: 230 };
    this.step = 0.8;
    const nx = Math.round(this.size.x / this.step);
    const nz = Math.round(this.size.z / this.step);
    const geo = new THREE.PlaneGeometry(this.size.x, this.size.z, nx, nz);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      lights: true,
      uniforms: litUniforms({
        uLayout: { value: tex.layout },
        uLayoutSize: { value: tex.layoutSize },
        uPaint: { value: tex.paint },
        uMask: { value: tex.mask },
        uOrigin: { value: new THREE.Vector2() },
        uSkyRefl: { value: new THREE.Color('#e8f4f6') },
        uGustCol: { value: new THREE.Color('#e9efc4') },
      }),
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }

  /** 网格中心跟随镜头焦点（按格距取整，顶点不游动） */
  follow(fx, fz) {
    const s = this.step;
    const ox = Math.round(fx / s) * s;
    const oz = Math.round((fz - 30) / s) * s;
    this.mat.uniforms.uOrigin.value.set(ox, oz);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
