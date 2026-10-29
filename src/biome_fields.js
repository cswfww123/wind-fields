// 蓝金田野：龙猫式的夏日里山。谷底一格一格的水田（大多是绿油油的稻子，几块刚灌水的田映着天），
// 坡脚的梯田、几块金黄的麦田和向日葵、石砌的水渠、柏油路和电线杆、路边山侧的人家、
// 田中央的镇守之森、山坡上的杂木林和杉树林。
import { C } from './config.js';

export const fieldsCurves = [
  { c: 0, t: [[1, 10, 0.7], [3, 4, 2.3]] },                  // 0 谷轴
  { c: -2, t: [[1, 10, 0.7], [3, 4, 2.3], [7, 1.6, 4.4]] },  // 1 水渠
  { c: 20, t: [[1, 10, 0.7], [3, 3, 2.0], [5, 1.5, 0.9]] },  // 2 柏油路
  { c: -18, t: [[1, 10, 0.7], [2, 4, 5.1], [5, 1.2, 3.3]] }, // 3 田间土路
];

export const fieldsGLSL = /* glsl */ `
struct FV { float sd; float dv; float floorH; float rise; float h; };

// 谷底平、两侧慢慢抬成山
FV valleyAt(vec2 p) {
  FV v;
  vec3 ax = cDist(0, warp2(p, 5.0, 4.0, 141u));
  v.sd = ax.x;
  v.dv = abs(ax.x);
  float W = 21.0 + 5.0 * wf(p, 6.0, 2, 142u);
  v.floorH = 0.9 + 0.35 * wf(p, 16.0, 2, 143u);
  float e = max(v.dv - W, 0.0);
  float hills = wf(p, 6.0, 4, 144u);
  float rise = e * e * 0.008 + e * (0.06 + 0.16 * hills) + smoothstep(8.0, 40.0, e) * (4.0 + 10.0 * hills * hills);
  v.rise = rise / (1.0 + rise / 45.0);
  v.h = v.floorH + v.rise;
  return v;
}

Ground biome(vec2 p) {
  Ground g = ground0();
  FV v = valleyAt(p);
  float h = v.h;
  vec3 col = grass(p, ${C('#A8D160')}, ${C('#5E9C46')}, ${C('#C9C77A')});
  col = mix(col, col * vec3(0.86, 0.92, 0.88), smoothstep(4.0, 16.0, v.rise) * 0.5);

  // 线状地物
  vec3 cn = cDist(1, warp2(p, 16.0, 0.6, 145u));
  float dCan = abs(cn.x);
  float canW = 0.85 + 0.25 * wf(p, 32.0, 2, 146u);
  vec3 rd = cDist(2, p);
  float dRoad = abs(rd.x);
  vec3 ln = cDist(3, p);
  float dLane = abs(ln.x);

  // 人家：柏油路的山侧一溜，土路外侧一个小村子
  float vRoad = smoothstep(2.8, 4.2, rd.x) * smoothstep(16.0, 9.0, rd.x) * smoothstep(0.42, 0.56, wf(p, 8.0, 3, 147u));
  float vLane = smoothstep(2.2, 3.2, -ln.x) * smoothstep(12.0, 7.0, -ln.x) * smoothstep(0.5, 0.62, wf(p, 8.0, 3, 148u));
  // 田中间零星的农家：一块院坪 + 一棵大树
  vec4 fs = cellNear(p, 32.0, 170u);
  float farm = step(fs.y, 0.45) * smoothstep(6.5, 4.5, fs.x + 0.8 * wn(p, 64.0, 171u)) * smoothstep(4.0, 1.0, v.rise);
  float vil = max(max(vRoad, vLane * 0.85), farm);

  // 镇守之森：田中间一团团浓密的老树
  vec4 sg = cellNear(p, 32.0, 149u);
  float gR = 5.0 + 3.0 * sg.z;
  float grove = step(sg.y, 0.32) * smoothstep(gR, gR - 2.0, sg.x + 1.2 * wn(p, 64.0, 150u));
  grove *= smoothstep(5.0, 2.5, v.rise) * smoothstep(canW + 1.5, canW + 3.0, dCan) * smoothstep(3.5, 5.0, dRoad) * smoothstep(2.2, 3.4, dLane);

  // 田块：每块田的高度取田块中心，坡上自然成梯田
  vec2 fc;
  vec4 fg = fieldGrid(p, 8.0, 10.0, 151u, fc);
  FV vc = valleyAt(fc);
  float cut = smoothstep(canW + 1.0, canW + 1.6, dCan) * smoothstep(3.2, 3.9, dRoad) * smoothstep(2.0, 2.6, dLane);
  float paddy = step(vc.rise, 1.8) * cut * (1.0 - smoothstep(0.15, 0.4, grove)) * (1.0 - smoothstep(0.05, 0.2, vil));
  float lev = smoothstep(0.45, 0.15, fg.x);
  float pv = fract(fg.y * 13.7 + fg.z * 5.3);
  int kind = 0;
  if (fg.y < smoothstep(0.55, 0.75, wf(fc, 8.0, 2, 152u)) * 0.75) kind = 1;
  else if (fg.z < smoothstep(0.5, 0.7, wf(fc, 6.0, 2, 153u)) * 0.8) kind = 2;
  else if (fg.y > 0.93) kind = 3;
  else if (fg.y > 0.895) kind = 4;
  else if (fg.z > 0.94) kind = 5;
  if (vc.rise > 0.8 && kind == 2) kind = 0;

  vec2 lp = p - fc;
  float u = mix(lp.x, lp.y, step(0.5, fract(fg.z * 7.0)));
  float rows = smoothstep(0.35, 0.65, abs(fract(u / 0.9) - 0.5) * 2.0);

  vec3 rice = mix(${C('#5FA83A')}, ${C('#A2D458')}, 0.35 + 0.5 * pv);
  rice = mix(rice, rice * 0.8, rows * 0.5) * (0.95 + 0.1 * wf(p, 128.0, 2, 155u));
  vec3 sky = mix(${C('#BFDDEA')}, ${C('#93C2DA')}, wf(p, 24.0, 2, 156u));
  vec3 flood = mix(sky, ${C('#7DB07A')}, rows * 0.45 + 0.1);
  vec3 barley = mix(${C('#E0C25A')}, ${C('#F0D97A')}, wf(p, 64.0, 2, 157u));
  barley = mix(barley, barley * 0.88, rows * 0.35);
  float vr = smoothstep(0.3, 0.6, abs(fract(u / 1.2) - 0.5) * 2.0);
  vec3 veg = mix(${C('#A27B54')}, mix(${C('#3F8A3C')}, ${C('#7EB04A')}, step(0.6, pv)), vr);
  float sf = speck(p, 0.5, 0.21, 0.92, 158u);
  vec3 sunf = mix(${C('#5C8E35')}, ${C('#F6CC2E')}, sf);
  vec3 fallow = grass(p + 37.0, ${C('#B5D46A')}, ${C('#7FB052')}, ${C('#D6CF86')});
  vec3 crop = rice;
  if (kind == 1) crop = flood;
  else if (kind == 2) crop = barley;
  else if (kind == 3) crop = veg;
  else if (kind == 4) crop = sunf;
  else if (kind == 5) crop = fallow;
  crop = mix(crop, ${C('#9BC75A')}, lev);
  col = mix(col, crop, paddy);
  float wet = kind == 1 ? 1.0 : 0.0;
  h = mix(h, vc.h - 0.08 * wet + lev * 0.12, paddy);
  float pw = paddy * wet * (1.0 - lev);

  // 路和小村子的地坪
  vec2 rc = vec2(cX(2, rd.y), rd.y);
  float hRoad = valleyAt(rc).h + 0.15;
  vec2 lc = vec2(cX(3, ln.y), ln.y);
  float hLane = valleyAt(lc).h + 0.22;
  h = mix(h, hRoad + 0.25, vRoad * 0.85 * smoothstep(3.0, 5.0, dRoad));
  h = mix(h, hRoad, smoothstep(5.5, 2.6, dRoad));
  h = mix(h, hLane, smoothstep(2.6, 1.4, dLane));

  float onRoad = smoothstep(2.4, 2.0, dRoad + 0.06 * wn(p, 256.0, 160u));
  vec3 asph = mix(${C('#A3A29A')}, ${C('#94948D')}, wf(p, 64.0, 2, 161u));
  asph = mix(asph, ${C('#B4B2A8')}, smoothstep(0.62, 0.8, wf(p, 32.0, 3, 162u)) * 0.5);
  asph = mix(asph, ${C('#EEECE3')}, smoothstep(0.13, 0.0, abs(dRoad - 1.85)) * 0.85);
  col = mix(col, ${C('#CFC6A0')}, smoothstep(3.2, 2.5, dRoad) * (1.0 - onRoad) * 0.7);
  col = mix(col, asph, onRoad);
  float onLane = smoothstep(1.7, 1.25, dLane + 0.15 * wn(p, 128.0, 163u));
  vec3 lane = mix(${C('#D8C79A')}, ${C('#C7B385')}, wf(p, 64.0, 2, 164u));
  lane = mix(lane, ${C('#9CC25E')}, smoothstep(0.35, 0.1, dLane) * 0.7);
  col = mix(col, lane, onLane);

  // 水渠：石砌的窄渠，水是青绿的
  float canalBank = smoothstep(canW + 0.45, canW + 0.05, dCan);
  float canalWet = smoothstep(canW + 0.05, canW - 0.15, dCan);
  h = mix(h, v.floorH - 0.55, canalBank);
  col = mix(col, mix(${C('#BDB8A8')}, ${C('#9C9A8E')}, wf(p, 128.0, 2, 159u)), canalBank);
  col = mix(col, mix(${C('#62A893')}, ${C('#3F8C83')}, smoothstep(0.0, canW, canW - dCan)), canalWet);
  float bz = cn.y - 32.0 * floor(cn.y / 32.0 + 0.5);
  float br = smoothstep(1.0, 0.75, abs(bz)) * smoothstep(canW + 0.9, canW + 0.5, dCan);
  h = mix(h, v.floorH + 0.05, br);
  col = mix(col, ${C('#CBC6B6')}, br);
  canalWet *= 1.0 - br;
  canalBank *= 1.0 - br;

  // 树：山坡杂木林 + 杉树林 + 镇守之森 + 人家旁的几棵
  float hillF = smoothstep(1.2, 4.5, v.rise) * smoothstep(0.22, 0.42, wf(p, 10.0, 3, 165u) + 0.2 * smoothstep(6.0, 16.0, v.rise));
  float copse = smoothstep(0.66, 0.8, wf(p, 14.0, 3, 166u)) * smoothstep(1.0, 3.0, v.rise);
  float vilT = vil * smoothstep(0.5, 0.75, wf(p, 32.0, 2, 167u)) * 0.6;
  float groveT = grove * smoothstep(0.9, 1.7, sg.x);
  float tree = max(max(hillF, copse), max(groveT, vilT));
  tree *= (1.0 - paddy) * smoothstep(3.2, 4.2, dRoad) * smoothstep(1.8, 2.6, dLane) * smoothstep(canW + 0.8, canW + 1.6, dCan);
  g.tree = tree;
  g.conifer = max(smoothstep(0.55, 0.68, wf(p, 9.0, 3, 168u)) * smoothstep(3.0, 8.0, v.rise) * (1.0 - grove), grove * 0.3);
  col = mix(col, ${C('#4E7F3C')}, smoothstep(0.3, 0.9, tree) * 0.75);
  col = mix(col, ${C('#BFC48E')}, grove * smoothstep(1.4, 0.9, sg.x) * 0.7);

  float meadow = (1.0 - paddy) * (1.0 - onRoad) * (1.0 - onLane) * (1.0 - canalBank) * (1.0 - smoothstep(0.2, 0.5, tree));
  g.lone = clamp(meadow * (smoothstep(5.0, 2.5, dLane) * 0.8 + smoothstep(0.0, 0.3, vil) * 0.5 + smoothstep(1.0, 3.0, v.rise) * 0.4) + groveT * 0.9, 0.0, 1.0);
  float fk = kind == 5 ? 0.8 : 0.0;
  g.flower = clamp(meadow * smoothstep(0.5, 0.72, wf(p, 12.0, 3, 169u)) * 0.7 + paddy * ((1.0 - lev) * fk + lev * 0.25), 0.0, 1.0);
  float wk = kind == 1 ? 0.0 : kind == 3 || kind == 4 ? 0.35 : 1.0;
  g.wind = meadow * 0.8 + paddy * (1.0 - lev) * wk;
  g.village = vil * (1.0 - smoothstep(0.3, 0.5, paddy)) * smoothstep(3.6, 4.6, dRoad) * smoothstep(2.4, 3.2, dLane)
            * smoothstep(canW + 2.0, canW + 3.0, dCan) * (1.0 - grove);

  float water = max(canalWet, pw * 0.85);
  g.h = h;
  g.alb = col;
  g.water = water;
  g.depth = max(canalWet * 0.4, pw * 0.9);
  g.shore = canalWet * smoothstep(0.35, 0.0, canW - dCan) * 0.35;
  g.ao = 1.0 - 0.15 * canalBank - 0.1 * smoothstep(0.4, 1.0, tree);
  g.cls = canalWet > 0.5 ? CL_WATER : (onRoad > 0.5 || onLane > 0.5 || br > 0.5) ? CL_ROAD : canalBank > 0.5 ? CL_ROCK
        : paddy > 0.5 ? CL_FIELD : tree > 0.5 ? CL_FOREST : CL_MEADOW;
  return g;
}
`;
