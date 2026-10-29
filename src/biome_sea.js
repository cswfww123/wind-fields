// 碧海沙洲：退潮的浅海。松岛一样的小岛（白沙滩、淡色石崖、黑松和阔叶林），岛间一道道浮出水面的沙洲，
// 浅处透亮的青绿看得见沙纹、海草和珊瑚，越往外越蓝；矮平的岛上有几户白墙彩顶的人家，海上几张帆。
import { C } from './config.js';

export const seaCurves = [
  { c: 0, t: [[1, 16, 1.1], [3, 6, 2.9], [5, 2, 0.4]] },   // 0 群岛的脊线
];

export const seaGLSL = /* glsl */ `
struct SV { float t; float cliff; float hill; float h; };

// t > 0 是陆地（越大越往岛心），t < 0 是海（越小越深）
SV seaAt(vec2 p) {
  SV s;
  vec2 q = warp2(p, 6.0, 5.0, 301u);
  float dsp = abs(cDist(0, q).x);
  s.t = wf(q, 8.0, 4, 302u) + 0.24 * smoothstep(40.0, 6.0, dsp) - 0.74;
  s.cliff = smoothstep(0.56, 0.7, wf(p, 10.0, 2, 303u));
  s.hill = wf(p, 16.0, 2, 304u);
  float lt = max(s.t, 0.0);
  s.h = min(lt, 0.1) * 5.0 + smoothstep(0.1, 0.3, lt) * (0.3 + 10.0 * s.hill * s.hill)
      + smoothstep(0.0, 0.03, lt) * 2.5 * s.cliff;
  return s;
}

Ground biome(vec2 p) {
  Ground g = ground0();
  SV sv = seaAt(p);
  float lt = max(sv.t, 0.0);

  // 沙洲：顺着 z 拉长的脊，在浅水里浮出来
  float bar = 1.0 - abs(2.0 * wf(p * vec2(3.0, 1.0), 8.0, 3, 305u) - 1.0);
  float sea = smoothstep(0.008, -0.008, sv.t);
  float sbE = smoothstep(0.86, 0.95, bar) * smoothstep(-0.16, -0.06, sv.t) * sea;
  float wet = sea * (1.0 - sbE);

  // 海底：浅处白沙 → 青绿 → 蓝；沙纹、海草、珊瑚
  float dep = smoothstep(0.0, -0.3, sv.t);
  dep *= 1.0 - 0.85 * smoothstep(0.55, 0.9, bar) * smoothstep(-0.25, -0.05, sv.t);
  vec3 bed = mix(${C('#E6DCBC')}, ${C('#7DD2C4')}, smoothstep(0.0, 0.18, dep));
  bed = mix(bed, ${C('#33A9B9')}, smoothstep(0.22, 0.6, dep));
  bed = mix(bed, ${C('#1D6F9F')}, smoothstep(0.6, 1.0, dep));
  float rip = sin(p.x * 3.1 + wn(p, 64.0, 306u) * 6.0 + 4.0 * wfr(p, 16.0, 2, 307u));
  bed *= 1.0 + 0.06 * rip * (1.0 - smoothstep(0.1, 0.5, dep));
  float sgr = smoothstep(0.58, 0.7, wf(p, 20.0, 3, 308u)) * smoothstep(0.12, 0.3, dep) * smoothstep(0.75, 0.5, dep);
  bed = mix(bed, bed * ${C('#5E9A80')}, sgr * 0.8);
  float cor = speck(p, 2.0, 0.5, 0.25, 309u) * smoothstep(0.08, 0.25, dep) * smoothstep(0.5, 0.3, dep);
  bed = mix(bed, ${C('#EDBBA2')}, cor * 0.45);

  // 陆地：湿沙 → 白沙滩 → 海边草地；崖岸是淡色石头
  vec3 sand = mix(${C('#F7F0DE')}, ${C('#E9DDC2')}, wf(p, 64.0, 2, 310u));
  vec3 wetS = ${C('#DACCAA')};
  vec3 dune = grass(p, ${C('#B4D277')}, ${C('#78A458')}, ${C('#D9D69C')});
  vec3 lcol = mix(wetS, sand, smoothstep(0.0, 0.012, lt));
  lcol = mix(lcol, dune, smoothstep(0.03, 0.06, lt));
  vec3 rock = mix(${C('#ECE6D7')}, ${C('#CBC2AF')}, wf(p * vec2(4.0, 1.0), 16.0, 2, 311u));
  float cf = sv.cliff * smoothstep(0.0, 0.004, lt) * smoothstep(0.045, 0.03, lt);
  lcol = mix(lcol, rock, cf);
  lcol = mix(lcol, dune, sv.cliff * smoothstep(0.03, 0.05, lt));

  vec3 col = mix(lcol, bed, wet);
  vec3 sbc = mix(wetS, sand, smoothstep(0.4, 1.0, sbE));
  col = mix(col, sbc, sbE);

  // 树：岛心的松林和阔叶林，海边几棵歪脖子松
  float land = 1.0 - sea;
  float tree = smoothstep(0.06, 0.14, lt) * smoothstep(0.35, 0.55, wf(p, 12.0, 3, 312u) + 0.3 * smoothstep(0.1, 0.25, lt));
  float vil = smoothstep(0.035, 0.06, lt) * smoothstep(0.5, 0.36, sv.hill) * (1.0 - 0.8 * sv.cliff);
  vil *= smoothstep(0.26, 0.4, wf(p, 10.0, 2, 315u));
  tree *= land * (1.0 - cf) * (1.0 - 0.75 * smoothstep(0.2, 0.5, vil));
  g.tree = tree;
  g.alt = step(0.55, wf(p, 8.0, 2, 314u)) * step(0.12, lt);
  col = mix(col, mix(${C('#5B8446')}, ${C('#4F8A3E')}, g.alt), smoothstep(0.3, 0.9, tree) * 0.7);

  float meadow = land * smoothstep(0.03, 0.06, lt) * (1.0 - cf) * (1.0 - smoothstep(0.2, 0.45, tree));
  float coastP = smoothstep(0.03, 0.05, lt) * smoothstep(0.14, 0.07, lt) * smoothstep(0.45, 0.65, wf(p, 32.0, 2, 313u));
  g.lone = clamp(meadow * (0.4 + coastP), 0.0, 1.0);
  g.flower = meadow * smoothstep(0.5, 0.7, wf(p, 12.0, 3, 316u)) * 0.6;
  g.wind = meadow * 0.8;
  g.village = vil * land;

  g.h = mix(max(sv.h, sbE * 0.18), 0.0, wet);
  g.alb = col;
  g.water = wet;
  g.depth = dep * wet;
  float sbShore = smoothstep(0.78, 0.86, bar) * smoothstep(-0.2, -0.08, sv.t) * 0.5;
  g.shore = max(smoothstep(-0.035, 0.0, sv.t) * 0.7, sbShore) * wet;
  g.ao = 1.0 - 0.12 * smoothstep(0.4, 1.0, tree);
  g.cls = wet > 0.5 ? CL_WATER : cf > 0.5 ? CL_ROCK : (sbE > 0.5 || (lt < 0.03 && sv.cliff < 0.5)) ? CL_SAND
        : tree > 0.5 ? CL_FOREST : CL_MEADOW;
  return g;
}
`;
