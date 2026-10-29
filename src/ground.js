// 地面：一张长条贴图（直接用世界坐标画）。镜头一路向北推进，地图整体向下卷。
// 坐标：x ∈ [-wu/2, wu/2]，z ∈ [-hu/2, hu/2]；所有尺寸都用世界单位，
// 这样「树 5.5、路 5、车 3.5」这类比例可以直接对着参考画面调。

const TAU = Math.PI * 2;

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hasFilter(ctx) {
  return typeof ctx.filter === 'string';
}

function trace(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function softStroke(g, pts, width, color, alpha = 1, feather = 1.8, layers = 3) {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = color;
  for (let i = layers; i >= 1; i--) {
    const t = i / layers;
    g.globalAlpha = alpha * (0.12 + 0.88 * (1 - t) ** 1.6);
    g.lineWidth = width * (1 + (feather - 1) * t);
    trace(g, pts);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();
}

function blob(g, x, y, r, color, alpha) {
  const grd = g.createRadialGradient(x, y, r * 0.02, x, y, r);
  grd.addColorStop(0, color);
  grd.addColorStop(0.4, color);
  grd.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  g.globalAlpha = alpha;
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}

function paintSpeckle(g, W, H, rnd, color, count, aMin, aMax, rMax) {
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    g.globalAlpha = aMin + rnd() * (aMax - aMin);
    g.beginPath();
    g.arc(rnd() * W, rnd() * H, 0.4 + rnd() * rMax, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}

function paintStreaks(g, env, rnd, angle, color, count, alpha) {
  const { W, H, L } = env;
  const span = (W + H) * 0.75;
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(angle);
  g.lineCap = 'round';
  g.strokeStyle = color;
  for (let i = 0; i < count; i++) {
    const x = (rnd() - 0.5) * span;
    const y = (rnd() - 0.5) * span;
    const len = L(1.2 + rnd() * 7);
    const bend = (rnd() - 0.5) * len * 0.2;
    g.globalAlpha = alpha * (0.35 + rnd() * 0.65);
    g.lineWidth = 0.7 + rnd() * 2.2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len * 0.5, y + bend, x + len, y + bend * 0.35);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();
}

function paintBrushes(g, env, rnd, P, count, wMin, wMax, lMin, lMax, aMin, aMax) {
  const { W, H, L } = env;
  const angleBase = P.windAngle ?? -0.38;
  g.save();
  g.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const ang = angleBase + (rnd() - 0.5) * 1.15;
    const len = L(lMin + rnd() * (lMax - lMin));
    g.globalAlpha = aMin + rnd() * (aMax - aMin);
    g.strokeStyle = rnd() > 0.5
      ? P.patch[(rnd() * P.patch.length) | 0]
      : P.mottle[(rnd() * P.mottle.length) | 0];
    g.lineWidth = wMin + rnd() * (wMax - wMin);
    const bend = (rnd() - 0.5) * len * 0.35;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + Math.cos(ang) * len * 0.5 - Math.sin(ang) * bend,
      y + Math.sin(ang) * len * 0.5 + Math.cos(ang) * bend,
      x + Math.cos(ang) * len,
      y + Math.sin(ang) * len
    );
    g.stroke();
  }
  g.restore();
}

function paintBase(g, env, rnd, cfg) {
  const { W, H, L } = env;
  const pick = (arr) => arr[(rnd() * arr.length) | 0];
  const P = cfg.paint;

  g.fillStyle = P.base;
  g.fillRect(0, 0, W, H);

  for (let i = 0; i < 80; i++) {
    blob(g, rnd() * W, rnd() * H, L(6 + rnd() * 12),
      rgba(pick(rnd() > 0.45 ? P.mottle : P.patch), 0.9), 0.16 + rnd() * 0.24);
  }
  for (let i = 0; i < 420; i++) {
    blob(g, rnd() * W, rnd() * H, L(1.5 + rnd() * 6),
      rgba(pick(rnd() > 0.42 ? P.mottle : P.patch), 0.9), 0.14 + rnd() * 0.26);
  }
  for (let i = 0; i < 520; i++) {
    blob(g, rnd() * W, rnd() * H, L(0.5 + rnd() * 2.4),
      rgba(pick(P.patch), 0.9), 0.08 + rnd() * 0.16);
  }
  for (let i = 0; i < 70; i++) {
    blob(g, rnd() * W, rnd() * H, L(1.4 + rnd() * 5.5),
      rgba(P.highlight ?? '#FFC37A', 0.9), 0.10 + rnd() * 0.16);
  }

  paintStreaks(g, env, rnd, P.windAngle ?? -0.38, P.streak, 1400, 0.10);
  paintBrushes(g, env, rnd, P, 17000, 0.5, 2.2, 1.5, 9, 0.08, 0.22);
  paintBrushes(g, env, rnd, P, 220, 1.4, 3.6, 6, 22, 0.03, 0.07);

  paintSpeckle(g, W, H, rnd, rgba(P.speck ?? '#B8460E', 1), 60000, 0.08, 0.26, 0.34);
  // 贴图级别的细小植被：远看就是一层颗粒
  const bushCol = P.bush ?? '#4A5A25';
  const bushShadow = P.bushShadow ?? '#8A3E12';
  for (let i = 0; i < 6400; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 0.8 + rnd() * rnd() * 4.2;
    g.globalAlpha = 0.10 + rnd() * 0.20;
    g.fillStyle = rgba(bushShadow, 1);
    g.beginPath();
    g.ellipse(x + r * 0.55, y + r * 0.6, r * 1.2, r * 0.95, rnd(), 0, TAU);
    g.fill();
    g.globalAlpha = 0.16 + rnd() * 0.40;
    g.fillStyle = rgba(rnd() > 0.75 ? P.bushAlt ?? bushCol : bushCol, 1);
    g.beginPath();
    g.ellipse(x, y, r * (0.8 + rnd() * 0.4), r * (0.7 + rnd() * 0.4), rnd() * 3, 0, TAU);
    g.fill();
  }
  for (let i = 0; i < 1800; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 2.6 + rnd() * 5.5;
    g.globalAlpha = 0.10 + rnd() * 0.18;
    g.fillStyle = rgba(bushShadow, 1);
    g.beginPath();
    g.ellipse(x + r * 0.45, y + r * 0.5, r * 1.1, r * 0.9, 0, 0, TAU);
    g.fill();
    g.globalAlpha = 0.12 + rnd() * 0.26;
    g.fillStyle = rgba(bushCol, 1);
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  paintSpeckle(g, W, H, rnd, rgba(P.highlight ?? '#FFC37A', 1), 22000, 0.05, 0.16, 0.28);
}

/* ------------------------------- 赤土荒野 ------------------------------- */

export function paintDesert(g, env, rnd, cfg) {
  const { hu, X, Z, L } = env;
  const blockers = [];
  const lo = -hu / 2 - 12;
  const hi = hu / 2 + 12;

  // 公路
  const roadWpts = [];
  for (let z = lo; z <= hi; z += 1.2) {
    roadWpts.push([-4 + 1.1 * Math.sin(z * 0.05) + 0.5 * Math.sin(z * 0.127 + 1.1), z]);
  }
  const road = roadWpts.map(([x, z]) => [X(x), Z(z)]);
  const roadW = L(5.0);

  softStroke(g, road, roadW * 1.45, rgba('#FBD9A4', 1), 0.14, 1.9);
  softStroke(g, road, roadW * 1.06, rgba('#F9CE9A', 1), 0.9, 1.06);
  softStroke(g, road, roadW, rgba('#FBD4A2', 1), 0.98, 1.0, 2);

  g.save();
  g.globalAlpha = 0.16;
  g.lineCap = 'round';
  for (let i = 0; i < 1600; i++) {
    const p = road[(rnd() * road.length) | 0];
    g.strokeStyle = rnd() > 0.45 ? '#D3914F' : '#FFDEAF';
    g.lineWidth = 0.8 + rnd() * 2.2;
    const x = p[0] + (rnd() - 0.5) * roadW * 0.92;
    g.beginPath();
    g.moveTo(x, p[1]);
    g.lineTo(x + (rnd() - 0.5) * 2, p[1] + L(0.3 + rnd() * 1.2));
    g.stroke();
  }
  g.restore();

  g.save();
  g.fillStyle = rgba('#F9CF95', 1);
  for (let i = 0; i < 3000; i++) {
    const p = road[(rnd() * road.length) | 0];
    const side = rnd() > 0.5 ? 1 : -1;
    g.globalAlpha = 0.06 + rnd() * 0.2;
    g.beginPath();
    g.arc(p[0] + side * roadW * (0.52 + rnd() * 0.35), p[1] + (rnd() - 0.5) * 4,
      0.5 + rnd() * 1.5, 0, TAU);
    g.fill();
  }
  g.restore();
  blockers.push({ pts: roadWpts, width: roadW / L(1) });

  // 土路
  const trackWpts = [];
  for (let z = lo; z <= hi; z += 1.0) {
    trackWpts.push([21 + 7.5 * Math.sin(z * 0.037 + 0.6) + 3.2 * Math.sin(z * 0.091 + 2.1), z]);
  }
  const track = trackWpts.map(([x, z]) => [X(x), Z(z)]);
  const trackW = L(5.2);

  softStroke(g, track, trackW * 1.5, rgba('#FBDCAE', 1), 0.15, 2.1);
  softStroke(g, track, trackW * 1.06, rgba('#F6D2A2', 1), 0.8, 1.2);
  softStroke(g, track, trackW, rgba('#EFC998', 1), 0.97, 1.02, 2);

  g.save();
  g.lineCap = 'round';
  g.strokeStyle = rgba('#D8A46E', 1);
  for (const off of [-0.28, 0.28]) {
    g.globalAlpha = 0.4;
    g.lineWidth = L(0.32);
    g.beginPath();
    track.forEach((p, i) => {
      const a = track[Math.max(0, i - 1)];
      const b = track[Math.min(track.length - 1, i + 1)];
      const nx = b[1] - a[1];
      const ny = -(b[0] - a[0]);
      const l = Math.hypot(nx, ny) || 1;
      const x = p[0] + (nx / l) * trackW * off;
      const y = p[1] + (ny / l) * trackW * off;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
  }
  g.restore();

  g.save();
  for (let i = 0; i < track.length; i += 2) {
    const p = track[i];
    g.globalAlpha = 0.05 + rnd() * 0.08;
    g.fillStyle = '#C06B26';
    g.beginPath();
    g.arc(p[0] + (rnd() - 0.5) * trackW * 3, p[1] + (rnd() - 0.5) * trackW * 3,
      trackW * (0.3 + rnd() * 0.8), 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = rgba('#B85E1E', 1);
  for (let i = 0; i < 3200; i++) {
    const p = track[(rnd() * track.length) | 0];
    g.globalAlpha = 0.08 + rnd() * 0.24;
    g.beginPath();
    g.arc(p[0] + (rnd() - 0.5) * trackW * 3, p[1] + (rnd() - 0.5) * trackW * 3,
      0.4 + rnd() * 1.2, 0, TAU);
    g.fill();
  }
  g.restore();
  g.globalAlpha = 1;
  blockers.push({ pts: trackWpts, width: trackW / L(1) });

  paintSpeckle(g, env.W, env.H, rnd, rgba('#B44C12', 1), 9000, 0.04, 0.18, 0.85);

  return { road: roadWpts, track: trackWpts, blockers };
}

/* ------------------------------- 草原河流 ------------------------------- */
// 亮黄绿的草甸 + 深青的河 + 一圈沙岸 + 河石
export function paintRiver(g, env, rnd, cfg) {
  const { W, H, hu, X, Z, L } = env;
  const blockers = [];
  const lo = -hu / 2 - 12;
  const hi = hu / 2 + 12;

  // 左边一条土路
  const roadWpts = [];
  for (let z = lo; z <= hi; z += 1.2) {
    roadWpts.push([-22 + 4 * Math.sin(z * 0.04) + 1.6 * Math.sin(z * 0.1 + 0.7), z]);
  }
  const road = roadWpts.map(([x, z]) => [X(x), Z(z)]);
  softStroke(g, road, L(4.4), rgba('#F0DEA8', 1), 0.5, 1.6);
  softStroke(g, road, L(3.2), rgba('#E8D296', 1), 0.95, 1.05, 2);
  g.save();
  g.fillStyle = rgba('#C9A86A', 1);
  for (let i = 0; i < 1500; i++) {
    const p = road[(rnd() * road.length) | 0];
    g.globalAlpha = 0.06 + rnd() * 0.18;
    g.beginPath();
    g.arc(p[0] + (rnd() - 0.5) * L(4), p[1] + (rnd() - 0.5) * L(4), 0.4 + rnd() * 1.1, 0, TAU);
    g.fill();
  }
  g.restore();
  g.globalAlpha = 1;
  blockers.push({ pts: roadWpts, width: L(2.6) / L(1) });

  // 河：深青的水 + 两圈沙岸
  const riverWpts = [];
  for (let z = lo; z <= hi; z += 1.0) {
    riverWpts.push([8 + 17 * Math.sin(z * 0.023) + 6 * Math.sin(z * 0.058 + 0.9), z]);
  }
  const river = riverWpts.map(([x, z]) => [X(x), Z(z)]);
  const w = L(8.5);

  softStroke(g, river, w * 2.3, rgba('#EFE2B4', 1), 0.75, 1.5);
  softStroke(g, river, w * 1.35, rgba('#F7F0D2', 1), 0.9, 1.15);
  softStroke(g, river, w * 1.06, rgba('#7FD2C8', 1), 0.55, 1.05);
  softStroke(g, river, w, rgba('#2E96A6', 1), 0.97, 1.02, 2);
  softStroke(g, river, w * 0.5, rgba('#1C6C7E', 1), 0.5, 1.25);

  // 水面碎光
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = rgba('#D8F4EE', 1);
  for (let i = 0; i < 420; i++) {
    const p = river[(rnd() * river.length) | 0];
    g.globalAlpha = 0.12 + rnd() * 0.34;
    g.lineWidth = 0.7 + rnd() * 1.8;
    const off = (rnd() - 0.5) * w * 0.85;
    g.beginPath();
    g.moveTo(p[0] + off, p[1]);
    g.quadraticCurveTo(p[0] + off + 8, p[1] - 3, p[0] + off + 15 + rnd() * 12, p[1] + 1);
    g.stroke();
  }
  g.restore();

  // 河石：白/灰的小块
  for (let i = 0; i < 200; i++) {
    const p = river[(rnd() * river.length) | 0];
    const off = (rnd() - 0.5) * w * 1.5;
    const r = L(0.5 + rnd() * 1.1);
    g.globalAlpha = 0.55 + rnd() * 0.4;
    g.fillStyle = rnd() > 0.4 ? '#F2F1EC' : '#BFC0BC';
    g.beginPath();
    g.ellipse(p[0] + off, p[1] + (rnd() - 0.5) * L(3), r, r * (0.6 + rnd() * 0.5), rnd(), 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;

  blockers.push({ pts: riverWpts, width: w / L(1) });

  // 草地里零散的白石头
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    g.globalAlpha = 0.4 + rnd() * 0.45;
    g.fillStyle = '#F4F3EE';
    g.beginPath();
    g.ellipse(x, y, L(0.25 + rnd() * 0.6), L(0.2 + rnd() * 0.45), rnd(), 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;

  // 河边成排的树（画进贴图，比实例化的更能贴着岸线长）
  const treeCol = '#2E6B2A';
  for (let i = 0; i < 900; i++) {
    const p = river[(rnd() * river.length) | 0];
    const side = rnd() > 0.5 ? 1 : -1;
    const off = side * w * (1.15 + rnd() * 0.9);
    const r = L(0.5 + rnd() * 1.4);
    g.globalAlpha = 0.55 + rnd() * 0.4;
    g.fillStyle = rnd() > 0.7 ? '#3E8033' : treeCol;
    g.beginPath();
    g.arc(p[0] + off, p[1] + (rnd() - 0.5) * L(4), r, 0, TAU);
    g.fill();
    g.globalAlpha = 0.25;
    g.fillStyle = '#8A4A18';
    g.beginPath();
    g.arc(p[0] + off + r * 0.5, p[1] + (rnd() - 0.5) * L(4) + r * 0.5, r * 0.9, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;

  paintSpeckle(g, W, H, rnd, rgba(cfg.paint.speck, 1), 6000, 0.05, 0.18, 0.8);

  return { road: roadWpts, track: riverWpts, blockers };
}

/* ------------------------------- 蓝金田野 ------------------------------- */
// 鲜黄 / 鲜蓝 / 绿的色块 + 田埂树篱 + 穿过田野的河 + 池塘 + 小房子
export function paintFields(g, env, rnd, cfg) {
  const { W, H, hu, X, Z, L } = env;
  const blockers = [];
  const palette = ['#FBDB1B', '#F2C21E', '#40A46D', '#59B87A', '#0590F7', '#2E9CE0', '#A9C58D', '#D9E05A'];

  g.save();
  g.beginPath();
  g.rect(0, 0, W, H);
  g.clip();
  g.translate(W / 2, H / 2);
  g.rotate(-0.09);
  let yAcc = -H;
  const hedge = [];
  while (yAcc < H) {
    const rowH = L(4.5 + rnd() * 5);
    const y = yAcc;
    yAcc += rowH;
    hedge.push(y);
    let x = -W;
    while (x < W) {
      const w = L(4 + rnd() * 11);
      g.fillStyle = palette[(rnd() * palette.length) | 0];
      g.globalAlpha = 1;
      g.fillRect(x, y, w - L(0.25), rowH - L(0.25));
      // 垄沟
      g.globalAlpha = 0.10;
      g.strokeStyle = '#1E4A18';
      g.lineWidth = 1;
      g.beginPath();
      for (let sx = x + 4; sx < x + w; sx += L(1.1)) {
        g.moveTo(sx, y + 2);
        g.lineTo(sx, y + rowH - 2);
      }
      g.stroke();
      x += w;
    }
  }
  // 田埂树篱：深绿带 + 一排小树
  g.globalAlpha = 0.7;
  g.strokeStyle = '#2E6B2A';
  g.lineWidth = L(0.7);
  for (const y of hedge) {
    g.beginPath();
    g.moveTo(-W, y);
    g.lineTo(W, y);
    g.stroke();
    for (let x = -W; x < W; x += L(2.2 + rnd() * 2.6)) {
      const r = L(0.55 + rnd() * 0.9);
      g.globalAlpha = 0.85;
      g.fillStyle = '#2E6B2A';
      g.beginPath();
      g.arc(x + (rnd() - 0.5) * L(1.5), y + (rnd() - 0.5) * L(0.6), r, 0, TAU);
      g.fill();
    }
  }
  g.restore();
  g.globalAlpha = 1;

  // 穿过田野的河
  const riverWpts = [];
  for (let z = -hu / 2 - 12; z <= hu / 2 + 12; z += 1.0) {
    riverWpts.push([22 + 12 * Math.sin(z * 0.021 + 1.4) + 5 * Math.sin(z * 0.05), z]);
  }
  const river = riverWpts.map(([x, z]) => [X(x), Z(z)]);
  const w = L(7);
  softStroke(g, river, w * 1.9, rgba('#EFE2B4', 1), 0.7, 1.4);
  softStroke(g, river, w * 1.2, rgba('#F7F0D2', 1), 0.85, 1.1);
  softStroke(g, river, w, rgba('#2E86C8', 1), 0.97, 1.02, 2);
  softStroke(g, river, w * 0.55, rgba('#0B5580', 1), 0.5, 1.2);
  blockers.push({ pts: riverWpts, width: w / L(1) });

  // 田间小路
  const roadWpts = [];
  for (let z = -hu / 2 - 12; z <= hu / 2 + 12; z += 1.2) {
    roadWpts.push([-24 + 6 * Math.sin(z * 0.038) + 2.2 * Math.sin(z * 0.09 + 0.5), z]);
  }
  const road = roadWpts.map(([x, z]) => [X(x), Z(z)]);
  softStroke(g, road, L(3.6), rgba('#F2E4C2', 1), 0.5, 1.5);
  softStroke(g, road, L(2.2), rgba('#EADCB6', 1), 0.95, 1.05, 2);
  blockers.push({ pts: roadWpts, width: L(2.6) / L(1) });

  // 池塘
  for (let i = 0; i < 7; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const rx = L(2 + rnd() * 5);
    const ry = rx * (0.5 + rnd() * 0.6);
    g.globalAlpha = 0.95;
    g.fillStyle = '#0B5580';
    g.beginPath();
    g.ellipse(x, y, rx, ry, rnd() * 3, 0, TAU);
    g.fill();
    g.globalAlpha = 0.5;
    g.fillStyle = '#3FB9E8';
    g.beginPath();
    g.ellipse(x, y, rx * 0.8, ry * 0.8, rnd() * 3, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;

  // 小白房子
  for (let i = 0; i < 40; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const s = L(1.1);
    g.globalAlpha = 0.35;
    g.fillStyle = '#4A3A22';
    g.fillRect(x + s * 0.25, y + s * 0.3, s, s * 0.7);
    g.globalAlpha = 1;
    g.fillStyle = '#FAF7F0';
    g.fillRect(x, y, s, s * 0.7);
    g.fillStyle = '#C0552E';
    g.fillRect(x, y, s, s * 0.28);
  }

  paintSpeckle(g, W, H, rnd, rgba(cfg.paint.speck, 1), 4000, 0.05, 0.16, 0.7);

  return { road: roadWpts, track: riverWpts, blockers };
}

/* ------------------------------- 碧海沙洲 ------------------------------- */
// 海与沙交错：几条潮水水道 + 一堆潟湖，中间夹着被潮水磨圆的沙洲
export function paintSea(g, env, rnd, cfg) {
  const { W, H, hu, X, Z, L } = env;
  const blockers = [];
  const waterShapes = [];
  const lo = -hu / 2 - 12;
  const hi = hu / 2 + 12;

  // 一段水面：浅滩环 → 主体 → 深槽 → 浪花
  function waterBand(xAt, wUnits, deepColor) {
    const wpts = [];
    for (let z = lo; z <= hi; z += 1.0) wpts.push([xAt(z), z]);
    const pts = wpts.map(([x, z]) => [X(x), Z(z)]);
    const w = L(wUnits);
    softStroke(g, pts, w * 2.0, rgba('#DCF0E2', 1), 0.55, 1.5);      // 湿沙/浅滩
    softStroke(g, pts, w * 1.22, rgba('#A8E6DA', 1), 0.8, 1.15);     // 浅水
    softStroke(g, pts, w, rgba('#5FD6D2', 1), 0.95, 1.02, 2);        // 水体
    softStroke(g, pts, w * 0.48, rgba(deepColor, 1), 0.5, 1.2);      // 深槽
    // 浪花
    g.save();
    g.strokeStyle = rgba('#FFFFFF', 1);
    g.lineCap = 'round';
    for (let i = 0; i < 420; i++) {
      const p = pts[(rnd() * pts.length) | 0];
      g.globalAlpha = 0.12 + rnd() * 0.45;
      g.lineWidth = 0.8 + rnd() * 2.2;
      g.beginPath();
      g.arc(p[0] + (rnd() - 0.5) * w * 2, p[1] + (rnd() - 0.5) * w * 2,
        L(0.3 + rnd() * 1.2), 0, Math.PI * (0.6 + rnd() * 0.7));
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
    waterShapes.push({ pts: wpts, half: wUnits * 0.85 });
  }

  // 三条水道交错
  waterBand((z) => 24 + 13 * Math.sin(z * 0.026 + 0.4) + 5 * Math.sin(z * 0.062 + 2.0), 7.5, '#1480A2');
  waterBand((z) => -6 + 14 * Math.sin(z * 0.019 + 2.6) + 6 * Math.sin(z * 0.049), 6.0, '#1E86B4');
  waterBand((z) => 40 + 9 * Math.sin(z * 0.031 + 4.1) + 4 * Math.sin(z * 0.071 + 1.2), 5.0, '#1480A2');

  // 潟湖：水面 + 环状浅滩
  for (let i = 0; i < 16; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const rx = L(2.5 + rnd() * 7);
    const ry = rx * (0.5 + rnd() * 0.5);
    g.globalAlpha = 0.5;
    g.fillStyle = '#CFF0E4';
    g.beginPath();
    g.ellipse(x, y, rx * 1.4, ry * 1.35, 0, 0, TAU);
    g.fill();
    g.globalAlpha = 0.9;
    g.fillStyle = '#6FDCD4';
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, TAU);
    g.fill();
    g.globalAlpha = 0.55;
    g.fillStyle = '#1E86B4';
    g.beginPath();
    g.ellipse(x, y, rx * 0.6, ry * 0.6, 0, 0, TAU);
    g.fill();
    g.globalAlpha = 0.5;
    g.strokeStyle = '#FFFFFF';
    g.lineWidth = L(0.4);
    g.beginPath();
    g.ellipse(x, y, rx * 1.05, ry * 1.05, 0, 0, TAU);
    g.stroke();
    waterShapes.push({ pool: [x, y, rx * 1.45, ry * 1.4] });
  }
  g.globalAlpha = 1;

  // 沙洲上的潮痕：一层层细细的弧线，像退潮留下的纹
  g.save();
  g.strokeStyle = rgba('#D8C79A', 1);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    g.globalAlpha = 0.08 + rnd() * 0.18;
    g.lineWidth = 0.7 + rnd() * 1.4;
    g.beginPath();
    g.arc(x, y, L(1 + rnd() * 5), Math.PI * (0.9 + rnd() * 0.4), Math.PI * (1.5 + rnd() * 0.5));
    g.stroke();
  }
  g.restore();
  g.globalAlpha = 1;

  // 小石头与贝壳
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    g.globalAlpha = 0.35 + rnd() * 0.4;
    g.fillStyle = rnd() > 0.5 ? '#F7F3E6' : '#CFC4A6';
    g.beginPath();
    g.ellipse(x, y, L(0.2 + rnd() * 0.5), L(0.15 + rnd() * 0.4), rnd(), 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;

  paintSpeckle(g, W, H, rnd, rgba(cfg.paint.speck, 1), 4000, 0.05, 0.16, 0.7);

  const exclude = (x, z) => {
    for (const sh of waterShapes) {
      if (sh.pool) {
        const [cx, cy, rx, ry] = sh.pool;
        const ux = (X(x) - cx) / rx;
        const uy = (Z(z) - cy) / ry;
        if (ux * ux + uy * uy < 1) return true;
      } else {
        let best = Infinity;
        for (let i = 1; i < sh.pts.length; i++) {
          const [ax, az] = sh.pts[i - 1];
          const [bx, bz] = sh.pts[i];
          const dx = bx - ax;
          const dz = bz - az;
          const l2 = dx * dx + dz * dz || 1;
          let t = ((x - ax) * dx + (z - az) * dz) / l2;
          t = Math.max(0, Math.min(1, t));
          const dd = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
          if (dd < best) best = dd;
        }
        if (best < sh.half) return true;
      }
    }
    return false;
  };

  return { road: null, track: waterShapes[0].pts, blockers, exclude };
}

/* ------------------------------- 组装 ------------------------------- */

export function buildGround(cfg, { wu = 100, hu = 232, ppu = 13 } = {}) {
  const rnd = mulberry32(cfg.seed ?? 7);
  const W = Math.round(wu * ppu);
  const H = Math.round(hu * ppu);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

  const env = {
    wu, hu, ppu, W, H,
    X: (x) => (x + wu / 2) * ppu,
    Z: (z) => (z + hu / 2) * ppu,
    L: (n) => n * ppu,
  };

  paintBase(g, env, rnd, cfg);
  const layout = cfg.features(g, env, rnd, cfg);

  for (let i = 0; i < 70; i++) {
    blob(g, rnd() * W, rnd() * H, env.L(3 + rnd() * 8),
      rgba(cfg.paint.mottle[(rnd() * cfg.paint.mottle.length) | 0], 0.9),
      0.05 + rnd() * 0.1);
  }

  if (hasFilter(g)) {
    const tmp = document.createElement('canvas');
    tmp.width = W;
    tmp.height = H;
    tmp.getContext('2d').drawImage(c, 0, 0);
    g.filter = 'blur(1.1px)';
    g.drawImage(tmp, 0, 0);
    g.filter = 'none';
  }

  // 让贴图上下无缝：顶带与底带互相渐变，到边界处完全一致 —— 这样镜头可以无限向北卷
  const band = Math.round(H * 0.11);
  const top = g.getImageData(0, 0, W, band);
  const bot = g.getImageData(0, H - band, W, band);
  for (let y = 0; y < band; y++) {
    const w = 0.5 * (1 - y / band);
    const yb = band - 1 - y;
    for (let x = 0; x < W; x++) {
      for (let ch = 0; ch < 3; ch++) {
        const i1 = (y * W + x) * 4 + ch;
        const i2 = (yb * W + x) * 4 + ch;
        const a = top.data[i1];
        const b = bot.data[i2];
        top.data[i1] = a * (1 - w) + b * w;
        bot.data[i2] = b * (1 - w) + a * w;
      }
    }
  }
  g.putImageData(top, 0, 0);
  g.putImageData(bot, 0, H - band);

  return { canvas: c, layout, wu, hu };
}

/** 抖动网格采样（世界单位）：树、灌木、牛羊共用 */
export function scatterPoints(rnd, { wu, hu, cell, prob = 1, blockers = [], exclude = null, margin = 0.5, wrap = 0 }) {
  const pts = [];
  const cols = Math.ceil(wu / cell);
  const rows = Math.ceil(hu / cell);

  const clearance = (x, z) => {
    let best = Infinity;
    for (const b of blockers) {
      const half = b.width * 0.5;
      for (let i = 1; i < b.pts.length; i++) {
        const [ax, az] = b.pts[i - 1];
        const [bx, bz] = b.pts[i];
        const dx = bx - ax;
        const dz = bz - az;
        const l2 = dx * dx + dz * dz || 1;
        let t = ((x - ax) * dx + (z - az) * dz) / l2;
        t = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)) - half);
      }
    }
    return best;
  };

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (rnd() > prob) continue;
      const x = -wu / 2 + (gx + 0.5 + (rnd() - 0.5) * 0.92) * cell;
      const z = -hu / 2 + (gy + 0.5 + (rnd() - 0.5) * 0.92) * cell;
      if (exclude && exclude(x, z)) continue;
      if (blockers.length && clearance(x, z) < cell * margin) continue;
      pts.push({ x, z });
      // 首尾各复制一段：整体平移一个周期时，边界处的分布也对得上
      if (wrap > 0) {
        if (z < -hu / 2 + wrap) pts.push({ x, z: z + hu });
        if (z > hu / 2 - wrap) pts.push({ x, z: z - hu });
      }
    }
  }
  return pts;
}
