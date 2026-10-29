// 赤土荒野：风之谷 / 地中海的干燥夏天。一级一级的赤土台地（崖面露出岩层），台上是金黄的干草和伞松，
// 谷底一条白沙干河床，只剩一线细水和几汪水潭，两岸一溜河柳；河边是橄榄园、葡萄园、麦茬地，
// 红土路一侧排着柏树，路外是石墙赤陶瓦的农舍。
import { C } from './config.js';

export const desertCurves = [
  { c: 0, t: [[1, 12, 2.0], [3, 4, 0.6], [6, 1.5, 3.9]] },   // 0 干河床
  { c: 15, t: [[1, 12, 2.0], [3, 4, 0.6], [2, 2.5, 4.4], [5, 1.2, 1.2]] },  // 1 红土路
  { c: -15, t: [[1, 12, 2.0], [3, 4, 0.6], [5, 1.2, 1.0]] },                // 2 农用小道
];

export const desertGLSL = /* glsl */ `
struct DV { float sd; float dw; float vf; float h; float face; float cap; float fr; };

// 谷底平缓，往外按 4 个单位一级抬成台地：踏面平，立面陡
DV duneAt(vec2 p) {
  DV d;
  vec3 ax = cDist(0, warp2(p, 6.0, 3.0, 201u));
  d.sd = ax.x;
  d.dw = abs(ax.x);
  d.vf = smoothstep(18.0, 44.0, d.dw);
  float mh = wf(p, 4.0, 4, 203u);
  float hr = 0.6 + 0.8 * wf(p, 12.0, 2, 202u) + d.vf * (1.0 + 4.0 * mh) + d.vf * d.vf * (2.0 + 14.0 * mh)
           + 5.0 * smoothstep(0.15, 0.55, d.vf) * wf(p, 10.0, 3, 204u);
  float S = 4.0;
  float lv = max(hr - 1.5, 0.0) / S;
  float fr = fract(lv);
  float ht = 1.5 + (floor(lv) + smoothstep(0.66, 1.0, fr)) * S;
  float tm = smoothstep(0.2, 0.45, d.vf);
  d.h = mix(hr, ht, tm);
  d.face = smoothstep(0.62, 0.72, fr) * smoothstep(1.0, 0.94, fr) * tm * step(1.5, hr);
  d.cap = smoothstep(0.92, 0.99, fr) * tm;
  d.fr = fr;
  return d;
}

Ground biome(vec2 p) {
  Ground g = ground0();
  DV d = duneAt(p);
  float h = d.h;

  // 台地踏面：金黄干草 + 露出的赤土
  vec3 col = grass(p, ${C('#E8CF88')}, ${C('#BFA05A')}, ${C('#F2E2B4')});
  col = mix(col, ${C('#9DA35A')}, smoothstep(14.0, 4.0, d.dw) * 0.5);
  col = mix(col, ${C('#CD8A58')}, smoothstep(0.64, 0.84, wf(p, 20.0, 3, 205u)) * 0.45);
  // 立面：岩层条带
  float band = fract(h / 1.3 + 0.35 * wn(p, 32.0, 206u));
  vec3 strata = mix(${C('#B5583A')}, ${C('#D98A5A')}, smoothstep(0.2, 0.5, band));
  strata = mix(strata, ${C('#E8BE8A')}, smoothstep(0.7, 0.85, band) * smoothstep(1.0, 0.9, band));
  strata *= 0.92 + 0.12 * wf(p * vec2(4.0, 1.0), 16.0, 2, 207u);
  col = mix(col, strata, d.face);
  col = mix(col, ${C('#EBD8B0')}, d.cap * 0.65);

  // 干河床：白沙 + 辫状浅沟，中间一线细水、几汪水潭
  float bedW = 3.5 + 2.0 * wf(p, 12.0, 2, 208u);
  float bed = smoothstep(bedW + 0.6, bedW - 0.3, d.dw);
  float bank = smoothstep(bedW + 5.0, bedW + 0.8, d.dw);
  float braid = wf(p * vec2(4.0, 1.0), 32.0, 3, 209u);
  h = mix(h, 0.18 + 0.12 * braid, bed);
  float tdist = abs(d.sd - 1.4 * wfr(p, 8.0, 2, 210u) * bedW);
  vec4 pc = cellNear(p, 16.0, 211u);
  float pool = step(pc.y, 0.55) * smoothstep(2.6 + 1.4 * pc.z, 1.4, pc.x + 0.6 * wn(p, 64.0, 212u));
  float wet = max(smoothstep(0.75, 0.35, tdist + 0.25 * wn(p, 128.0, 213u)), pool * smoothstep(bedW, bedW - 1.0, d.dw)) * bed;
  h = mix(h, 0.0, wet);
  vec3 sand = mix(${C('#F1E6CC')}, ${C('#DCCBA6')}, braid);
  sand = mix(sand, ${C('#FBF6E8')}, speck(p, 0.5, 0.18, 0.4, 214u) * 0.6);
  sand = mix(sand, ${C('#CDB78F')}, smoothstep(1.6, 0.6, tdist) * 0.5);
  col = mix(col, ${C('#B8B26A')}, bank * (1.0 - bed) * 0.65);
  col = mix(col, sand, bed);
  vec3 wcol = mix(${C('#A7CDB4')}, ${C('#4FA79E')}, smoothstep(0.0, 0.8, wet));
  col = mix(col, wcol, wet);

  // 红土路（只在近处压平）+ 农用小道
  vec3 rd = cDist(1, p);
  float dRoad = abs(rd.x);
  vec3 tk = cDist(2, p);
  float dTrack = abs(tk.x);
  vec2 rc = vec2(cX(1, rd.y), rd.y);
  h = mix(h, duneAt(rc).h + 0.1, smoothstep(4.0, 2.0, dRoad));
  float onRoad = smoothstep(2.3, 1.8, dRoad + 0.12 * wn(p, 128.0, 215u));
  vec3 dirt = mix(${C('#C9784C')}, ${C('#B8673F')}, wf(p, 64.0, 2, 216u));
  dirt = mix(dirt, ${C('#DE9A6A')}, smoothstep(0.35, 0.0, abs(dRoad - 0.8)) * 0.6);
  col = mix(col, dirt, onRoad);
  float onTrack = smoothstep(1.3, 0.95, dTrack + 0.15 * wn(p, 128.0, 217u));
  vec3 trk = mix(${C('#E0C191')}, ${C('#D0AA7A')}, wf(p, 64.0, 2, 218u));
  trk = mix(trk, ${C('#BFA25E')}, smoothstep(0.3, 0.05, dTrack) * 0.6);
  col = mix(col, trk, onTrack);

  // 人家：路的外侧（远离河床那一侧）+ 河边田里的独户
  float vR = smoothstep(2.8, 4.0, rd.x) * smoothstep(15.0, 11.0, rd.x) * smoothstep(0.4, 0.54, wf(p, 8.0, 3, 219u));
  float vT = smoothstep(2.2, 3.2, -tk.x) * smoothstep(13.0, 9.0, -tk.x) * smoothstep(0.5, 0.64, wf(p, 8.0, 3, 220u));
  vec4 fs = cellNear(p, 32.0, 221u);
  float stead = step(fs.y, 0.6) * smoothstep(9.5, 7.5, fs.x + 0.7 * wn(p, 64.0, 222u)) * smoothstep(0.3, 0.1, d.vf);
  float vil = max(max(vR, vT * 0.85), stead) * (1.0 - smoothstep(0.1, 0.4, d.face));

  // 柏树：路靠河那一侧排成一溜，一段一段
  float cyp = smoothstep(2.6, 3.0, -rd.x) * smoothstep(4.4, 3.8, -rd.x) * smoothstep(0.42, 0.55, wf(p, 10.0, 2, 223u));

  // 河边田：麦茬、橄榄园、葡萄园、苜蓿、翻过的红土、虞美人
  vec2 fc;
  vec4 fg = fieldGrid(p, 8.0, 9.0, 224u, fc);
  float zone = smoothstep(bedW + 3.5, bedW + 5.0, d.dw) * smoothstep(0.32, 0.18, d.vf);
  float plot = zone * smoothstep(2.6, 3.4, dRoad) * smoothstep(1.7, 2.3, dTrack) * step(0.18, fract(fg.y * 7.3));
  plot *= (1.0 - smoothstep(0.1, 0.3, vil)) * (1.0 - smoothstep(0.1, 0.4, cyp));
  float reg = wf(fc, 6.0, 2, 225u);
  int kind = 0;
  float og = 0.3 + 0.4 * smoothstep(0.4, 0.7, reg);
  if (fg.z < og) kind = 1;
  else if (fg.z < og + 0.14) kind = 2;
  else if (fg.z < og + 0.25) kind = 3;
  else if (fg.z > 0.94) kind = 5;
  else if (fg.z > 0.86) kind = 4;
  vec2 lp = p - fc;
  float u = mix(lp.x, lp.y, step(0.5, fract(fg.y * 5.0)));
  float rows = smoothstep(0.3, 0.6, abs(fract(u / 1.0) - 0.5) * 2.0);
  vec3 stub = mix(${C('#F0DFA6')}, ${C('#E2C47E')}, fg.y);
  stub = mix(stub, stub * 0.82, rows * 0.55);
  vec3 soil = mix(${C('#B86A45')}, ${C('#A85E3C')}, wf(p, 64.0, 2, 226u));
  vec3 olive = mix(soil, ${C('#D8C08A')}, 0.6 + 0.2 * wn(p, 64.0, 227u));
  float vr = smoothstep(0.35, 0.65, abs(fract(u / 1.4) - 0.5) * 2.0);
  vec3 vine = mix(soil, ${C('#6E8A3A')}, vr);
  vec3 alfa = mix(${C('#8DB04E')}, ${C('#A9C460')}, wf(p, 64.0, 2, 228u));
  alfa = mix(alfa, alfa * 0.88, rows * 0.4);
  vec3 plow = mix(soil, soil * 0.82, rows);
  vec3 pop = grass(p + 51.0, ${C('#E3C878')}, ${C('#BFA25A')}, ${C('#EAD9A2')});
  vec3 crop = stub;
  if (kind == 1) crop = olive;
  else if (kind == 2) crop = vine;
  else if (kind == 3) crop = alfa;
  else if (kind == 4) crop = plow;
  else if (kind == 5) crop = pop;
  float wall = smoothstep(0.4, 0.15, fg.x);
  crop = mix(crop, ${C('#E2D6BC')}, wall * 0.8);
  col = mix(col, crop, plot);
  h += plot * wall * 0.12;

  // 低处几级台地上的橄榄梯田
  float tOl = smoothstep(0.17, 0.25, d.vf) * smoothstep(0.58, 0.45, d.vf) * smoothstep(0.48, 0.6, wf(p, 10.0, 3, 234u));
  tOl *= (1.0 - smoothstep(0.05, 0.25, d.face)) * (1.0 - smoothstep(0.1, 0.4, d.cap)) * (1.0 - smoothstep(0.1, 0.3, vil));
  tOl *= smoothstep(3.0, 4.0, dRoad) * smoothstep(2.0, 2.8, dTrack) * (1.0 - plot);
  col = mix(col, mix(col, ${C('#C99A66')}, 0.45), tOl);

  // 树：台上伞松林、坡上灌丛、河柳、柏树、农舍旁的松
  float pine = smoothstep(0.2, 0.45, d.vf) * smoothstep(0.5, 0.64, wf(p, 8.0, 3, 229u)) * (1.0 - d.face);
  float scrub = smoothstep(0.15, 0.35, d.vf) * smoothstep(0.42, 0.6, wf(p, 20.0, 3, 230u)) * 0.36;
  float rip = smoothstep(bedW + 3.5, bedW + 1.2, d.dw) * smoothstep(bedW - 0.2, bedW + 0.8, d.dw) * smoothstep(0.3, 0.5, wf(p, 24.0, 2, 231u));
  float vtree = vil * smoothstep(0.5, 0.72, wf(p, 32.0, 2, 232u)) * 0.6;
  float tree = max(max(pine, scrub), max(max(rip, cyp), vtree));
  tree *= (1.0 - plot) * (1.0 - smoothstep(0.2, 0.5, tOl)) * (1.0 - bed) * smoothstep(2.4, 3.0, dRoad) * smoothstep(1.6, 2.2, dTrack) * (1.0 - smoothstep(0.3, 0.6, d.face));
  g.tree = tree;
  g.conifer = max(cyp, vtree * 0.5);
  g.alt = step(max(pine, cyp) + 0.01, rip);
  col = mix(col, mix(${C('#8E8A4A')}, ${C('#7C9046')}, g.alt), smoothstep(0.35, 0.9, tree) * 0.6);

  float meadow = (1.0 - plot) * (1.0 - tOl) * (1.0 - bank) * (1.0 - onRoad) * (1.0 - onTrack) * (1.0 - d.face) * (1.0 - smoothstep(0.2, 0.45, tree));
  g.lone = meadow * smoothstep(0.1, 0.4, d.vf);
  float fk = kind == 5 ? 0.9 : kind == 0 ? 0.08 : 0.0;
  g.flower = clamp(meadow * smoothstep(0.55, 0.75, wf(p, 10.0, 3, 233u)) * 0.6 + plot * (1.0 - wall) * fk, 0.0, 1.0);
  float wk = kind == 0 || kind == 5 ? 0.9 : kind == 3 ? 0.6 : 0.0;
  g.wind = meadow * 0.9 + plot * (1.0 - wall) * wk;
  g.village = vil * smoothstep(3.6, 4.4, dRoad) * smoothstep(2.4, 3.2, dTrack) * (1.0 - bank);

  g.h = h;
  g.alb = col;
  g.water = wet;
  g.depth = wet * 0.35;
  g.shore = wet * (1.0 - smoothstep(0.0, 0.6, wet)) * 0.4;
  g.ao = 1.0 - 0.12 * smoothstep(0.4, 1.0, tree) - 0.1 * d.face * smoothstep(0.8, 0.66, d.fr);
  g.cls = wet > 0.5 ? CL_WATER : (onRoad > 0.5 || onTrack > 0.5) ? CL_ROAD : bed > 0.5 ? CL_SAND : d.face > 0.5 ? CL_ROCK
        : ((plot > 0.5 && kind == 1 && wall < 0.5) || tOl > 0.5) ? CL_ORCHARD : plot > 0.5 ? CL_FIELD : tree > 0.5 ? CL_FOREST : CL_MEADOW;
  return g;
}
`;
