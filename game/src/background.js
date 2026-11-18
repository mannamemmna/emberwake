/**
 * The cinder deep: three parallax star layers, depth-sorted ember motes that
 * rise and drift sideways at different speeds per layer, a low heat bloom,
 * slow nebula breathing, and a vignette that pulls the corners down so the
 * playable middle of the frame carries all the light.
 *
 * Everything here is derived from hashNoise with fixed seeds (no state, no
 * Math.random), so the field is identical frame to frame and screenshots are
 * reproducible down to the last mote.
 */
import { VIEW_W, VIEW_H, ARENA, HUD_H } from './config.js';
import { hashNoise } from './rng.js';

const FIELD_H = VIEW_H - HUD_H;

// ---------------------------------------------------------------------------
// The static field: distant dust and three star layers.
// ---------------------------------------------------------------------------

// star layers: far (tiny, slow) -> near (bright, fast). Each layer drifts at
// its own rate, which is the whole parallax illusion.
const STAR_LAYERS = [
  { n: 130, seed: 301, rMin: 0.35, rMax: 0.85, drift: 3 },
  { n: 60, seed: 302, rMin: 0.7, rMax: 1.35, drift: 8 },
  { n: 26, seed: 303, rMin: 1.1, rMax: 2.0, drift: 16 },
];

