// 摆放：按 GPU 烘出来的密度图在 JS 里撒树、房子、牛羊、帆船，并把院子/菜园/小路画进一张叠加图。
import { LOOP, WORLD_W, wrapNear } from './config.js';
import { CL } from './field.js';
import { curveDist } from './curves.js';

const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function freeLand(f, x, z) {
  const c = f.cls(x, z);
  return c !== CL.WATER && c !== CL.ROAD && c !== CL.ROCK && f.water(x, z) < 0.04;
}

export function placeHouses(f, cfg, rnd) {
  const H = cfg.houses;
  const out = [];
  if (!H) return out;
  const cell = H.cell ?? 8;
  for (let z = -LOOP / 2; z < LOOP / 2; z += cell) {
    for (let x = -WORLD_W / 2 + 8; x < WORLD_W / 2 - 8; x += cell) {
      const px = x + (rnd() - 0.5) * cell * 0.6;
      const pz = wrapNear(z + (rnd() - 0.5) * cell * 0.6, 0);
      if (rnd() > f.village(px, pz) * 1.5) continue;
      const w = 3.0 + rnd() * 2.0;
      const d = 2.3 + rnd() * 1.2;
      const r = Math.max(w, d) * 0.6 + 1.2;
      let okk = f.slope(px, pz) < 0.32;
      for (let a = 0; a < 6 && okk; a++) {
        const ax = px + Math.cos(a) * r, az = pz + Math.sin(a) * r;
        const ac = f.cls(ax, az);
        okk = freeLand(f, ax, az) && ac !== CL.FIELD && ac !== CL.ORCHARD;
      }
      if (!okk || out.some((o) => Math.hypot(o.x - px, wrapNear(o.z, pz) - pz) < r + o.r + 1.5)) continue;
      // 屋脊顺着最近的路
      let rot = rnd() * Math.PI;
      let best = Infinity;
      for (const ci of H.roads ?? []) {
        const cd = curveDist(cfg.curves[ci], px, pz);
        if (Math.abs(cd.d) < best) {
          best = Math.abs(cd.d);
          const l = Math.hypot(cd.slope, 1);
          rot = Math.atan2(-1 / l, cd.slope / l) + (rnd() < 0.3 ? Math.PI / 2 : 0);
        }
      }
      rot += (rnd() - 0.5) * 0.14;
      let y = Infinity;
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        y = Math.min(y, f.height(px + sx * w * 0.5, pz + sz * d * 0.5));
      }
      out.push({
        x: px, z: pz, y: y - 0.1, w, d, r, rot,
        h: 1.7 + rnd() * 0.7,
        wall: H.walls[(rnd() * H.walls.length) | 0],
        roof: H.roofs[(rnd() * H.roofs.length) | 0],
        garden: rnd() < 0.55,
      });
    }
  }
  return out;
}

