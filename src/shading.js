// 运行时共用的着色片段：阴影贴图、云影、雾、阵风。地面/树/房子/车都用它，光照才一致。
import * as THREE from 'three';
import { GLSL_CONST, CLOUD_MAX } from './config.js';
import { NOISE } from './noise.js';

/** 所有运行时材质共享的 uniform（同一个对象引用，改一次处处生效） */
export const shared = {
  uTime: { value: 0 },
  uWindT: { value: 0 },
  uClouds: { value: Array.from({ length: CLOUD_MAX }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uFogCol: { value: new THREE.Color('#cfe0ea') },
  uFogNear: { value: 120 },
  uFogFar: { value: 240 },
  uFogMax: { value: 0.5 },
};

/** ShaderMaterial 想用 three 的阴影贴图，必须带上整套 lights uniform */
export function litUniforms(own) {
  const u = THREE.UniformsUtils.clone(THREE.UniformsLib.lights);
  for (const k of Object.keys(shared)) u[k] = shared[k];
  for (const k of Object.keys(own)) u[k] = own[k];
  return u;
}

export const SHADE_VERT = /* glsl */ `
${GLSL_CONST}
#include <common>
#include <shadowmap_pars_vertex>
varying vec4 vSunCoord;
void sunCoord(vec3 worldPos, vec3 worldNormal, float bias) {
#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
  vSunCoord = directionalShadowMatrix[0] * vec4(worldPos + worldNormal * bias, 1.0);
#else
  vSunCoord = vec4(0.0);
#endif
}
`;

export const SHADE_FRAG = /* glsl */ `
${GLSL_CONST}
#include <common>
#include <packing>
#include <shadowmap_pars_fragment>
varying vec4 vSunCoord;
uniform float uTime;
uniform float uWindT;
uniform vec4 uClouds[CLOUD_MAX];
uniform vec3 uFogCol;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogMax;
${NOISE}

float sunShadow() {
#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
  DirectionalLightShadow s = directionalLightShadows[0];
  return getShadow(directionalShadowMap[0], s.shadowMapSize, s.shadowIntensity, s.shadowBias, s.shadowRadius, vSunCoord);
#else
  return 1.0;
#endif
}

// 云影：每朵云投下一块带起伏边缘的软椭圆（xy = 地面上的影子中心，z = 半径，w = 浓度）
float cloudShade(vec2 xz) {
  float lit = 1.0;
  for (int i = 0; i < CLOUD_MAX; i++) {
    vec4 c = uClouds[i];
    if (c.w <= 0.0) continue;
    vec2 d = (xz - c.xy) / c.z;
    float r2 = dot(d, d);
    if (r2 > 1.6) continue;
    float ang = atan(d.y, d.x);
    float fi = float(i);
    float wob = 0.14 * sin(ang * 3.0 + fi * 1.7) + 0.08 * sin(ang * 5.0 + fi * 2.9) + 0.05 * sin(ang * 8.0 + fi);
    float r = sqrt(r2) - wob;
    lit *= 1.0 - c.w * smoothstep(1.0, 0.62, r);
  }
  return lit;
}

vec3 applyFog(vec3 col, vec3 worldPos) {
  float d = length(worldPos - cameraPosition);
  float f = smoothstep(uFogNear, uFogFar, d) * uFogMax;
  return mix(col, uFogCol, f);
}

// 双向周期的梯度噪声（x、y 都以 per 为周期）：给会随时间平移的图案用
float gnoise2p(vec2 p, vec2 per, uint seed) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec2 c0 = ivec2(int(wrapi(i.x, per.x)), int(wrapi(i.y, per.y)));
  ivec2 c1 = ivec2(int(wrapi(i.x + 1.0, per.x)), int(wrapi(i.y + 1.0, per.y)));
  float a = dot(grad2(c0, seed), f);
  float b = dot(grad2(ivec2(c1.x, c0.y), seed), f - vec2(1.0, 0.0));
  float c = dot(grad2(ivec2(c0.x, c1.y), seed), f - vec2(0.0, 1.0));
  float d = dot(grad2(c1, seed), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 阵风：一条条更亮的风带从左往右扫过草地。uWindT 在 [0, LOOP) 内循环，图案两向都周期，绕回不跳
float gust(vec2 xz) {
  vec2 p = (xz - vec2(uWindT, 0.0)) / LOOP;
  float a = gnoise2p(p * vec2(6.0, 14.0), vec2(6.0, 14.0), 901u);
  float b = gnoise2p((p + vec2(0.0, uWindT / LOOP)) * 16.0, vec2(16.0), 913u);
  return smoothstep(0.04, 0.5, a + 0.45 * b);
}
`;
