import * as THREE from 'three';
import { scenes } from './scenes.js';
import { LOOP, SUN_DIR } from './config.js';
import { shared } from './shading.js';
import { TerrainBaker } from './bake.js';
import { World } from './world.js';
import { Rig, Flight } from './flight.js';
import { COMPOSITE_VERT, COMPOSITE_FRAG } from './composite.js';
import { createAirplane } from './airplane.js';

THREE.ColorManagement.enabled = false;
const MARGIN = 1.06;   // 渲染区比纸窗略大一圈，留给撕纸边的毛刺

export class WindFields {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.reveal = 1;
    this.revealTarget = undefined;
    this.pendingScene = null;

    const r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.setClearColor(0xffffff, 1);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 2, 900);
    this.rig = new Rig(this.camera);
    this.flight = new Flight();
    this.baker = new TerrainBaker(r);

    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow;
    sc.mapSize.set(2048, 2048);
    Object.assign(sc.camera, { left: -72, right: 72, top: 72, bottom: -72, near: 1, far: 500 });
    sc.camera.updateProjectionMatrix();
    sc.bias = -0.0005;
    sc.normalBias = 0.05;
    sc.radius = 2.2;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xe8f0ff, 0x9fbf7a, 1.5);
    this.scene.add(this.hemi);

    this.holder = new THREE.Group();
    this.airplane = createAirplane({ scale: 6.4 / 2.04 });
    this.airplane.group.rotation.y = Math.PI;
    this.holder.add(this.airplane.group);
    this.scene.add(this.holder);

    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      samples: 4,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: true,
    });
    this.rt.texture.colorSpace = THREE.NoColorSpace;
    this.buildComposite();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.mouse = null;
    window.addEventListener('pointermove', (e) => { this.mouse = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointerleave', () => { this.mouse = null; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.flight.roll(1);
      if (e.button === 2) this.flight.roll(-1);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const params = new URLSearchParams(location.search);
    const style = params.get('clouds');
    this.cloudStyle = style === 'puff' || style === 'flat' ? style : null;
    const q = params.get('scene');
    const found = scenes.findIndex((s) => s.id === q);
    const idx = found >= 0 ? found : scenes.findIndex((s) => s.id === 'desert');
    this.applyScene(idx);
  }

  start() { this.renderer.setAnimationLoop(() => this.tick()); }

  buildComposite() {
    this.compScene = new THREE.Scene();
    this.compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.cu = {
      tScene: { value: this.rt.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uCenter: { value: new THREE.Vector2() },
      uHalf: { value: 1 },
      uRtHalf: { value: 1 },
      uRtSize: { value: new THREE.Vector2(1, 1) },
      uReveal: { value: 1 },
      uPaper: { value: new THREE.Color('#ffffff') },
      uGlow: { value: new THREE.Color('#fff1cf') },
      uSat: { value: 1.05 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: COMPOSITE_VERT, fragmentShader: COMPOSITE_FRAG, uniforms: this.cu, depthTest: false, depthWrite: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    this.compScene.add(quad);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = this.renderer.getPixelRatio();
    this.renderer.setSize(w, h, false);
    const footerPx = Math.min(h * 0.17, 156);
    const topPx = Math.min(h * 0.075, 70);
    const spanHalf = (h - footerPx - topPx) * 0.5;
    const half = Math.min(spanHalf, h * 0.4, w * 0.44);
    const cyTop = topPx + spanHalf;
    this.art = { cx: w * 0.5, cy: cyTop, half };
    const side = Math.max(2, Math.round(2 * half * MARGIN * dpr));
    this.rt.setSize(side, side);
    this.rig.setMargin(MARGIN);
    this.cu.uRes.value.set(w * dpr, h * dpr);
    this.cu.uCenter.value.set(w * 0.5 * dpr, (h - cyTop) * dpr);
    this.cu.uHalf.value = half * dpr;
    this.cu.uRtHalf.value = half * MARGIN * dpr;
    this.cu.uRtSize.value.set(side, side);
  }

  switchTo(index) {
    if (this.reveal < 0.99 || this.pendingScene !== null) return;
    this.pendingScene = index;
    this.revealTarget = 0;
  }

  applyScene(index) {
    const base = scenes[index];
    const cfg = this.cloudStyle ? { ...base, clouds: { ...base.clouds, style: this.cloudStyle } } : base;
    this.current = cfg;
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
    }
    this.world = new World(cfg, this.baker);
    this.scene.add(this.world.group);
    this.hemi.groundColor.set(cfg.hemiGround ?? '#9fbf7a');
    this.cu.uGlow.value.set(cfg.grade?.glow ?? '#fff1cf');
    this.cu.uSat.value = cfg.grade?.sat ?? 1.05;
    this.flight.reset(this.rig.fx, this.rig.fz);
    this.updateHud(cfg);
    window.__ready = true;
    window.__stats = this.world.stats;
  }

  updateHud(cfg) {
    document.querySelectorAll('[data-scene]').forEach((el) => el.classList.toggle('active', el.dataset.scene === cfg.id));
    const t = document.querySelector('.title');
    const s = document.querySelector('.sub');
    const n = document.querySelector('.note');
    if (t) t.textContent = cfg.title;
    if (s) s.innerHTML = cfg.lines.join('<br>');
    if (n) n.textContent = cfg.caption;
    document.title = `${cfg.title} · ${cfg.name}`;
  }

  mouseNdc() {
    const m = this.mouse;
    const a = this.art;
    if (!m || Math.abs(m.x - a.cx) > a.half || Math.abs(m.y - a.cy) > a.half) return null;
    return new THREE.Vector2((m.x - a.cx) / (a.half * MARGIN), -(m.y - a.cy) / (a.half * MARGIN));
  }

  updateSun() {
    const t = new THREE.Vector3(this.rig.fx, 0, this.rig.fz - 10);
    const r = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
    const u = new THREE.Vector3().crossVectors(SUN_DIR, r);
    const texel = 144 / 2048;
    const a = t.dot(r), b = t.dot(u);
    t.addScaledVector(r, Math.round(a / texel) * texel - a).addScaledVector(u, Math.round(b / texel) * texel - b);
    this.sun.target.position.copy(t);
    this.sun.position.copy(t).addScaledVector(SUN_DIR, 220);
    this.sun.target.updateMatrixWorld();
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    if (this.revealTarget !== undefined) {
      this.reveal += (this.revealTarget - this.reveal) * Math.min(1, dt * 6);
      if (this.revealTarget === 0 && this.reveal < 0.02) {
        this.applyScene(this.pendingScene);
        this.pendingScene = null;
        this.revealTarget = 1;
      } else if (this.revealTarget === 1 && this.reveal > 0.995) {
        this.reveal = 1;
        this.revealTarget = undefined;
      }
    }

    if (this.rig.fz < -LOOP / 2) {
      this.rig.fz += LOOP;
      this.flight.shift(LOOP);
      this.world.shift(LOOP);
    }
    this.rig.update(dt, this.flight.x);
    this.flight.update(dt, this.rig, this.mouseNdc(), this.camera);
    this.flight.apply(this.holder);
    this.airplane.update(dt);
    this.world.update(dt, this.time, this.rig);
    shared.uTime.value = this.time;
    shared.uWindT.value = (this.time * 4.5) % LOOP;
    this.updateSun();

    this.cu.uReveal.value = this.reveal;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.compScene, this.compCam);
    window.__frames = (window.__frames || 0) + 1;
  }
}

const app = new WindFields(document.getElementById('scene'));
window.__app = app;
app.start();

document.querySelectorAll('[data-scene]').forEach((el, i) => el.addEventListener('click', () => app.switchTo(i)));
window.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const idx = scenes.findIndex((s) => s.id === app.current.id);
  app.switchTo((idx + (e.key === 'ArrowRight' ? 1 : scenes.length - 1)) % scenes.length);
});
