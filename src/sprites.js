// 所有「小物件」都是程序化画在 canvas 上再当贴图用：
// 俯视视角下，一棵树 = 一叠带径向渐变的圆；颜色/轮廓都在这里生成。

const TAU = Math.PI * 2;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function hasFilter(ctx) {
  return typeof ctx.filter === 'string';
}

const DESERT_TREE = {
  light: '#83984C',
  mid: '#54692F',
  dark: '#33451C',
  rim: '#26320F',
};

const RIVER_TREE = {
  light: '#93B26A',
  mid: '#5E8244',
  dark: '#33512B',
  rim: '#253D23',
};

const FIELD_TREE = {
  light: '#9BB065',
  mid: '#6A8443',
  dark: '#3A5126',
  rim: '#2A3C1B',
};

export const treePalettes = {
  desert: DESERT_TREE,
  river: RIVER_TREE,
  field: FIELD_TREE,
  sea: { light: '#A2B96B', mid: '#6E8B45', dark: '#3E5A2A', rim: '#2C4220' },
};

/**
 * 俯视树冠贴图。暗底 + 多个叶团 + source-atop 整体受光，得到「有体积感」的树。
 */
export function makeCanopyTexture(rnd, palette = DESERT_TREE, opts = {}) {
  const S = 256;
  const c = canvas(S);
  const g = c.getContext('2d');
  const cx = S / 2;
  const cy = S / 2;
  const R = S * (opts.radius ?? 0.44);

  // 不规则但平滑的轮廓：几条低频谐波，比「一堆圆」更像一团树
  const p1 = rnd() * TAU;
  const p2 = rnd() * TAU;
  const p3 = rnd() * TAU;
  const envelope = (a) =>
    R * (0.86 + 0.07 * Math.sin(3 * a + p1) + 0.045 * Math.sin(5 * a + p2) + 0.022 * Math.sin(7 * a + p3));

  // 1) 先用轮廓路径填一个实心树冠（平滑、不规则）
  const outline = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * TAU;
    const r = envelope(a);
    outline.push([cx + Math.cos(a) * r * 0.96, cy + Math.sin(a) * r]);
  }
  if (hasFilter(g)) g.filter = 'blur(6px)';
  g.globalAlpha = 0.96;
  g.fillStyle = palette.dark;
  g.beginPath();
  outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
  if (hasFilter(g)) g.filter = 'none';
  g.globalAlpha = 1;

  // 2) 内部叶簇：只画在已有着色区域内，形成斑驳的叶面
  g.globalCompositeOperation = 'source-atop';
  if (hasFilter(g)) g.filter = 'blur(4px)';
  const N = 950;
  for (let i = 0; i < N; i++) {
    const a = rnd() * TAU;
    const t = Math.pow(rnd(), 0.55);
    const rr = envelope(a) * t;
    const x = cx + Math.cos(a) * rr * 0.96;
    const y = cy + Math.sin(a) * rr;

    const nx = (x - cx) / R;
    const ny = (y - cy) / R;
    const lit = 0.5 - (nx * 0.52 + ny * 0.72) * 0.55 + (rnd() - 0.5) * 0.4;
    const col = lit > 0.58 ? palette.light : lit > 0.3 ? palette.mid : palette.dark;

    g.globalAlpha = 0.18 + rnd() * 0.40;
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, R * (0.022 + rnd() * 0.042), 0, TAU);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  if (hasFilter(g)) g.filter = 'none';

  // 整体再压一层方向性明暗
  g.globalCompositeOperation = 'source-atop';
  const shade = g.createRadialGradient(
    cx + R * 0.8, cy + R * 0.9, R * 0.1,
    cx + R * 0.45, cy + R * 0.55, R * 1.5
  );
  shade.addColorStop(0, 'rgba(30, 40, 12, 0.38)');
  shade.addColorStop(0.65, 'rgba(30, 40, 12, 0.10)');
  shade.addColorStop(1, 'rgba(32, 44, 14, 0)');
  g.fillStyle = shade;
  g.fillRect(0, 0, S, S);

  const light = g.createRadialGradient(
    cx - R * 0.45, cy - R * 0.5, R * 0.04,
    cx - R * 0.35, cy - R * 0.4, R * 1.05
  );
  light.addColorStop(0, 'rgba(214, 226, 158, 0.34)');
  light.addColorStop(1, 'rgba(214, 226, 158, 0)');
  g.fillStyle = light;
  g.fillRect(0, 0, S, S);

  g.globalCompositeOperation = 'source-over';
  if (hasFilter(g)) g.filter = 'none';
  return c;
}

/**
 * 树的投影：直接把树冠轮廓缩小、模糊、染成褐色 —— 影子形状和树冠一致，
 * 比「一个椭圆」真实得多。
 */
