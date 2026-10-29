// 地形烘焙：GPU 把地貌函数画成几张贴图（分条渲染，避免单次绘制太久卡住 GPU）
import * as THREE from 'three';
import { LOOP, WORLD_W } from './config.js';
import { packCurves, CURVE_SLOTS } from './curves.js';
import { FieldSampler, LAY_PPU } from './field.js';
import { BAKE_VERT, bakeFrag, PAINT_FRAG } from './bake_shaders.js';

const PAINT_PPU = 12;
const MASK_PPU = 4;

function rt(w, h, opts = {}) {
  const t = new THREE.WebGLRenderTarget(w, h, {
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: opts.mip ? THREE.LinearMipmapLinearFilter : opts.filter ?? THREE.NearestFilter,
    magFilter: opts.filter ?? THREE.NearestFilter,
    generateMipmaps: !!opts.mip,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.RepeatWrapping,
  });
  t.texture.colorSpace = THREE.NoColorSpace;
  return t;
}

export class TerrainBaker {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    this.blank.needsUpdate = true;
    this.paintMat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: PAINT_FRAG,
      uniforms: {
        uSrc: { value: null },
        uSize: { value: new THREE.Vector2() },
        uFlowers: { value: [] },
      },
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    });
  }

  _run(mat, target, strips = 1) {
    const r = this.renderer;
    this.quad.material = mat;
    const prevClear = r.autoClear;
    r.autoClear = false;
    const h = target.height;
    for (let i = 0; i < strips; i++) {
      const y0 = Math.floor((h * i) / strips);
      const y1 = Math.floor((h * (i + 1)) / strips);
      target.scissor.set(0, y0, target.width, y1 - y0);
      target.scissorTest = strips > 1;
      r.setRenderTarget(target);
      r.render(this.scene, this.cam);
      if (strips > 1) r.getContext().flush();
    }
    target.scissorTest = false;
    r.setRenderTarget(null);
    r.autoClear = prevClear;
  }

  /** 第一阶段：布局 + 密度，读回给 JS 摆放用 */
  begin(cfg) {
    this.dispose();
    const lw = WORLD_W * LAY_PPU;
    const lh = LOOP * LAY_PPU;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: bakeFrag(cfg.biome),
      uniforms: {
        uSize: { value: new THREE.Vector2(lw, lh) },
        uPass: { value: 0 },
        uCurves: { value: packCurves(cfg.curves) },
        uLayout: { value: this.blank },
        uLayoutSize: { value: new THREE.Vector2(lw, lh) },
        uOverlay: { value: this.blank },
      },
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.layoutRT = rt(lw, lh);
    this._run(this.mat, this.layoutRT);
    const den = rt(lw, lh);
    this.mat.uniforms.uPass.value = 1;
    this._run(this.mat, den);

    const lay = new Uint8Array(lw * lh * 4);
    const dd = new Uint8Array(lw * lh * 4);
    this.renderer.readRenderTargetPixels(this.layoutRT, 0, 0, lw, lh, lay);
    this.renderer.readRenderTargetPixels(den, 0, 0, lw, lh, dd);
    den.dispose();
    this.field = new FieldSampler(lay, dd, lw, lh);
    return this.field;
  }

  /** 第二阶段：遮罩 + 上色 + 油画化。overlay 是 JS 画的院子/小路（canvas） */
  finish(cfg, overlayCanvas) {
    const u = this.mat.uniforms;
    const ov = new THREE.CanvasTexture(overlayCanvas);
    ov.colorSpace = THREE.NoColorSpace;
    ov.wrapT = THREE.RepeatWrapping;
    ov.minFilter = THREE.LinearFilter;
    ov.generateMipmaps = false;
    u.uOverlay.value = ov;
    u.uLayout.value = this.layoutRT.texture;

    const mw = WORLD_W * MASK_PPU;
    const mh = LOOP * MASK_PPU;
    this.maskRT = rt(mw, mh, { mip: true, filter: THREE.LinearFilter });
    u.uSize.value.set(mw, mh);
    u.uPass.value = 2;
    this._run(this.mat, this.maskRT, 2);

    const pw = WORLD_W * PAINT_PPU;
    const ph = LOOP * PAINT_PPU;
    const raw = rt(pw, ph);
    raw.texture.wrapS = THREE.RepeatWrapping;
    u.uSize.value.set(pw, ph);
    u.uPass.value = 3;
    this._run(this.mat, raw, 6);

    this.paintRT = rt(pw, ph, { mip: true, filter: THREE.LinearFilter });
    this.paintRT.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const pu = this.paintMat.uniforms;
    pu.uSrc.value = raw.texture;
    pu.uSize.value.set(pw, ph);
    pu.uFlowers.value = cfg.flowers.map((h) => new THREE.Color(h));
    // 先带着 mipmap 初始化一次（分配完整 mip 链），分条渲染时再关掉自动生成，最后手动补一次
    this.renderer.setRenderTarget(this.paintRT);
    this.renderer.setRenderTarget(null);
    this.paintRT.texture.generateMipmaps = false;
    this._run(this.paintMat, this.paintRT, 6);
    this.paintRT.texture.generateMipmaps = true;
    this._genMips(this.paintRT);

    raw.dispose();
    ov.dispose();
    this.mat.dispose();
    this.mat = null;
    return {
      layout: this.layoutRT.texture,
      layoutSize: new THREE.Vector2(WORLD_W * LAY_PPU, LOOP * LAY_PPU),
      paint: this.paintRT.texture,
      mask: this.maskRT.texture,
    };
  }

  // 分条渲染时关掉了自动 mipmap，这里补一次
  _genMips(target) {
    const gl = this.renderer.getContext();
    const tex = this.renderer.properties.get(target.texture).__webglTexture;
    if (!tex) return;
    this.renderer.state.bindTexture(gl.TEXTURE_2D, tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.renderer.state.unbindTexture();
  }

  dispose() {
    for (const k of ['layoutRT', 'maskRT', 'paintRT']) {
      if (this[k]) this[k].dispose();
      this[k] = null;
    }
    if (this.mat) this.mat.dispose();
    this.mat = null;
  }
}