const STARS = (() => {
  const list = [];
  for (const L of STAR_LAYERS) {
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
  return list.sort((a, b) => a.drift - b.drift); // far first, near drawn on top
})();

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

// ---------------------------------------------------------------------------
// The embers: rising motes in three parallax bands. Depth 0 is a far wisp of
// heat; depth 2 is a mote close enough to brush the hull. Lateral drift and
// sway both scale with depth, so the near band visibly shears against the
// far one when the field moves.
// ---------------------------------------------------------------------------

const EMBER_BANDS = [
  { seed: 201, n: 24, rMin: 0.7, rMax: 1.2, riseMin: 5, riseMax: 10, drift: 5, sway: 8,  aMul: 0.7 },
  { seed: 212, n: 22, rMin: 1.0, rMax: 1.9, riseMin: 9, riseMax: 17, drift: 12, sway: 14, aMul: 0.9 },
  { seed: 223, n: 18, rMin: 1.4, rMax: 2.9, riseMin: 14, riseMax: 26, drift: 22, sway: 19, aMul: 1.15 },
];

const EMBERS = (() => {
  const list = [];
  for (let band = 0; band < EMBER_BANDS.length; band++) {
    const B = EMBER_BANDS[band];
    for (let i = 0; i < B.n; i++) {
      list.push({
        band,
        x: hashNoise(B.seed + 0, i * 11, 0) * VIEW_W,
        y: HUD_H + hashNoise(B.seed + 1, 0, i * 11) * FIELD_H,
        r: B.rMin + hashNoise(B.seed + 2, i, 0) * (B.rMax - B.rMin),
        rise: B.riseMin + hashNoise(B.seed + 3, i, 0) * (B.riseMax - B.riseMin),
        swaySeed: hashNoise(B.seed + 4, i, 0) * Math.PI * 2,
        swaySp: 0.3 + hashNoise(B.seed + 5, i, 0) * 0.8,
        // lateral parallax: ever ember drifts one way or another, and the
        // near band drifts hardest — depth sells the parallax
        drift: B.drift * (0.6 + hashNoise(B.seed + 6, i, 0) * 0.8),
        dir: hashNoise(B.seed + 7, i, 0) > 0.5 ? 1 : -1,
        aMul: B.aMul * (0.75 + hashNoise(B.seed + 8, i, 0) * 0.5),
      });
    }
  }
  return list.sort((a, b) => a.band - b.band); // draw far band first
})();

/** Wrap a world coordinate into [0, span) with a soft overscan margin. */
function wrap(v, span, margin = 40) {
  const total = span + margin * 2;
  return ((v % total) + total) % total - margin;
}

// ---------------------------------------------------------------------------
// Vignette: precomputed corner gradient geometry, painted every frame.
// ---------------------------------------------------------------------------

const VIGNETTE = (() => {
  const corners = [
    { x: -30, y: -30, alpha: 0.34 },
    { x: VIEW_W + 30, y: -30, alpha: 0.34 },
    // the bottom pair are corners gameplay uses least, so they can take the
    // heavier hand without hurting legibility of the ship's corridor
    { x: -30, y: VIEW_H + 30, alpha: 0.46 },
    { x: VIEW_W + 30, y: VIEW_H + 30, alpha: 0.46 },
  ];
  return { corners, radius: 470 };
})();

export function drawBackground(ctx, t, shakeX, shakeY) {
  // ---- base: layered vertical depth
  const bg = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  bg.addColorStop(0, '#150a1c');
  bg.addColorStop(0.45, '#100714');
  bg.addColorStop(0.82, '#190c15');
  bg.addColorStop(1, '#241014');
  ctx.fillStyle = bg;
  ctx.fillRect(-20, -20, VIEW_W + 40, VIEW_H + 40);

  // ---- heat bloom rising from the bottom of the field
  const heat = ctx.createLinearGradient(0, VIEW_H, 0, VIEW_H - 300);
  heat.addColorStop(0, 'rgba(255,94,48,0.16)');
  heat.addColorStop(0.45, 'rgba(190,48,80,0.05)');
  heat.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = heat;
  ctx.fillRect(0, VIEW_H - 300, VIEW_W, 300);

  // ---- faint nebula glow, breathing on a very slow cycle
  const nx = VIEW_W * 0.5 + Math.sin(t * 0.05) * 90;
  const ny = VIEW_H * 0.58;
  const neb = ctx.createRadialGradient(nx, ny, 10, nx, ny, 340);
  neb.addColorStop(0, 'rgba(255,84,112,0.075)');
  neb.addColorStop(1, 'rgba(255,84,112,0)');
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // ---- dust
  ctx.fillStyle = '#a887a8';
  for (const d of DUST) {
    ctx.globalAlpha = d.a;
    ctx.fillRect(d.x, d.y, 1.4, 1.4);
  }
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(shakeX * 0.4, shakeY * 0.4);

  // ---- stars: each layer falls at its own rate, so the field reads as depth
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

  // ---- rising embers, banded by depth: the near band rises, sways and
  // shears sideways faster than the far one, so the field has parallax even
  // though nothing is actually scrolling. Deterministic wrap keeps positions
  // exact for any t, which is what keeps captures reproducible.
  ctx.globalCompositeOperation = 'lighter';
  for (const e of EMBERS) {
    const span = FIELD_H;
    // rise from the bottom, wrapping: yy is the wrapped world-space height
    const yy = VIEW_H - ((e.y - HUD_H + t * e.rise) % span);
    // lateral parallax: each band drifts its own way at its own speed, and
    // the near band shears hardest — that shear *is* the depth cue
    const x = wrap(
      e.x + e.dir * t * e.drift
        + Math.sin(t * e.swaySp + e.swaySeed) * (EMBER_BANDS[e.band].sway * 0.9),
      VIEW_W, 34,
    );
    const depth = (e.band + 1) / EMBER_BANDS.length; // 1/3, 2/3, 1
    const fade = (0.30 + 0.70 * (yy - HUD_H) / span) * e.aMul;
    const g = ctx.createRadialGradient(x, yy, 0, x, yy, e.r * 3.6 * depth);
    g.addColorStop(0, `rgba(255,178,104,${(0.60 * fade).toFixed(3)})`);
    g.addColorStop(0.35, `rgba(255,120,64,${(0.22 * fade).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,90,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, yy, e.r * 3.6 * depth, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // ---- arena frame: a thin glowing border with a floor wash
  const a = ARENA;
  ctx.save();
  ctx.translate(shakeX, shakeY);
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

  // ---- vignette: a soft centre-out gradient first, then a heavier hand on
  // each corner, so the eye is drawn into the middle of the arena where the
  // ship actually flies. The HUD band (drawn later, above) keeps its own
  // legibility independent of this pass.
  const v = VIGNETTE;
  const mid = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, FIELD_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.72);
  mid.addColorStop(0, 'rgba(4,1,8,0)');
  mid.addColorStop(0.75, 'rgba(4,1,8,0.10)');
  mid.addColorStop(1, 'rgba(4,1,8,0.34)');
  ctx.fillStyle = mid;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  v.corners.forEach((corner) => {
    const g = ctx.createRadialGradient(corner.x, corner.y, v.radius * 0.18, corner.x, corner.y, v.radius);
    g.addColorStop(0, `rgba(3,1,6,${corner.alpha})`);
    g.addColorStop(1, 'rgba(3,1,6,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  });
}
