// 叠加图：房子周围夯实的土院子、菜园、通往路边的小径。画在 canvas 上，烘焙时混进地面颜色，
// 再一起打光、一起油画化，所以院子和草地的过渡是「画」出来的。
import { LOOP, WORLD_W } from './config.js';
import { curveDist, curveX } from './curves.js';

const PPU = 4;

export function drawOverlay(houses, cfg, rnd) {
  const W = WORLD_W * PPU;
  const H = LOOP * PPU;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const O = cfg.overlay ?? {};
  const yard = O.yard ?? '#d9c79c';
  const soil = O.soil ?? '#9c7650';
  const crop = O.crop ?? '#4f8a3a';
  const path = O.path ?? '#d5c296';
  if (typeof g.filter === 'string') g.filter = 'blur(1.4px)';

  const X = (x) => (x + WORLD_W / 2) * PPU;
  const Y = (z) => (z + LOOP / 2) * PPU;

  for (const o of houses) {
    const draws = [0];
    if (o.z < -LOOP / 2 + 12) draws.push(LOOP);
    if (o.z > LOOP / 2 - 12) draws.push(-LOOP);
    for (const dz of draws) {
      const cx = X(o.x), cy = Y(o.z + dz);
      g.save();
      g.translate(cx, cy);
      g.rotate(-o.rot);
      g.globalAlpha = 0.92;
      g.fillStyle = yard;
      g.beginPath();
      g.roundRect(-(o.w / 2 + 1.4) * PPU, -(o.d / 2 + 1.6) * PPU, (o.w + 2.8) * PPU, (o.d + 3.2) * PPU, 1.4 * PPU);
      g.fill();
      if (o.garden) {
        const gx = (o.w / 2 + 1.6) * PPU;
        const gw = (2.4 + rnd() * 1.6) * PPU;
        const gh = (o.d + 1.2) * PPU;
        g.fillStyle = soil;
        g.fillRect(gx, -gh / 2, gw, gh);
        g.fillStyle = crop;
        for (let y = -gh / 2 + PPU * 0.3; y < gh / 2 - PPU * 0.3; y += PPU * 0.9) {
          g.fillRect(gx + PPU * 0.2, y, gw - PPU * 0.4, PPU * 0.45);
        }
      }
      g.restore();

      // 小径：从门口斜着走到最近的路
      let best = null;
      for (const ci of cfg.houses?.roads ?? []) {
        const cd = curveDist(cfg.curves[ci], o.x, o.z);
        if (!best || Math.abs(cd.d) < Math.abs(best.d)) best = { ...cd, ci };
      }
      if (best && Math.abs(best.d) < 16) {
        const tx = curveX(cfg.curves[best.ci], best.z);
        g.globalAlpha = 0.85;
        g.strokeStyle = path;
        g.lineWidth = 1.1 * PPU;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx, cy);
        const mx = (cx + X(tx)) / 2 + (rnd() - 0.5) * 3 * PPU;
        const my = (cy + Y(best.z + dz)) / 2 + (rnd() - 0.5) * 3 * PPU;
        g.quadraticCurveTo(mx, my, X(tx), Y(best.z + dz));
        g.stroke();
      }
    }
  }
  g.globalAlpha = 1;
  if (typeof g.filter === 'string') g.filter = 'none';
  return c;
}
