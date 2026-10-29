// 草原河流：夏天的河谷。清得见底的河、内弯处的白砾石滩、河里的大石头、
// 两岸的河畔林、缓坡上的树林、野花草甸、土路和木桥、路边几户人家和菜地。
import { C } from './config.js';

export const riverCurves = [
  { c: 6, t: [[2, 17, 0.4], [5, 5, 1.9], [9, 1.6, 4.2]] },   // 0 河
  { c: -30, t: [[1, 8, 2.2], [3, 4, 0.3], [7, 1.2, 5.1]] },  // 1 土路
  { c: 34, t: [[1, 9, 4.0], [4, 3.5, 1.2]] },                // 2 田间小路
];

export const riverGLSL = /* glsl */ `
struct RV { float dr; float rwe; float gw; float water; float lift; };

RV riverAt(vec2 p) {
  RV r;
  vec3 rv = cDist(0, warp2(p, 6.0, 3.0, 41u));
  float rw = 5.0 + 2.4 * wf(p, 6.0, 2, 42u);
  float curv = cDDX(0, rv.y);
  float inner = step(0.0, rv.x * curv);
  float bar = inner * clamp(abs(curv) * 34.0, 0.0, 5.0) * (0.6 + 0.6 * wf(p, 20.0, 2, 45u));
  r.dr = abs(rv.x);
  r.rwe = rw - bar * 0.6;
  r.gw = 1.0 + bar;
  r.water = smoothstep(r.rwe + 0.35, r.rwe - 0.35, r.dr + 0.8 * wn(p, 128.0, 46u));
  r.lift = smoothstep(rw + 4.0, rw + 46.0, r.dr);
  return r;
}

float landH(vec2 p, RV r) {
  float hills = wf(p, 5.0, 4, 43u);
  float hLand = 0.5 + r.lift * (2.0 + 14.0 * hills * hills) + 1.2 * wf(p, 24.0, 3, 44u);
  float hGrav = 0.14 + 0.1 * wf(p, 64.0, 2, 47u);
  float h = mix(hGrav, hLand, smoothstep(r.rwe + r.gw, r.rwe + r.gw + 3.5, r.dr));
  return mix(h, 0.0, r.water);
}

Ground biome(vec2 p) {
  Ground g = ground0();
  RV r = riverAt(p);
  float h = landH(p, r);
  vec3 col = grass(p, ${C('#A3CC5C')}, ${C('#5F9B48')}, ${C('#CFCB7E')});

  // 砾石滩
  vec3 grav = mix(${C('#DCD3B8')}, ${C('#BBB096')}, wf(p, 96.0, 2, 48u));
  grav = mix(grav, ${C('#F0EBDA')}, speck(p, 0.5, 0.2, 0.5, 49u) * 0.7);
  float gz = 1.0 - smoothstep(r.rwe + r.gw - 0.6, r.rwe + r.gw + 0.8, r.dr);
  col = mix(col, grav, gz);

  // 河床：浅处看得见卵石，深处是青蓝
  float dep = clamp((r.rwe - r.dr) / max(r.rwe, 1.0), 0.0, 1.0);
  vec3 bed = mix(${C('#A9BE8C')}, ${C('#46A6A8')}, smoothstep(0.0, 0.35, dep));
  bed = mix(bed, ${C('#1F7389')}, smoothstep(0.45, 0.95, dep));
  bed *= 1.0 + 0.14 * speck(p, 1.0, 0.36, 0.45, 50u) * (1.0 - dep);
  col = mix(col, bed, r.water);

  // 大石头（只在河边和河里）
  vec4 rk = cellNear(p, 4.0, 51u);
  float rr = 0.5 + 0.9 * rk.z;
  float nearR = 1.0 - smoothstep(r.rwe + r.gw + 1.0, r.rwe + r.gw + 3.0, r.dr);
  float isRock = step(rk.y, mix(0.3, 0.07, r.water)) * nearR;
  float rockM = isRock * smoothstep(rr, rr * 0.78, rk.x);
  float q = clamp(rk.x / rr, 0.0, 1.0);
  h = mix(h, max(h, 0.0) + rr * 0.75 * sqrt(1.0 - q * q), rockM);
  col = mix(col, mix(${C('#B6B4AA')}, ${C('#E4E2D8')}, rk.z), rockM);
  float water = r.water * (1.0 - rockM);
  float ring = isRock * r.water * smoothstep(rr + 0.5, rr, rk.x) * (1.0 - rockM) * 0.5;

  // 土路 + 小路（路面略高于草地，像田埂上的路）
  vec3 rd = cDist(1, p);
  vec3 ln = cDist(2, p);
  float dRoad = abs(rd.x), dLane = abs(ln.x);
  float onRoad = smoothstep(2.9, 2.1, dRoad + 0.3 * wn(p, 128.0, 52u));
  float onLane = smoothstep(1.9, 1.3, dLane + 0.25 * wn(p, 128.0, 55u));
  vec2 rc = vec2(cX(1, rd.y), rd.y);
  vec2 lc = vec2(cX(2, ln.y), ln.y);
  float hRoad = max(landH(rc, riverAt(rc)), 0.9);
  float hLane = max(landH(lc, riverAt(lc)), 0.8);
  h = mix(h, hRoad, smoothstep(5.0, 2.4, dRoad));
  h = mix(h, hLane, smoothstep(3.6, 1.6, dLane));
  vec3 dirt = mix(${C('#DBC491')}, ${C('#C8AA76')}, wf(p, 64.0, 2, 53u));
  vec3 roadCol = mix(dirt, dirt * 0.85, smoothstep(0.35, 0.0, abs(dRoad - 1.1)) * 0.6);
  roadCol = mix(roadCol, ${C('#9DBE5F')}, smoothstep(0.45, 0.1, dRoad) * 0.55);
  vec3 laneCol = mix(${C('#A9C46A')}, dirt, smoothstep(0.32, 0.0, abs(dLane - 0.6)));
  col = mix(col, roadCol, onRoad);
  col = mix(col, laneCol, onLane * (1.0 - onRoad));
  float onPath = max(onRoad, onLane);

  // 木桥：路过河的地方
  float bridge = onPath * smoothstep(0.1, 0.5, r.water);
  h = mix(h, 1.1, bridge);
  vec3 plank = mix(${C('#8E6B4A')}, ${C('#A9845C')}, step(0.5, fract(p.y * 2.0)));
  col = mix(col, plank, bridge);
  water *= 1.0 - bridge;

  // 村落 + 菜地（只在平地，离路不远）
  float flat0 = 1.0 - smoothstep(0.1, 0.5, r.lift);
  float vz = smoothstep(20.0, 7.0, dRoad) * smoothstep(3.2, 5.5, dRoad);
  vz = max(vz, 0.6 * smoothstep(14.0, 5.0, dLane) * smoothstep(2.2, 4.0, dLane));
  g.village = vz * smoothstep(0.58, 0.74, wf(p, 6.0, 3, 54u)) * (1.0 - r.water) * step(r.rwe + r.gw + 4.0, r.dr);
  vec2 fc;
  vec4 fg = fieldGrid(p, 4.0, 5.0, 60u, fc);
  float farm = smoothstep(30.0, 14.0, dRoad) * smoothstep(0.52, 0.6, wf(p, 8.0, 3, 61u)) * flat0;
  farm *= (1.0 - onPath) * step(r.rwe + r.gw + 3.0, r.dr) * (1.0 - g.village);
  vec3 crop = fg.y < 0.35 ? ${C('#4F8A3A')} : fg.y < 0.6 ? ${C('#B58C5C')} : fg.y < 0.8 ? ${C('#7FAE3E')} : ${C('#E3C94E')};
  float rows = step(0.5, fract(fg.z < 0.5 ? p.x : p.y));
  crop = mix(crop, crop * 0.78, rows * 0.7);
  crop = mix(crop, ${C('#A8C46B')}, smoothstep(0.4, 0.2, fg.x));
  col = mix(col, crop, farm);

  // 树
  float forest = smoothstep(0.52, 0.7, wf(p, 6.0, 4, 62u));
  float hillF = smoothstep(0.25, 0.6, r.lift) * smoothstep(0.38, 0.6, wf(p, 4.0, 3, 63u));
  float riparian = smoothstep(r.rwe + r.gw + 6.0, r.rwe + r.gw + 1.5, r.dr) * smoothstep(r.rwe + r.gw + 0.2, r.rwe + r.gw + 1.4, r.dr);
  riparian *= smoothstep(0.32, 0.5, wf(p, 20.0, 3, 64u));
  float tree = max(max(forest * 0.85, hillF), riparian);
  tree *= (1.0 - farm) * smoothstep(3.0, 5.0, dRoad) * smoothstep(2.0, 3.5, dLane) * (1.0 - water);
  g.tree = tree;
  g.conifer = smoothstep(5.0, 13.0, h) * 0.55;
  col = mix(col, ${C('#557F40')}, smoothstep(0.3, 0.9, tree) * 0.8);
  float meadow = (1.0 - farm) * (1.0 - onPath) * (1.0 - gz) * (1.0 - water) * (1.0 - smoothstep(0.2, 0.5, tree));
  g.lone = meadow * (1.0 - g.village);
  g.flower = meadow * smoothstep(0.42, 0.68, wf(p, 12.0, 3, 65u));
  g.wind = meadow + farm * 0.4;

  g.h = h;
  g.alb = col;
  g.water = water;
  g.depth = dep * water;
  g.shore = max(water * smoothstep(1.1, 0.0, r.rwe - r.dr) * 0.55, ring);
  g.cls = water > 0.5 ? CL_WATER : onPath > 0.5 ? CL_ROAD : rockM > 0.5 ? CL_ROCK : gz > 0.5 ? CL_SAND
        : farm > 0.5 ? CL_FIELD : tree > 0.5 ? CL_FOREST : CL_MEADOW;
  return g;
}
`;