export function makeShadowFromCanopy(src) {
  const S = 128;
  const c = canvas(S);
  const g = c.getContext('2d');
  if (hasFilter(g)) g.filter = 'blur(5px)';
  g.drawImage(src, 0, 0, S, S);
  if (hasFilter(g)) g.filter = 'none';
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = 'rgba(120, 58, 22, 0.66)';
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  return c;
}

/** 软椭圆影子（车、云用） */
export function makeShadowTexture() {
  const S = 128;
  const c = canvas(S);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(70, 26, 6, 0.52)');
  grd.addColorStop(0.5, 'rgba(70, 26, 6, 0.36)');
  grd.addColorStop(0.8, 'rgba(70, 26, 6, 0.10)');
  grd.addColorStop(1, 'rgba(78, 30, 8, 0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return c;
}

/** 俯视小汽车（车头朝上） */
export function makeCarTexture(bodyColor = '#F7F6F2') {
  const W = 96;
  const H = 168;
  const c = canvas(W, H);
  const g = c.getContext('2d');

  const round = (x, y, w, h, r) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };

  // 车影
  if (hasFilter(g)) g.filter = 'blur(7px)';
  g.fillStyle = 'rgba(70, 28, 8, 0.34)';
  round(22, 30, 54, 118, 22);
  g.fill();
  if (hasFilter(g)) g.filter = 'none';

  // 车身
  g.fillStyle = bodyColor;
  round(20, 20, 56, 128, 20);
  g.fill();
  // 车头高光
  const bg = g.createLinearGradient(20, 20, 76, 148);
  bg.addColorStop(0, 'rgba(255,255,255,0.85)');
  bg.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  bg.addColorStop(1, 'rgba(120,110,100,0.18)');
  g.fillStyle = bg;
  round(20, 20, 56, 128, 20);
  g.fill();

  // 前挡 / 后窗 / 车顶
  g.fillStyle = '#4E626C';
  round(28, 44, 40, 26, 9);
  g.fill();
  g.fillStyle = '#525F66';
  round(28, 100, 40, 24, 9);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  round(31, 47, 34, 8, 4);
  g.fill();

  return c;
}

// 飞机贴图默认从视频里抠出来的素材（assets/plane.png）加载；
// 万一加载失败，退回下面这段程序化画法。
let planeSource = null;
export function setPlaneSource(img) {
  planeSource = img;
}

export function makePlaneTexture() {
  if (planeSource) {
    const S = 256;
    const c = canvas(S);
    c.getContext('2d').drawImage(planeSource, 0, 0, S, S);
    return c;
  }
  return makePlaneTextureFallback();
}

function makePlaneTextureFallback() {
  const S = 256;
  const c = canvas(S);
  const g = c.getContext('2d');
  const cx = S / 2;
  const body = '#FAF8F3';
  const edge = 'rgba(120,110,92,0.55)';

  // 主翼（后掠）
  for (const sgn of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + sgn * 20, 104);
    g.lineTo(cx + sgn * 116, 158);
    g.lineTo(cx + sgn * 112, 176);
    g.lineTo(cx + sgn * 18, 140);
    g.closePath();
    g.fillStyle = body;
    g.fill();
    g.strokeStyle = edge;
    g.lineWidth = 1.6;
    g.stroke();
  }

  // 平尾
  for (const sgn of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + sgn * 12, 192);
    g.lineTo(cx + sgn * 56, 214);
    g.lineTo(cx + sgn * 54, 226);
    g.lineTo(cx + sgn * 10, 206);
    g.closePath();
    g.fillStyle = body;
    g.fill();
    g.strokeStyle = edge;
    g.stroke();
  }

  // 机身
  g.beginPath();
  g.moveTo(cx, 32);
  g.quadraticCurveTo(cx + 21, 66, cx + 20, 130);
  g.quadraticCurveTo(cx + 18, 192, cx + 9, 216);
  g.lineTo(cx - 9, 216);
  g.quadraticCurveTo(cx - 18, 192, cx - 20, 130);
  g.quadraticCurveTo(cx - 21, 66, cx, 32);
  g.closePath();
  g.fillStyle = body;
  g.fill();
  g.strokeStyle = edge;
  g.lineWidth = 2;
  g.stroke();

  // 机身侧面的明暗，给一点体积
  g.fillStyle = 'rgba(150,140,122,0.28)';
  g.beginPath();
  g.moveTo(cx + 8, 44);
  g.quadraticCurveTo(cx + 19, 96, cx + 15, 190);
  g.lineTo(cx + 9, 214);
  g.lineTo(cx + 18, 200);
  g.quadraticCurveTo(cx + 20, 110, cx + 8, 44);
  g.closePath();
  g.fill();

  // 座舱
  g.fillStyle = '#4C606B';
  g.beginPath();
  g.ellipse(cx, 68, 9, 16, 0, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath();
  g.ellipse(cx - 3, 63, 4, 7, -0.3, 0, TAU);
  g.fill();

  // 机翼上的引擎
  g.fillStyle = '#E4DED2';
  for (const sgn of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + sgn * 58, 134, 9, 15, sgn * 0.28, 0, TAU);
    g.fill();
    g.strokeStyle = edge;
    g.lineWidth = 1.2;
    g.stroke();
  }

  // 尾翼
  g.fillStyle = '#EFEAE0';
  g.beginPath();
  g.moveTo(cx - 3, 196);
  g.lineTo(cx + 3, 196);
  g.lineTo(cx + 2, 226);
  g.lineTo(cx - 2, 226);
  g.closePath();
  g.fill();

  return c;
}

