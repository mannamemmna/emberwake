/**
 * Background: a deep cinder field with three parallax star layers, drifting
 * embers, a low heat glow, and the arena's glowing border. Deterministic so
 * screenshots are stable.
 */
import { VIEW_W, VIEW_H, ARENA, HUD_H } from './config.js';
import { hashNoise } from './rng.js';

const FIELD_H = VIEW_H - HUD_H;

// three star layers: far (tiny, slow), mid, near (bright, fast)
const STARS = (() => {
  const list = [];
  const layers = [
    { n: 130, seed: 301, rMin: 0.35, rMax: 0.85, drift: 3 },
    { n: 60, seed: 302, rMin: 0.7, rMax: 1.35, drift: 8 },
    { n: 26, seed: 303, rMin: 1.1, rMax: 2.0, drift: 16 },
  ];
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      list.push({
        x: hashNoise(L.seed, i * 7, 1) * VIEW_W,
        y: HUD_H + hashNoise(L.seed, 2, i * 7) * FIELD_H,
        r: L.rMin + hashNoise(L.seed + 1, i, i) * (L.rMax - L.rMin),
        tw: 0.5 + hashNoise(L.seed + 2, i * 3, i) * 2.2,
        drift: L.drift * (0.7 + hashNoise(L.seed + 3, i, 0) * 0.6),
        warm: hashNoise(L.seed + 4, i, 5) > 0.72,
      });
    }
  }
  return list;
})();

// ambient embers that drift upward, wrapping around
const EMBERS = (() => {
  const list = [];
  for (let i = 0; i < 64; i++) {
    list.push({
      x: hashNoise(201, i * 11, 0) * VIEW_W,
      y: HUD_H + hashNoise(201, 0, i * 11) * FIELD_H,
      r: 0.7 + hashNoise(202, i, 0) * 2.2,
      sp: 6 + hashNoise(203, i, 0) * 20,
      sway: hashNoise(204, i, 0) * Math.PI * 2,
      swaySp: 0.3 + hashNoise(205, i, 0) * 0.8,
    });
  }
  return list;
})();

// static dust motes, very faint, to give the field texture
const DUST = (() => {
  const list = [];
  for (let i = 0; i < 260; i++) {
    list.push({
      x: hashNoise(401, i * 3, 0) * VIEW_W,
      y: HUD_H + hashNoise(401, 0, i * 3) * FIELD_H,
      a: 0.03 + hashNoise(402, i, 0) * 0.09,
    });
  }
  return list;
})();

export function drawBackground(ctx, t, shakeX, shakeY) {
  // base: layered vertical depth
  const bg = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  bg.addColorStop(0, '#150a1c');
  bg.addColorStop(0.45, '#100714');
  bg.addColorStop(0.82, '#190c15');
  bg.addColorStop(1, '#241014');
  ctx.fillStyle = bg;
  ctx.fillRect(-20, -20, VIEW_W + 40, VIEW_H + 40);

  // heat glow rising from the bottom edge of the field
  const heat = ctx.createLinearGradient(0, VIEW_H, 0, VIEW_H - 300);
  heat.addColorStop(0, 'rgba(255,94,48,0.16)');
  heat.addColorStop(0.45, 'rgba(190,48,80,0.05)');
  heat.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = heat;
  ctx.fillRect(0, VIEW_H - 300, VIEW_W, 300);

  // faint nebula glow, low and slow
  const nx = VIEW_W * 0.5 + Math.sin(t * 0.05) * 90;
  const ny = VIEW_H * 0.58;
  const neb = ctx.createRadialGradient(nx, ny, 10, nx, ny, 340);
  neb.addColorStop(0, 'rgba(255,84,112,0.075)');
  neb.addColorStop(1, 'rgba(255,84,112,0)');
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // dust
  ctx.fillStyle = '#a887a8';
  for (const d of DUST) {
    ctx.globalAlpha = d.a;
    ctx.fillRect(d.x, d.y, 1.4, 1.4);
  }
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(shakeX * 0.4, shakeY * 0.4);

  // stars (slow downward drift, twinkle)
  for (const s of STARS) {
    const y = ((s.y - HUD_H + t * s.drift) % FIELD_H) + HUD_H;
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.tw + s.x));
    ctx.globalAlpha = 0.30 + 0.55 * tw;
    ctx.fillStyle = s.warm ? '#ffcf9a' : '#d6dcff';
    ctx.beginPath();
    ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
    ctx.fill();
    // the brightest few get a tiny cross flare
    if (s.r > 1.5 && tw > 0.8) {
      ctx.globalAlpha = 0.16;
      ctx.fillRect(s.x - s.r * 3, y - 0.4, s.r * 6, 0.8);
      ctx.fillRect(s.x - 0.4, y - s.r * 3, 0.8, s.r * 6);
    }
  }
  ctx.globalAlpha = 1;

  // rising embers
  ctx.globalCompositeOperation = 'lighter';
  for (const e of EMBERS) {
    const y = VIEW_H - ((e.y - HUD_H + t * e.sp) % FIELD_H);
    const x = e.x + Math.sin(t * e.swaySp + e.sway) * 18;
    const fade = 0.25 + 0.75 * (y - HUD_H) / FIELD_H;
    const g = ctx.createRadialGradient(x, y, 0, x, y, e.r * 3.4);
    g.addColorStop(0, `rgba(255,178,104,${0.55 * fade})`);
    g.addColorStop(0.35, `rgba(255,120,64,${0.20 * fade})`);
    g.addColorStop(1, 'rgba(255,90,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, e.r * 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // arena frame: a thin glowing border
  const a = ARENA;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  // inner floor wash so the play area reads as a room, not open space
  ctx.fillStyle = 'rgba(28,12,24,0.42)';
  ctx.fillRect(a.x, a.y, a.w, a.h);
  ctx.strokeStyle = 'rgba(255,140,80,0.30)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(a.x, a.y, a.w, a.h);
  ctx.strokeStyle = 'rgba(255,210,160,0.10)';
  ctx.strokeRect(a.x - 5, a.y - 5, a.w + 10, a.h + 10);
  // corner ticks
  ctx.strokeStyle = 'rgba(255,190,120,0.8)';
  ctx.lineWidth = 2;
  const c = 14;
  const corners = [
    [a.x, a.y, 1, 1], [a.x + a.w, a.y, -1, 1],
    [a.x, a.y + a.h, 1, -1], [a.x + a.w, a.y + a.h, -1, -1],
  ];
  for (const [px, py, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(px + dx * c, py);
    ctx.lineTo(px, py);
    ctx.lineTo(px, py + dy * c);
    ctx.stroke();
  }
  ctx.restore();
}
