// GLSL 噪声库。地形相关的噪声在 z 方向以 LOOP 为周期（首尾无缝）；
// 树冠/云朵用的 3D 值噪声在各自的局部坐标里算，不需要周期。
export const NOISE = /* glsl */ `
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float hash2i(ivec2 c, uint seed) {
  return float(pcg(uint(c.x) + pcg(uint(c.y) + seed))) * (1.0 / 4294967295.0);
}
float hash3i(ivec3 c) {
  return float(pcg(uint(c.x) + pcg(uint(c.y) + pcg(uint(c.z))))) * (1.0 / 4294967295.0);
}
// 整数格点按周期取模（+0.5 防止除法误差把 per 本身留下来）
float wrapi(float v, float per) { return v - per * floor((v + 0.5) / per); }

vec2 grad2(ivec2 c, uint seed) {
  float a = hash2i(c, seed) * 6.2831853;
  return vec2(cos(a), sin(a));
}

// 2D 梯度噪声，y 方向周期 per（格点数）
float gnoise(vec2 p, float per, uint seed) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  int x0 = int(i.x);
  int y0 = int(wrapi(i.y, per));
  int y1 = int(wrapi(i.y + 1.0, per));
  float a = dot(grad2(ivec2(x0, y0), seed), f);
  float b = dot(grad2(ivec2(x0 + 1, y0), seed), f - vec2(1.0, 0.0));
  float c = dot(grad2(ivec2(x0, y1), seed), f - vec2(0.0, 1.0));
  float d = dot(grad2(ivec2(x0 + 1, y1), seed), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbmP(vec2 p, float per, int oct, uint seed) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    v += a * gnoise(p, per, seed + uint(i) * 131u);
    p = p * 2.0 + vec2(0.37, 0.61);
    per *= 2.0;
    a *= 0.5;
  }
  return v;
}

// 世界坐标版：cells = 每个 LOOP 内的噪声格数（必须是整数，保证周期）
// wf 归一到大致 0..1（均值 0.5，标准差约 0.2）
float wn(vec2 xz, float cells, uint seed) { return gnoise(xz * (cells / LOOP), cells, seed); }
float wfr(vec2 xz, float cells, int oct, uint seed) { return fbmP(xz * (cells / LOOP), cells, oct, seed); }
float wf(vec2 xz, float cells, int oct, uint seed) { return clamp(0.5 + 1.6 * wfr(xz, cells, oct, seed), 0.0, 1.0); }

vec2 warp2(vec2 xz, float cells, float amt, uint seed) {
  return xz + amt * vec2(wfr(xz, cells, 3, seed), wfr(xz + vec2(31.7, 0.0), cells, 3, seed + 17u));
}

// 抖动网格：最近的点。cell 必须整除 LOOP。返回 (距离, id, id2, 次近距离)
vec4 cellNear(vec2 xz, float cell, uint seed) {
  float per = LOOP / cell;
  vec2 g = xz / cell;
  vec2 i = floor(g);
  vec2 f = g - i;
  float best = 1e9, second = 1e9, id = 0.0, id2 = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 c = i + o;
      ivec2 ci = ivec2(int(c.x), int(wrapi(c.y, per)));
      vec2 pt = o + 0.1 + 0.8 * vec2(hash2i(ci, seed), hash2i(ci, seed + 1u));
      float d = length(pt - f);
      if (d < best) {
        second = best;
        best = d;
        id = hash2i(ci, seed + 2u);
        id2 = hash2i(ci, seed + 3u);
      } else if (d < second) {
        second = d;
      }
    }
  }
  return vec4(best * cell, id, id2, second * cell);
}

// 3D 值噪声 + 解析导数（树冠叶簇、云朵菜花边）
float h3(vec3 p) { return hash3i(ivec3(p)); }
vec4 vnoised3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = x - i;
  vec3 u = f * f * (3.0 - 2.0 * f);
  vec3 du = 6.0 * f * (1.0 - f);
  float a = h3(i), b = h3(i + vec3(1, 0, 0)), c = h3(i + vec3(0, 1, 0)), d = h3(i + vec3(1, 1, 0));
  float e = h3(i + vec3(0, 0, 1)), g1 = h3(i + vec3(1, 0, 1)), g2 = h3(i + vec3(0, 1, 1)), g3 = h3(i + vec3(1, 1, 1));
  float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d;
  float k5 = a - c - e + g2, k6 = a - b - e + g1, k7 = -a + b + c - d + e - g1 - g2 + g3;
  float v = a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
  vec3 dv = du * vec3(
    k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
    k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
    k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
  return vec4(v, dv);
}
`;