/** 俯视牛（头朝上） */
export function makeCowTexture() {
  const S = 128;
  const c = canvas(S);
  const g = c.getContext('2d');
  const cx = S / 2;
  const line = 'rgba(86, 70, 52, 0.42)';

  // 四条腿（露在身体两侧）
  g.fillStyle = '#E9E1D2';
  for (const [lx, ly] of [[-20, 44], [20, 44], [-20, 96], [20, 96]]) {
    g.beginPath();
    g.ellipse(cx + lx, ly, 5, 9, 0, 0, TAU);
    g.fill();
  }

  // 身体
  g.beginPath();
  g.ellipse(cx, 70, 27, 41, 0, 0, TAU);
  g.fillStyle = '#F7F3EA';
  g.fill();
  g.strokeStyle = line;
  g.lineWidth = 1.6;
  g.stroke();

  // 花斑
  g.fillStyle = '#3B322A';
  g.beginPath();
  g.ellipse(cx - 11, 60, 11, 14, 0.4, 0, TAU);
  g.fill();
  g.beginPath();
  g.ellipse(cx + 11, 84, 10, 13, -0.3, 0, TAU);
  g.fill();
  g.beginPath();
  g.ellipse(cx + 3, 46, 6, 8, 0.2, 0, TAU);
  g.fill();

  // 背部的明暗
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createRadialGradient(cx + 16, 88, 4, cx + 12, 80, 48);
  sh.addColorStop(0, 'rgba(120, 100, 74, 0.22)');
  sh.addColorStop(1, 'rgba(120, 100, 74, 0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';

  // 头
  g.beginPath();
  g.ellipse(cx, 24, 13, 15, 0, 0, TAU);
  g.fillStyle = '#F1EADC';
  g.fill();
  g.strokeStyle = line;
  g.stroke();
  // 耳朵
  g.fillStyle = '#3B322A';
  for (const sgn of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + sgn * 13, 20, 5, 3.5, sgn * 0.5, 0, TAU);
    g.fill();
  }
  // 口鼻
  g.beginPath();
  g.ellipse(cx, 16, 7, 6, 0, 0, TAU);
  g.fillStyle = '#C9B49A';
  g.fill();

  // 尾巴
  g.strokeStyle = '#8B7A63';
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(cx, 110);
  g.quadraticCurveTo(cx + 5, 118, cx + 2, 124);
  g.stroke();

  return c;
}

/** 俯视羊（头朝上） */
export function makeSheepTexture() {
  const S = 128;
  const c = canvas(S);
  const g = c.getContext('2d');
  const cx = S / 2;
  const line = 'rgba(120, 108, 88, 0.40)';

  // 四条小腿
  g.fillStyle = '#5A5145';
  for (const [lx, ly] of [[-13, 44], [13, 44], [-13, 98], [13, 98]]) {
    g.beginPath();
    g.ellipse(cx + lx, ly, 3.5, 6, 0, 0, TAU);
    g.fill();
  }

  // 羊毛：一圈小圆
  g.fillStyle = '#F6F3EA';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * 15, 72 + Math.sin(a) * 25, 12, 12, 0, 0, TAU);
    g.fill();
  }
  g.beginPath();
  g.ellipse(cx, 72, 23, 33, 0, 0, TAU);
  g.fill();

  // 毛的暗部
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createRadialGradient(cx + 15, 92, 3, cx + 10, 84, 46);
  sh.addColorStop(0, 'rgba(150, 138, 116, 0.30)');
  sh.addColorStop(1, 'rgba(150, 138, 116, 0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';

  // 头
  g.beginPath();
  g.ellipse(cx, 30, 10, 12, 0, 0, TAU);
  g.fillStyle = '#4A4238';
  g.fill();
  g.beginPath();
  g.ellipse(cx, 22, 6, 6, 0, 0, TAU);
  g.fillStyle = '#6E6456';
  g.fill();
  // 耳朵
  g.fillStyle = '#4A4238';
  for (const sgn of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + sgn * 10, 26, 4.5, 3, sgn * 0.6, 0, TAU);
    g.fill();
  }

  return c;
}

function mulberry32Lite(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
