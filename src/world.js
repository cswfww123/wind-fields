// 一个场景的全部内容：烘焙地形 → 按密度图摆放 → 画院子 → 上色/油画化 → 建网格、树、房子、车、牛羊、船、云。
import * as THREE from 'three';
import { mulberry32 } from './config.js';
import { shared } from './shading.js';
import { Terrain } from './terrain.js';
import { Forest } from './flora.js';
import { Houses, Traffic, Herds, Boats, Poles, propMaterial } from './props.js';
import { placeHouses, placeTrees, placeAnimals, placeBoats } from './placement.js';
import { drawOverlay } from './overlay.js';
import { Clouds } from './clouds.js';
import { FlatClouds } from './clouds_flat.js';

export class World {
  constructor(cfg, baker) {
    const t0 = performance.now();
    this.cfg = cfg;
    this.group = new THREE.Group();
    const rnd = mulberry32(cfg.seed * 977 + 13);

    const field = baker.begin(cfg);
    this.field = field;
    const houses = placeHouses(field, cfg, rnd);
    const trees = placeTrees(field, cfg, rnd, houses);
    const herds = placeAnimals(field, cfg, rnd);
    const boats = placeBoats(field, cfg, rnd);
    const tex = baker.finish(cfg, drawOverlay(houses, cfg, rnd));

    this.terrain = new Terrain(tex);
    this.terrain.mat.uniforms.uSkyRefl.value.set(cfg.water?.sky ?? '#e8f4f6');
    this.terrain.mat.uniforms.uGustCol.value.set(cfg.gust ?? '#e9efc4');
    this.forest = new Forest(trees, cfg.flora.palettes);
    this.pmat = propMaterial();
    this.houses = new Houses(houses, this.pmat);
    this.traffic = new Traffic(cfg, this.pmat, field);
    this.herds = new Herds(herds, this.pmat, field, rnd);
    this.boats = new Boats(boats, this.pmat, field);
    this.poles = new Poles(cfg, this.pmat, field);
    this.clouds = (cfg.clouds.style ?? 'puff') === 'flat' ? new FlatClouds(cfg, rnd) : new Clouds(cfg, rnd);
    this.group.add(this.terrain.mesh, this.forest.group, this.houses.group, this.traffic.group,
      this.herds.group, this.boats.group, this.poles.group, this.clouds.mesh);

    shared.uFogCol.value.set(cfg.fog.color);
    shared.uFogNear.value = cfg.fog.near;
    shared.uFogFar.value = cfg.fog.far;
    shared.uFogMax.value = cfg.fog.max;
    this.stats = {
      trees: trees.length, houses: houses.length, animals: herds.reduce((a, h) => a + h.n, 0),
      boats: boats.length, ms: Math.round(performance.now() - t0),
    };
  }

  update(dt, time, rig) {
    const ref = rig.fz;
    this.terrain.follow(rig.fx, rig.fz);
    this.forest.place(ref);
    this.houses.place(ref);
    this.traffic.update(dt, ref);
    this.herds.update(time, ref);
    this.boats.update(dt, ref);
    this.poles.update(ref);
    this.clouds.update(dt, ref, rig.fx);
  }

  shift(dz) {
    this.clouds.shift(dz);
    for (const c of this.traffic.cars) c.z += dz;
    for (const b of this.boats.list) b.z += dz;
  }

  dispose() {
    this.terrain.dispose();
    this.forest.dispose();
    this.houses.dispose();
    this.traffic.dispose();
    this.herds.dispose();
    this.boats.dispose();
    this.poles.dispose();
    this.clouds.dispose();
    this.pmat.dispose();
  }
}