export function placeTrees(f, cfg, rnd, houses) {
  const F = cfg.flora;
  const out = [];
  const nearHouse = (x, z, pad) => houses.some((o) => Math.hypot(o.x - x, wrapNear(o.z, z) - z) < o.r + pad);
  const add = (x, z, v, s, sy, pal = F.pal[v]) => out.push({
    x, z, y: f.height(x, z) - 0.15, v, s, sy, rot: rnd() * Math.PI * 2,
    pal, b: 0.9 + rnd() * 0.2, hue: rnd() * 2 - 1, ph: rnd(),
  });
  const CON = F.conifer ?? { s: [0.95, 1.4], sy: [1.0, 1.2] };
  const lerp = (r) => r[0] + rnd() * (r[1] - r[0]);
  const c = F.cell ?? 2.5;
  for (let z = -LOOP / 2; z < LOOP / 2; z += c) {
    for (let x = -WORLD_W / 2 + 1; x < WORLD_W / 2 - 1; x += c) {
      const px = x + (rnd() - 0.5) * c * 0.95;
      const pz = wrapNear(z + (rnd() - 0.5) * c * 0.95, 0);
      const d = f.tree(px, pz);
      const pr = ss(0.3, 0.75, d) * 0.92;
      const edge = ss(0.08, 0.3, d) * (1 - ss(0.35, 0.6, d)) * (F.edgeBush ?? 0.3);
      const roll = rnd();
      if (roll > pr && roll > pr + edge) continue;
      if (!freeLand(f, px, pz) || nearHouse(px, pz, 1.5)) continue;
      if (roll > pr) { add(px, pz, 4, F.bush[0] + rnd() * (F.bush[1] - F.bush[0]), 1); continue; }
      const con = rnd() < f.conifer(px, pz);
      const A = F.alt && f.alt(px, pz) ? F.alt : null;
      if (con) add(px, pz, 2, lerp(CON.s), lerp(CON.sy));
      else if (A) add(px, pz, A.v, lerp(A.s), lerp(A.sy ?? [0.85, 1.15]), A.pal);
      else add(px, pz, F.forestV, F.forest[0] + rnd() * (F.forest[1] - F.forest[0]), 0.85 + rnd() * 0.3);
    }
  }
  const lc = F.loneCell ?? 9;
  for (let z = -LOOP / 2; z < LOOP / 2; z += lc) {
    for (let x = -WORLD_W / 2 + 4; x < WORLD_W / 2 - 4; x += lc) {
      const px = x + (rnd() - 0.5) * lc * 0.8;
      const pz = wrapNear(z + (rnd() - 0.5) * lc * 0.8, 0);
      if (rnd() > f.lone(px, pz) * (F.loneP ?? 0.1)) continue;
      if (!freeLand(f, px, pz) || nearHouse(px, pz, 2.5)) continue;
      add(px, pz, F.loneV, F.lone[0] + rnd() * (F.lone[1] - F.lone[0]), 0.9 + rnd() * 0.2);
    }
  }
  // 果园：规整的行列（橄榄树），格距整除 LOOP
  const O = F.orchard;
  if (O) {
    const oc = O.cell;
    for (let z = -LOOP / 2; z < LOOP / 2; z += oc) {
      for (let x = -WORLD_W / 2 + 1; x < WORLD_W / 2 - 1; x += oc) {
        if (f.cls(x, z) !== CL.ORCHARD || f.cls(x + oc * 0.5, z) !== CL.ORCHARD || nearHouse(x, z, 1.2)) continue;
        add(x + (rnd() - 0.5) * 0.25, z + (rnd() - 0.5) * 0.25, O.v, lerp(O.s), lerp(O.sy), O.pal);
      }
    }
  }

  // 房前屋后的树
  for (const o of houses) {
    if (rnd() > (F.yardTree ?? 0.6)) continue;
    const a = rnd() * Math.PI * 2;
    const px = o.x + Math.cos(a) * (o.r + 1.8), pz = wrapNear(o.z + Math.sin(a) * (o.r + 1.8), 0);
    if (freeLand(f, px, pz)) add(px, pz, F.forestV, F.forest[0] + rnd() * 0.3, 1);
  }
  return out;
}

export function placeAnimals(f, cfg, rnd) {
  const A = cfg.animals;
  const out = [];
  if (!A) return out;
  let tries = 0;
  while (out.length < A.herds && tries++ < 400) {
    const x = (rnd() - 0.5) * (WORLD_W - 40);
    const z = (rnd() - 0.5) * LOOP;
    if (f.lone(x, z) < 0.7 || f.slope(x, z) > 0.25 || f.cls(x, z) !== CL.MEADOW) continue;
    out.push({ x, z, kind: rnd() < A.cowShare ? 'cow' : 'sheep', n: 3 + ((rnd() * 4) | 0) });
  }
  return out;
}

export function placeBoats(f, cfg, rnd) {
  const out = [];
  if (!cfg.boats) return out;
  let tries = 0;
  while (out.length < cfg.boats && tries++ < 600) {
    const x = (rnd() - 0.5) * (WORLD_W - 50);
    const z = (rnd() - 0.5) * LOOP;
    let wet = true;
    for (let a = 0; a < 8 && wet; a++) wet = f.water(x + Math.cos(a) * 6, z + Math.sin(a) * 6) > 0.95;
    if (wet) out.push({ x, z, rot: rnd() * Math.PI * 2, speed: 0.5 + rnd() * 0.6 });
  }
  return out;
}

export { ss };
