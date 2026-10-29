import * as THREE from 'three';
import { scenes } from './scenes.js';
import { buildGround, scatterPoints, mulberry32 } from './ground.js';
import {
  makeCanopyTexture,
  makeShadowFromCanopy,
  makeShadowTexture,
  makeCarTexture,
  makePlaneTexture,
  makeCowTexture,
  makeSheepTexture,
  treePalettes,
} from './sprites.js';
import { cloudVertex, cloudFragment, compositeVertex, compositeFragment } from './shaders.js';
import { createAirplane } from './airplane.js';

THREE.ColorManagement.enabled = false;

const ART = 78;              // 纸窗边长（世界单位）
const WORLD_W = 100;         // 地面宽度
const WORLD_H = 232;         // 地面「长条」长度：镜头一路向北推进
const PPU = 13;              // 地面贴图：每世界单位的像素
const SUN = new THREE.Vector2(0.62, 0.78).normalize(); // 光从左上来
const CAM_SPEED = 5.6;       // 镜头向北推进速度（世界单位/秒）：一屏约 14 秒，慢但不拖沓
const LOOP = WORLD_H;       // z 方向的循环周期（贴图上下无缝相接的长度）

const rnd01 = () => Math.random();

export class WindFields {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.pointer = new THREE.Vector2();
    this.pointerSmooth = new THREE.Vector2();
    this.drift = new THREE.Vector2();
    this.reveal = 1;
    this.pendingScene = null;
    this.current = null;
    this.camZ = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0xffffff, 1);
    // 真实的阴影贴图（只给飞机会投影，成本很低）
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.5, 600);
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(0, 200, this.camZ);
    this.camera.lookAt(0, 0, this.camZ);

    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.clouds = [];
    this.cars = [];
    this.roadPts = null;
    this.roadNormals = null;

    this.plane = null;
    this.planeShadow = null;
    this.airplane = null;
    this.planeZ = WORLD_H / 2;

    this.keyLight = null;

    this.animals = [];
    this.wake = [];
    this.wakeTimer = 0;
    this.wakeArray = Array.from({ length: 12 }, () => new THREE.Vector4());

    this.buildComposite();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.mousePx = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5);
    this.overArt = false;
    this.rollDir = 1;

    // 左键 = 顺时针翻滚，右键 = 逆时针
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      this.rollDir = e.button === 0 ? 1 : -1;
      this.rollP = 0;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.rollP = null;
    this.rollTimer = 9;
    this.debugRoll = null;
    this.planeHeading = 0;
    this.planeX = 0;
    this.planeSpeedNow = 7.6;

    window.addEventListener('pointermove', (e) => {
      this.pointer.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1
      );
      this.mousePx.set(e.clientX, e.clientY);
    });

    this.switchTo(2, true);
  }

  start() {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /* ------------------------------- 后期合成 ------------------------------- */

  buildComposite() {
    this.compositeScene = new THREE.Scene();
    this.compositeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.compositeUniforms = {
      tScene: { value: this.rt.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uHalf: { value: 1 },
      uTime: { value: 0 },
      uReveal: { value: 1 },
      uPaper: { value: new THREE.Color('#FFFFFF') },
    };
    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: compositeVertex,
      fragmentShader: compositeFragment,
      uniforms: this.compositeUniforms,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMat);
    quad.frustumCulled = false;
    this.compositeScene.add(quad);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = this.renderer.getPixelRatio();
    this.renderer.setSize(w, h, false);
    this.rt.setSize(Math.floor(w * dpr), Math.floor(h * dpr));

    const footerPx = Math.min(h * 0.17, 156);
    const topPx = Math.min(h * 0.075, 70);
    const spanHalf = (h - footerPx - topPx) * 0.5;
    const artHalfPx = Math.min(spanHalf, h * 0.4, w * 0.44);
    const centerFromBottom = h - (topPx + spanHalf);
    const unitsPerPx = ART / (2 * artHalfPx);

    this.halfH = (h * 0.5) * unitsPerPx;
    this.halfW = this.halfH * (w / h);
    // 纸窗在屏幕上的位置（CSS 像素），用来判断鼠标是不是在画面里
    this.artRect = {
      cx: w * 0.5,
      cy: h - centerFromBottom,
      half: artHalfPx,
    };
    this.camera.left = -this.halfH * (w / h);
    this.camera.right = this.halfH * (w / h);
    this.camera.top = this.halfH;
    this.camera.bottom = -this.halfH;
    this.camera.updateProjectionMatrix();

    this.compositeUniforms.uRes.value.set(w * dpr, h * dpr);
    this.compositeUniforms.uHalf.value = artHalfPx * dpr;
    this.compositeUniforms.uCenter.value.set(w * dpr * 0.5, centerFromBottom * dpr);
  }

  /* -------------------------------- 场景 -------------------------------- */

  clearScene() {
    for (const obj of this.scene.children.slice()) {
      this.scene.remove(obj);
      obj.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map && o.material.map.dispose) o.material.map.dispose();
          o.material.dispose();
        }
      });
    }
    this.clouds = [];
    this.cars = [];
    this.animals = [];
    this.roadPts = null;
    this.roadNormals = null;
    this.plane = null;
    this.planeShadow = null;
    this.airplane = null;
    this.planeZ = WORLD_H / 2;
    this.wake = [];
    this.wakeTimer = 0;
    for (const v of this.wakeArray) v.set(0, 0, 0, 0);
  }

  switchTo(index, immediate = false) {
    if (!immediate && this.reveal < 0.99) return;
    if (!immediate) {
      this.pendingScene = index;
      this.revealTarget = 0;
      return;
    }
    this.applyScene(index);
  }

  applyScene(index) {
    const cfg = scenes[index];
    this.current = cfg;
    this.clearScene();
    const rnd = mulberry32(cfg.seed * 977 + 13);

    /* ---- 地面（长条） ---- */
    const ground = buildGround(cfg, { wu: WORLD_W, hu: WORLD_H, ppu: PPU });
    const tex = new THREE.CanvasTexture(ground.canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;

    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 2);
    const groundGeo = new THREE.PlaneGeometry(WORLD_W, WORLD_H * 2);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMesh = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({ map: tex }));
    groundMesh.renderOrder = 0;
    this.groundMesh = groundMesh;
    this.scene.add(groundMesh);

    const catcher = new THREE.Mesh(
      groundGeo,
      new THREE.ShadowMaterial({ opacity: 0.34, color: 0x5a3a20 })
    );
    catcher.receiveShadow = true;
    catcher.position.y = 0.02;
    catcher.renderOrder = 1;
    this.scene.add(catcher);
    this.catcher = catcher;

    const blockers = ground.layout.blockers;

    /* ---- 树 ---- */
    const palette = treePalettes[cfg.trees.palette];
    const treePts = scatterPoints(rnd, {
      wu: WORLD_W,
      hu: WORLD_H,
      cell: cfg.trees.cell,
      prob: 0.94,
      blockers,
      exclude: ground.layout.exclude,
      margin: 0.55,
    });

    const canopyTex = [0, 1, 2].map(() => makeCanopyTexture(rnd, palette));
    const shadowTex = canopyTex.map((c) => makeShadowFromCanopy(c));

    // 环带复制：靠近边界的对象在对侧补一份，**连同全部随机参数一起复制**，
    // 否则整体平移一个周期时，同一位置的树会突然换成另一棵（品种/朝向/大小都变）
    const wrapStrip = (list) => {
      const out = list.slice();
      const half = WORLD_H / 2;
      for (const t of list) {
        if (t.z < -half + 62) out.push({ ...t, z: t.z + WORLD_H });
        if (t.z > half - 62) out.push({ ...t, z: t.z - WORLD_H });
      }
      return out;
    };

    const treeList = treePts.map((p) => ({
      x: p.x,
      z: p.z,
      v: (rnd() * 3) | 0,
      s: rnd() < 0.14
        ? cfg.trees.bigScale[0] + rnd() * (cfg.trees.bigScale[1] - cfg.trees.bigScale[0])
        : cfg.trees.scale[0] + rnd() * (cfg.trees.scale[1] - cfg.trees.scale[0]),
      rot: rnd() * Math.PI * 2,
      tint: 0.9 + rnd() * 0.22,
    }));

    const variants = [[], [], []];
    for (const t of wrapStrip(treeList)) variants[t.v].push(t);

    const treeGeo = new THREE.PlaneGeometry(1, 1);
    treeGeo.rotateX(-Math.PI / 2);
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);

    const treeMeshes = [];
    const shadowMeshes = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    const V = new THREE.Vector3(0, 1, 0);

    for (let v = 0; v < 3; v++) {
      const list = variants[v];
      if (!list.length) continue;

      const mat = new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canopyTex[v]),
        transparent: true,
        depthWrite: false,
        alphaTest: 0.02,
      });
      mat.map.colorSpace = THREE.NoColorSpace;
      const mesh = new THREE.InstancedMesh(treeGeo, mat, list.length);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;

      const sMat = new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(shadowTex[v]),
        transparent: true,
        depthWrite: false,
        opacity: 0.8,
      });
      sMat.map.colorSpace = THREE.NoColorSpace;
      const sMesh = new THREE.InstancedMesh(shadowGeo, sMat, list.length);
      sMesh.renderOrder = 2;
      sMesh.frustumCulled = false;

      list.forEach((t, i) => {
        q.setFromAxisAngle(V, t.rot);
        pos.set(t.x, 0.02 + i * 1e-5, t.z);
        scl.set(t.s, 1, t.s);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
        col.setRGB(t.tint, t.tint * 0.995, t.tint * 0.99);
        mesh.setColorAt(i, col);

        const d = t.s * 0.34;
        pos.set(t.x + SUN.x * d, 0.012, t.z + SUN.y * d);
        scl.set(t.s * 1.3, 1, t.s * 1.16);
        m.compose(pos, q, scl);
        sMesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      sMesh.instanceMatrix.needsUpdate = true;
      treeMeshes.push(mesh);
      shadowMeshes.push(sMesh);
    }
    shadowMeshes.forEach((x) => this.scene.add(x));
    treeMeshes.forEach((x) => this.scene.add(x));
    this.treeMeshes = [...shadowMeshes, ...treeMeshes];

    /* ---- 灌木（画面里大量的小黑绿点） ---- */
    if (cfg.shrubs) {
      const shrubPts = scatterPoints(rnd, {
        wu: WORLD_W,
        hu: WORLD_H,
        cell: cfg.shrubs.cell,
        prob: cfg.shrubs.prob,
        blockers,
        exclude: ground.layout.exclude,
        margin: 0.4,
      });
      const sMat = new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canopyTex[0]),
        transparent: true,
        depthWrite: false,
        alphaTest: 0.02,
        color: 0xbfbfbf,
      });
      sMat.map.colorSpace = THREE.NoColorSpace;
      const shrubs = new THREE.InstancedMesh(treeGeo, sMat, shrubPts.length);
      shrubs.renderOrder = 3;
      shrubs.frustumCulled = false;
      const shrubList = shrubPts.map((p) => ({
        x: p.x,
        z: p.z,
        s: cfg.shrubs.scale[0] + rnd() * (cfg.shrubs.scale[1] - cfg.shrubs.scale[0]),
        rot: rnd() * Math.PI * 2,
      }));
      const half = WORLD_H / 2;
      for (const t of shrubList.slice()) {
        if (t.z < -half + 62) shrubList.push({ ...t, z: t.z + WORLD_H });
        if (t.z > half - 62) shrubList.push({ ...t, z: t.z - WORLD_H });
      }
      shrubs.count = shrubList.length;
      shrubList.forEach((t, i) => {
        q.setFromAxisAngle(V, t.rot);
        pos.set(t.x, 0.015 + i * 1e-5, t.z);
        scl.set(t.s, 1, t.s);
        m.compose(pos, q, scl);
        shrubs.setMatrixAt(i, m);
      });
      shrubs.instanceMatrix.needsUpdate = true;
      this.shrubMesh = shrubs;
      this.scene.add(shrubs);
    }

    /* ---- 汽车（分车道） ---- */
    if (cfg.cars && ground.layout.road) {
      this.roadPts = ground.layout.road;
      const n = this.roadPts.length;
      this.roadNormals = this.roadPts.map((p, i) => {
        const a = this.roadPts[Math.max(0, i - 1)];
        const b = this.roadPts[Math.min(n - 1, i + 1)];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const l = Math.hypot(dx, dz) || 1;
        return [dz / l, -dx / l];
      });

      const carGeo = new THREE.PlaneGeometry(1.7, 3.6);
      carGeo.rotateX(-Math.PI / 2);
      const carColors = ['#F8F7F3', '#E8D24A', '#F8F7F3', '#5C7C8A'];

      for (let i = 0; i < cfg.cars; i++) {
        const mat = new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(makeCarTexture(carColors[i % carColors.length])),
          transparent: true,
          depthWrite: false,
        });
        mat.map.colorSpace = THREE.NoColorSpace;
        const mesh = new THREE.Mesh(carGeo, mat);
        mesh.renderOrder = 4;
        this.scene.add(mesh);
        this.cars.push({
          mesh,
          t: 0.1 + i * 0.24,
          dir: i % 2 === 0 ? 1 : -1,
          speed: 5.4 + i * 0.9,
          lane: 1.28,
        });
      }
    }

    /* ---- 牛羊（很小的一点点白） ---- */
    if (cfg.animals) {
      const spots = scatterPoints(rnd, {
        wu: WORLD_W,
        hu: WORLD_H,
        cell: 9,
        prob: 0.5,
        blockers,
        exclude: ground.layout.exclude,
        margin: 0.8,
      }).filter((p) => p.z > this.camZ - 90 && p.z < this.camZ - 10);

      const animalGeo = new THREE.PlaneGeometry(1, 1);
      animalGeo.rotateX(-Math.PI / 2);
      const aShadowTex = new THREE.CanvasTexture(makeShadowTexture());
      aShadowTex.colorSpace = THREE.NoColorSpace;

      const kinds = [
        ...Array(cfg.animals.cows || 0).fill('cow'),
        ...Array(cfg.animals.sheep || 0).fill('sheep'),
      ];

      kinds.forEach((kind, i) => {
        const spot = spots[i % Math.max(1, spots.length)];
        if (!spot) return;
        const isCow = kind === 'cow';
        const tex = new THREE.CanvasTexture(isCow ? makeCowTexture() : makeSheepTexture());
        tex.colorSpace = THREE.NoColorSpace;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(animalGeo, mat);
        mesh.renderOrder = 4;

        const s0 = 0.85 + rnd() * 0.3;
        const bodyW = (isCow ? 0.95 : 0.75) * s0;
        const bodyL = (isCow ? 1.7 : 1.0) * s0;
        const sx = bodyW / (isCow ? 0.41 : 0.38);
        const sz = bodyL / (isCow ? 0.63 : 0.61);
        mesh.scale.set(sx, 1, sz);
        this.scene.add(mesh);

        const smat = new THREE.MeshBasicMaterial({
          map: aShadowTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.5,
        });
        const sh = new THREE.Mesh(animalGeo, smat);
        sh.scale.set(bodyW * 1.5, 1, bodyL * 1.3);
        sh.renderOrder = 2;
        this.scene.add(sh);

        this.animals.push({
          mesh,
          shadow: sh,
          cx: spot.x,
          cz: spot.z,
          rx: 1.6 + rnd() * 3,
          rz: 1.4 + rnd() * 2.4,
          w: 0.06 + rnd() * 0.05,
          phase: rnd() * 100,
          sx,
          sz,
          shW: bodyW * 1.5,
          shL: bodyL * 1.3,
        });
      });
    }

    // 整场只有飞机是实体材质，给它两盏灯就够（方向和树影一致）
    this.keyLight = new THREE.DirectionalLight(0xfff4e2, 2.4);
    this.keyLight.position.set(SUN.x * 8, 12, SUN.y * 8);
    this.scene.add(this.keyLight);
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0xd08a4a, 1.7));

    // 太阳：只负责投下飞机的真实阴影（一盏平行光 + 一块只接影子的地面）
    const sun = new THREE.DirectionalLight(0xfff1d8, 0.35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -55;
    sun.shadow.camera.right = 55;
    sun.shadow.camera.top = 55;
    sun.shadow.camera.bottom = -55;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 900;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    this.sunLight = sun;
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.scene.add(sun);
    sun.target = this.sunTarget;

    /* ---- 飞机：用户提供的程序化模型（机头朝 +Z，这里转成朝 -Z） ---- */
    const holder = new THREE.Group();
    holder.name = 'AirplaneHolder';
    this.airplane = createAirplane({ scale: 4.8 / 2.04 });
    this.airplane.group.rotation.y = Math.PI;
    holder.add(this.airplane.group);
    holder.renderOrder = 12;
    holder.frustumCulled = false;
    this.plane = holder;
    this.scene.add(holder);

    this.planeZ = this.camZ + 22;
    this.planeX = 2 + 5.5 * Math.sin(this.planeZ * 0.021 + 1.2);
    this.planeHeading = 0;
    this.planeSpeed = 7.6;
    this.planeSpeedNow = this.planeSpeed;
    this.rollP = null;
    this.rollTimer = 6 + rnd() * 10;

    /* ---- 云 ---- */
    const cloudGeo = new THREE.PlaneGeometry(1, 1);
    cloudGeo.rotateX(-Math.PI / 2);
    const cloudCount = cfg.clouds.count;

    for (let i = 0; i < cloudCount; i++) {
      const size = cfg.clouds.sizes
        ? cfg.clouds.sizes[i % cfg.clouds.sizes.length]
        : cfg.clouds.size[0] + rnd() * (cfg.clouds.size[1] - cfg.clouds.size[0]);
      const seed = i * 4.7 + 1.3;

      const uni = {
        uTime: { value: 0 },
        uSeed: { value: seed },
        uOpacity: { value: cfg.clouds.opacity },
        uShadow: { value: 0 },
        uShade: { value: new THREE.Color(cfg.clouds.shade) },
        uCloudCenter: { value: new THREE.Vector2() },
        uCloudSize: { value: 1 },
        uWake: { value: this.wakeArray },
        uWakeActive: { value: 0 },
      };
      const mat = new THREE.ShaderMaterial({
        vertexShader: cloudVertex,
        fragmentShader: cloudFragment,
        uniforms: uni,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(cloudGeo, mat);
      mesh.scale.set(size, 1, size);
      mesh.renderOrder = 10;

      const suni = {
        uTime: { value: 0 },
        uSeed: { value: seed },
        uOpacity: { value: cfg.clouds.opacity },
        uShadow: { value: 1 },
        uShade: { value: new THREE.Color(cfg.clouds.shade) },
        uCloudCenter: { value: new THREE.Vector2() },
        uCloudSize: { value: 1 },
        uWake: { value: this.wakeArray },
        uWakeActive: { value: 0 },
      };
      const sMat = new THREE.ShaderMaterial({
        vertexShader: cloudVertex,
        fragmentShader: cloudFragment,
        uniforms: suni,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      const sMesh = new THREE.Mesh(cloudGeo, sMat);
      sMesh.scale.set(size * 1.1, 1, size * 1.02);
      sMesh.renderOrder = 1;

      // 横向铺在画框里，只有少数甩到边上（被纸边切断，和参考图一致）
      const x = (rnd() - 0.5) * (ART * (rnd() < 0.25 ? 1.35 : 0.95));
      const z = -WORLD_H / 2 + ((i + 0.5) / cloudCount) * WORLD_H + (rnd() - 0.5) * 14;

      mesh.position.set(x, 40 + rnd() * 20, z);
      sMesh.position.set(x + SUN.x * size * 0.22, 0.008, z + SUN.y * size * 0.22);

      uni.uCloudCenter.value.set(x, z);
      uni.uCloudSize.value = size;
      suni.uCloudCenter.value.set(x + SUN.x * size * 0.22, z + SUN.y * size * 0.22);
      suni.uCloudSize.value = size * 1.05;

      this.scene.add(sMesh);
      this.scene.add(mesh);

      this.clouds.push({
        mesh,
        sMesh,
        uniforms: uni,
        shadowUniforms: suni,
        size,
        speed: 0.25 + rnd() * 0.6,
        phase: rnd() * 100,
        baseZ: z,
      });
    }

    this.updateHud(cfg);
  }

  updateHud(cfg) {
    document.querySelectorAll('[data-scene]').forEach((el) => {
      el.classList.toggle('active', el.dataset.scene === cfg.id);
    });
    const t = document.querySelector('.title');
    const s = document.querySelector('.sub');
    const n = document.querySelector('.note');
    if (t) t.textContent = cfg.title;
    if (s) s.innerHTML = cfg.lines.join('<br>');
    if (n) n.textContent = cfg.caption;
  }

  /* -------------------------------- 每帧 -------------------------------- */

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;

    if (this.revealTarget !== undefined) {
      const target = this.revealTarget;
      this.reveal += (target - this.reveal) * Math.min(1, dt * 9);
      if (target === 0 && this.reveal < 0.03) {
        if (this.pendingScene !== null) {
          this.applyScene(this.pendingScene);
          this.pendingScene = null;
        }
        this.revealTarget = 1;
      } else if (target === 1 && this.reveal > 0.995) {
        this.reveal = 1;
        this.revealTarget = undefined;
      }
    }

    // 镜头一路向北推进，永不回头；地面与植被每帧对齐到最近的整数周期
    this.camZ -= CAM_SPEED * dt;
    const baseZ = Math.round(this.camZ / LOOP) * LOOP;
    if (this.groundMesh) this.groundMesh.position.z = baseZ;
    if (this.treeMeshes) for (const m of this.treeMeshes) m.position.z = baseZ;
    if (this.shrubMesh) this.shrubMesh.position.z = baseZ;
    if (this.catcher) this.catcher.position.z = baseZ;
    // 动的物件（云/飞机/牛羊）保持在相机 ±半周期 内，跨界时在画面外绕回来
    const wrapRel = (z) => {
      let d = z - this.camZ;
      d = (((d + LOOP / 2) % LOOP) + LOOP) % LOOP - LOOP / 2;
      return this.camZ + d;
    };
    this.wrapRel = wrapRel;

    this.pointerSmooth.lerp(this.pointer, Math.min(1, dt * 2.4));
    this.drift.set(
      Math.sin(this.time * 0.07) * 0.5 + this.pointerSmooth.x * 0.9,
      Math.cos(this.time * 0.055) * 0.4
    );
    this.camera.position.set(this.drift.x, 200, this.camZ + this.drift.y);
    this.camera.lookAt(this.drift.x, 0, this.camZ + this.drift.y);

    // 飞机：默认从南往北飞；鼠标进画面后由鼠标接管
    if (this.plane) {
      const xAt = (z) => 2 + 5.5 * Math.sin(z * 0.021 + 1.2);
      const rect = this.artRect;
      const inside = !!rect &&
        Math.abs(this.mousePx.x - rect.cx) <= rect.half &&
        Math.abs(this.mousePx.y - rect.cy) <= rect.half;
      this.overArt = inside;

      let desired;
      if (inside) {
        // 屏幕坐标 → 世界坐标（正交相机，直接线性映射）
        const nx = (this.mousePx.x / window.innerWidth) * 2 - 1;
        const ny = (this.mousePx.y / window.innerHeight) * 2 - 1;
        const tx = this.camera.position.x + nx * this.halfW;
        const tz = this.camera.position.z - ny * this.halfH;
        const dx = tx - this.planeX;
        const dz = tz - this.planeZ;
        desired = Math.atan2(dx, -dz);
        // 快到了就减速，免得在鼠标旁边绕圈打转
        this.planeSpeedNow = Math.min(9.0, Math.max(3.0, Math.hypot(dx, dz) * 1.1));
      } else {
        // 回到默认航线（略微摆动的向北直线）
        desired = Math.atan2((xAt(this.planeZ) - this.planeX) * 0.3, 1);
        this.planeSpeedNow += (this.planeSpeed - this.planeSpeedNow) * Math.min(1, dt * 1.5);
      }

      // 限制转向速率：飞机不会原地拐弯
      let diff = desired - this.planeHeading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.planeHeading += Math.max(-2.0 * dt, Math.min(2.0 * dt, diff));

      this.planeX += Math.sin(this.planeHeading) * this.planeSpeedNow * dt;
      this.planeZ -= Math.cos(this.planeHeading) * this.planeSpeedNow * dt;

      const lim = WORLD_W / 2 - 5;
      this.planeX = Math.max(-lim, Math.min(lim, this.planeX));
      this.planeZ = this.wrapRel(this.planeZ);

      // 偶尔翻滚一圈
      if (this.rollP === null) {
        this.rollTimer -= dt;
        if (this.rollTimer <= 0) {
          this.rollP = 0;
          this.rollDir = rnd01() < 0.5 ? 1 : -1;
        }
      } else {
        this.rollP += dt / 2.4;
        if (this.rollP >= 1) {
          this.rollP = null;
          this.rollTimer = 9 + rnd01() * 15;
        }
      }
      const p = this.rollP;
      let roll = 0;
      let lift = 0;
      let lat = 0;
      if (p !== null) {
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        roll = this.rollDir * e * Math.PI * 2;
        lift = Math.sin(Math.PI * p) * 2.2;
        // 桶滚的轨迹也是弯的：往背离翻滚方向的一侧划出去，左/右两个方向才看得出区别
        lat = -this.rollDir * Math.sin(Math.PI * p) * 2.6;
      }

      if (this.debugRoll !== null && this.debugRoll !== undefined) roll = this.debugRoll;
      const rot = -this.planeHeading; // holder 里机头朝 -Z
      const rx = Math.cos(this.planeHeading);   // 航向的右向
      const rz = Math.sin(this.planeHeading);
      this.plane.position.set(this.planeX + rx * lat, 92 + lift, this.planeZ + rz * lat);
      this.plane.rotation.y = rot;
      this.plane.rotation.z = roll;
      this.airplane.update(dt);

      // 云挡住飞机的影子：算飞机正上方那片云有多厚
      // 厚度用云着色器同一套轮廓（离云心越近越厚），边缘处影子只留一部分
      let cover = 0;
      for (const c of this.clouds) {
        const qx = ((this.planeX - c.mesh.position.x) / c.size) * 2;
        const qz = ((this.planeZ - c.mesh.position.z) / c.size) * 2 * 1.12;
        const rr = Math.hypot(qx, qz);
        const a = 1 - THREE.MathUtils.smoothstep(rr, 0.52, 0.96);
        if (a > cover) cover = a;
      }
      // 云被飞机拨开的地方本来就漏光，所以扣掉一点，影子会从破洞里透出来
      const blocked = Math.max(0, cover - (this.rollP === null ? 0.18 : 0.18));
      if (this.catcher) this.catcher.material.opacity = 0.34 * (1 - 0.92 * blocked);

      // 太阳跟随镜头，阴影相机始终罩住画面
      const cx = this.camera.position.x;
      const cz = this.camera.position.z;
      this.sunTarget.position.set(cx, 0, cz);
      this.sunLight.position.set(cx - SUN.x * 26, 520, cz - SUN.y * 26);

      this.wakeTimer += dt;
      if (this.wakeTimer >= 0.06) {
        this.wakeTimer = 0;
        this.wake.push({ x: this.planeX, z: this.planeZ, age: 0 });
      }
    }

    for (const w of this.wake) w.age += dt;
    while (this.wake.length && this.wake[0].age > 2.2) this.wake.shift();
    for (let i = 0; i < this.wakeArray.length; i++) {
      const s = this.wake[this.wake.length - 1 - i];
      if (s) {
        const life = 1 - s.age / 2.2;
        this.wakeArray[i].set(s.x, s.z, 1.9 + 2.6 * life, Math.pow(life, 1.5));
      } else {
        this.wakeArray[i].set(0, 0, 0, 0);
      }
    }

    // 云漂移
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      c.mesh.position.z = this.wrapRel(c.baseZ + Math.sin(this.time * 0.05 + c.phase) * 1.6);
      c.sMesh.position.set(
        c.mesh.position.x + SUN.x * c.size * 0.22,
        0.008,
        c.mesh.position.z + SUN.y * c.size * 0.22
      );
      const range = WORLD_W * 0.5 + c.size * 0.6;
      if (c.mesh.position.x > range) c.mesh.position.x = -range;
      c.uniforms.uTime.value = this.time;
      c.shadowUniforms.uTime.value = this.time;
      c.uniforms.uCloudCenter.value.set(c.mesh.position.x, c.mesh.position.z);
      // 云离航迹很远时，让着色器整个跳过 12 次循环
      let near = 0;
      for (let i = 0; i < 12; i++) {
        const w = this.wakeArray[i];
        if (w.w <= 0.002) continue;
        const dd = Math.hypot(w.x - c.mesh.position.x, w.y - c.mesh.position.z);
        if (dd < c.size * 0.75 + w.z + 6) { near = 1; break; }
      }
      c.uniforms.uWakeActive.value = near;
      c.shadowUniforms.uWakeActive.value = near;
      c.shadowUniforms.uCloudCenter.value.set(c.sMesh.position.x, c.sMesh.position.z);
    }

    // 牛羊
    for (const a of this.animals) {
      const t = this.time * a.w + a.phase;
      const x = a.cx + Math.cos(t) * a.rx;
      const z = this.wrapRel(a.cz + Math.sin(t * 0.8) * a.rz);
      const dx = -Math.sin(t) * a.rx;
      const dz = Math.cos(t * 0.8) * 0.8 * a.rz;
      const rot = Math.atan2(-dx, -dz);
      const bob = 1 + Math.sin(this.time * 3.4 + a.phase) * 0.03;

      a.mesh.position.set(x, 0.05, z);
      a.mesh.rotation.y = rot;
      a.mesh.scale.set(a.sx, 1, a.sz * bob);

      a.shadow.position.set(x + SUN.x * 0.25, 0.014, z + SUN.y * 0.25);
      a.shadow.rotation.y = rot;
      a.shadow.scale.set(a.shW, 1, a.shL * bob);
    }

    // 车
    if (this.roadPts && this.cars.length) {
      const n = this.roadPts.length;
      for (const car of this.cars) {
        car.t += (car.dir * car.speed * dt) / WORLD_H;
        if (car.t > 1) car.t -= 1;
        if (car.t < 0) car.t += 1;
        const f = car.t * (n - 1);
        const i0 = Math.floor(f);
        const i1 = Math.min(n - 1, i0 + 1);
        const k = f - i0;
        const [x0, z0] = this.roadPts[i0];
        const [x1, z1] = this.roadPts[i1];
        const x = x0 + (x1 - x0) * k;
        const z = z0 + (z1 - z0) * k;
        const [nx, nz] = this.roadNormals[i0];
        car.mesh.position.set(x + nx * car.lane * car.dir, 0.05, z + nz * car.lane * car.dir);
        car.mesh.rotation.y = Math.atan2(-(x1 - x0), -(z1 - z0));
      }
    }

    this.compositeUniforms.uReveal.value = this.reveal;
    this.compositeUniforms.uTime.value = this.time;

    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.compositeScene, this.compositeCam);

    window.__frames = (window.__frames || 0) + 1;
  }
}

/* --------------------------------- 启动 --------------------------------- */

const canvas = document.getElementById('scene');
const app = new WindFields(canvas);
window.__app = app;
app.start();

document.querySelectorAll('[data-scene]').forEach((el, i) => {
  el.addEventListener('click', () => app.switchTo(i));
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const idx = scenes.findIndex((s) => s.id === app.current.id);
    const next = (idx + (e.key === 'ArrowRight' ? 1 : scenes.length - 1)) % scenes.length;
    app.switchTo(next);
  }
});
