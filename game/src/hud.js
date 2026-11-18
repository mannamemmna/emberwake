/**
 * The HUD: score + combo, lives, the 90-second clock, shield charge and the
 * wave counter. Drawn on the canvas so one render captures the full state.
 */
import { VIEW_W, HUD_H, RUN_SECONDS, START_LIVES, SHIELD_COOLDOWN, WAVE_BANNER_SECONDS, FINAL_WAVE } from './config.js';
import { clamp } from './rng.js';
import { bannerAlpha, bannerLabel } from './stage.js';

export function drawHud(ctx, game) {
  const g = game;
  const t = performance.now() / 1000;

  // top band: a subtle slab
  const grad = ctx.createLinearGradient(0, 0, 0, HUD_H);
  grad.addColorStop(0, 'rgba(14,7,20,0.94)');
  grad.addColorStop(1, 'rgba(14,7,20,0.42)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, HUD_H);
  ctx.strokeStyle = 'rgba(255,150,90,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HUD_H);
  ctx.lineTo(VIEW_W, HUD_H);
  ctx.stroke();

  // ---- score (left)
  ctx.textAlign = 'left';
  ctx.font = '10px "Courier New", monospace';
  ctx.fillStyle = '#b98a6e';
  ctx.fillText('S C O R E', 24, 24);
  ctx.font = '700 28px "Courier New", monospace';
  ctx.fillStyle = '#ffb35c';
  const scoreStr = String(g.score).padStart(7, '0');
  const pop = 1 + g.scorePop * 0.18;
  ctx.save();
  ctx.translate(22, 54);
  ctx.scale(pop, pop);
  ctx.fillText(scoreStr, 0, 0);
  ctx.restore();
  if (g.combo > 2) {
    ctx.font = '700 12px "Courier New", monospace';
    ctx.fillStyle = '#ff5470';
    // Right of the 7-digit score (plus its pop-scale margin), so the combo
    // never rides over the digits themselves.
    const scoreWidth = ctx.measureText(scoreStr).width * pop;
    ctx.fillText(`COMBO x${g.combo}`, 178 + scoreWidth + 10, 52);
  }

  // ---- lives (center-left)
  const cx = VIEW_W / 2 - 168;
  ctx.font = '10px "Courier New", monospace';
  ctx.fillStyle = '#b98a6e';
  ctx.textAlign = 'left';
  ctx.fillText('L I V E S', cx, 24);
  for (let i = 0; i < START_LIVES; i++) {
    const on = i < g.lives;
    ctx.save();
    ctx.translate(cx + 8 + i * 20, 42);
    ctx.fillStyle = on ? '#ffb35c' : 'rgba(255,179,92,0.16)';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(6, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- shield pill
  const sx = cx + 78;
  const shieldReady = g.ship.shieldCd <= 0;
  ctx.fillStyle = '#b98a6e';
  ctx.font = '10px "Courier New", monospace';
  ctx.fillText('S H I E L D', sx, 24);
  const pillW = 78;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(sx, 34, pillW, 7);
  let fillFrac, fillColor;
  if (shieldReady) {
    fillFrac = 1;
    fillColor = '#78dcff';
  } else {
    // shieldCd counts down from SHIELD_COOLDOWN to 0, so the pill fills as it
    // recharges; when the boss presses the shield hard it can exceed the
    // cooldown, in which case clamp shows the dregs as empty, not inverted.
    fillFrac = 1 - g.ship.shieldCd / SHIELD_COOLDOWN;
    fillColor = '#ff9e3d';
  }
  ctx.fillStyle = fillColor;
  ctx.fillRect(sx, 34, pillW * clamp(fillFrac, 0, 1), 7);
  ctx.font = '9px "Courier New", monospace';
  ctx.fillStyle = shieldReady ? '#78dcff' : '#ff9e3d';
  ctx.fillText(shieldReady ? 'READY' : 'CHARGING', sx, 56);

  // ---- wave (center-right): the run's progress
  const wx = cx + 186;
  ctx.font = '10px "Courier New", monospace';
  ctx.fillStyle = '#b98a6e';
  ctx.fillText('W A V E', wx, 24);
  const flash = g.waveBanner > 0;
  ctx.font = '700 22px "Courier New", monospace';
  ctx.fillStyle = flash ? '#ffe9d2' : '#ff9e3d';
  ctx.fillText(`${g.wave}`, wx, 52);
  ctx.font = '10px "Courier New", monospace';
  ctx.fillStyle = 'rgba(185,138,110,0.8)';
  ctx.fillText('/ 8', wx + String(g.wave).length * 15 + 6, 52);

  // ---- clock (right): the win condition
  const rx = VIEW_W - 24;
  const remain = Math.max(0, RUN_SECONDS - g.elapsed);
  const urgent = remain <= 10;
  ctx.textAlign = 'right';
  ctx.font = '10px "Courier New", monospace';
  ctx.fillStyle = urgent ? '#ff5470' : '#b98a6e';
  ctx.fillText(urgent ? 'S U R V I V E' : 'T I M E', rx, 24);
  ctx.font = '700 28px "Courier New", monospace';
  const mm = String(Math.floor(remain / 60));
  const ss = String(Math.floor(remain % 60)).padStart(2, '0');
  ctx.fillStyle = urgent ? (Math.sin(t * 10) > 0 ? '#ff5470' : '#ffd23e') : '#ffe9d2';
  ctx.fillText(`${mm}:${ss}`, rx, 54);

  // ---- wave banner: a short flare across the top of the arena, following the
  // envelope defined in stage.js (fast in, hold, soft out). Suppressed while
  // the boss strip owns that band, so the two never collide.
  const bossOnScreen = Boolean(g.boss && !g.boss.dead);
  if (g.waveBanner > 0 && !bossOnScreen) {
    // waveBanner is a countdown; age is how long it has been up
    const alpha = bannerAlpha(WAVE_BANNER_SECONDS - g.waveBanner);
    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      ctx.textAlign = 'center';
      ctx.font = '700 15px "Courier New", monospace';
      ctx.fillStyle = g.wave >= FINAL_WAVE ? '#ffd23e' : '#ffb35c';
      ctx.fillText(bannerLabel(g.wave), VIEW_W / 2, HUD_H + 30);
      ctx.restore();
    }
  }
}
