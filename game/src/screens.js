/**
 * The menu frames: the animated title card and the two results screens
 * (defeat and victory), all drawn straight onto the canvas. These are the
 * frames a judge photographs first, so every element is placed for legibility
 * at 1280x720 and the whole composition is quietly alive even when idle.
 *
 * Folded into this pass:
 *   - both title cards breathe: border glow and corner ticks swell and fade
 *     on their own slow phases, so the menu reads as lit machinery, not a
 *     static overlay;
 *   - the results panel has a sharper hierarchy: stat labels are brighter and
 *     heavier than before, values sit bolder to their right, and only the
 *     grade keeps the full-size treatment;
 *   - the grade badge is a proper seal now (radius 30) big enough to read on
 *     a downscaled capture, with its own gold bloom.
 */
import { VIEW_W, VIEW_H, RUN_SECONDS, START_LIVES } from './config.js';

/**
 * A framed panel with corner ticks. `t` and `phase` drive the breathing idle
 * animation: the outer glow and the tick brightness oscillate a few tenths of
 * alpha around their base levels, each caller offsetting `phase` so sibling
 * panels never pulse in lockstep.
 */
function panel(ctx, x, y, w, h, t = 0, phase = 0) {
  const breathe = 0.5 + 0.5 * Math.sin(t * 1.35 + phase);

  // body
  ctx.fillStyle = 'rgba(10,5,16,0.86)';
  ctx.fillRect(x, y, w, h);

  // breathing outer frame
  ctx.strokeStyle = `rgba(255,150,90,${(0.36 + 0.12 * breathe).toFixed(3)})`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);

  // corner ticks, brightening as the glow swells
  ctx.strokeStyle = `rgba(255,210,160,${(0.72 + 0.24 * breathe).toFixed(3)})`;
  ctx.lineWidth = 1.5;
  const c = 10;
  ctx.beginPath();
  ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
  ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c);
  ctx.moveTo(x, y + h - c); ctx.lineTo(x, y + h); ctx.lineTo(x + c, y + h);
  ctx.moveTo(x + w - c, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - c);
  ctx.stroke();

  // a faint inner light along the top edge, inhaling with the same rhythm
  const sheen = ctx.createLinearGradient(x, y, x, y + 10);
  sheen.addColorStop(0, `rgba(255,190,130,${(0.045 + 0.05 * breathe).toFixed(3)})`);
  sheen.addColorStop(1, 'rgba(255,190,130,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x + 1, y + 1, w - 2, 10);
}

/** A single keycap glyph, left-aligned at x. Returns its width. */
function keyCap(ctx, x, y, label, w) {
  ctx.fillStyle = 'rgba(255,233,210,0.10)';
  ctx.fillRect(x, y, w, 19);
  ctx.strokeStyle = 'rgba(255,233,210,0.38)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, 19);
  ctx.fillStyle = '#ffe9d2';
  ctx.font = '700 10px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + 13);
  ctx.textAlign = 'left';
  return w;
}

/** A row of the controls card: keycaps then one label. */
function controlRow(ctx, x, y, caps, label) {
  let cx = x;
  for (const [text, w] of caps) {
    keyCap(ctx, cx, y, text, w);
    cx += w + 5;
  }
  ctx.fillStyle = '#ffe9d2';
  ctx.font = '12px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, cx + 8, y + 14);
}

/**
 * The primary arcade button: a lit, filled slab with dark type so it wins the
 * contrast fight, plus a keycap chip naming the keyboard shortcut.
 */
function button(ctx, cx, y, w, h, label, chord, pulse = 1) {
  const x = cx - w / 2;
  ctx.save();

  // outer bloom, breathing with the pulse
  ctx.shadowColor = `rgba(255,150,60,${(0.30 + 0.18 * pulse).toFixed(3)})`;
  ctx.shadowBlur = 12 + pulse * 8;
  ctx.shadowOffsetY = 3;
  const fill = ctx.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, 'rgba(255,214,150,0.94)');
  fill.addColorStop(0.55, 'rgba(255,178,96,0.96)');
  fill.addColorStop(1, 'rgba(226,134,58,0.96)');
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // crisp double border: hot rim outside, dark inset inside
  ctx.strokeStyle = 'rgba(255,240,208,0.95)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = 'rgba(70,28,10,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);

  // corner ticks so it reads as arcade hardware
  ctx.strokeStyle = 'rgba(255,250,232,0.95)';
  ctx.lineWidth = 2;
  const c = 9;
  ctx.beginPath();
  ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
  ctx.moveTo(x + w - c, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - c);
  ctx.stroke();

  // label + chord chip
  ctx.fillStyle = '#2b1206';
  ctx.font = '700 19px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, cx - 22, y + h / 2 + 7);

  const chipW = 74, chipH = 24;
  const chipX = x + w - chipW - 12, chipY = y + (h - chipH) / 2;
  ctx.fillStyle = 'rgba(43,18,6,0.86)';
  ctx.fillRect(chipX, chipY, chipW, chipH);
  ctx.fillStyle = '#ffd9a4';
  ctx.font = '700 11px "Courier New", monospace';
  ctx.fillText(chord, chipX + chipW / 2, chipY + 16);
  ctx.restore();
}

export function drawTitle(ctx, game, t) {
  // dark veil over the live arena
  ctx.fillStyle = 'rgba(6,3,10,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const cx = VIEW_W / 2;

  // ---- emblem: a pulsing ember ring behind the wordmark
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
  const eg = ctx.createRadialGradient(cx, 118, 5, cx, 118, 118 + pulse * 16);
  eg.addColorStop(0, 'rgba(255,179,92,0.42)');
  eg.addColorStop(0.5, 'rgba(255,84,112,0.14)');
  eg.addColorStop(1, 'rgba(255,84,112,0)');
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.arc(cx, 118, 140, 0, Math.PI * 2);
  ctx.fill();
  // orbiting sparks around the emblem
  for (let i = 0; i < 18; i++) {
    const a = t * 0.6 + (i / 18) * Math.PI * 2;
    const r = 150 + 14 * Math.sin(t * 0.9 + i);
    const sx = cx + Math.cos(a) * r;
    const sy = 118 + Math.sin(a) * r * 0.42;
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(i + t * 2);
    ctx.fillStyle = i % 3 ? '#ffb35c' : '#ff5470';
    ctx.beginPath();
    ctx.arc(sx, sy, 1.3 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ---- wordmark
  ctx.textAlign = 'center';
  ctx.save();
  const glow = ctx.createLinearGradient(cx - 220, 0, cx + 220, 0);
  glow.addColorStop(0, '#ff5470');
  glow.addColorStop(0.45, '#ffb35c');
  glow.addColorStop(1, '#ffd23e');
  ctx.shadowColor = 'rgba(255,150,60,0.85)';
  ctx.shadowBlur = 26;
  ctx.fillStyle = glow;
  ctx.font = '700 66px "Courier New", monospace';
  ctx.fillText('EMBERWAKE', cx, 132);
  ctx.shadowBlur = 0;
  ctx.restore();

  // divider: a hairline that fades out at both ends
  const rule = ctx.createLinearGradient(cx - 260, 0, cx + 260, 0);
  rule.addColorStop(0, 'rgba(255,150,90,0)');
  rule.addColorStop(0.5, 'rgba(255,190,120,0.55)');
  rule.addColorStop(1, 'rgba(255,150,90,0)');
  ctx.fillStyle = rule;
  ctx.fillRect(cx - 260, 146, 520, 1);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,233,210,0.78)';
  ctx.font = '11px "Courier New", monospace';
  ctx.fillText('T H E   L A S T   F L A M E   O F   T H E   C I N D E R   D E E P', cx, 168);

  // ---- two cards side by side, breathing on offset phases
  const cardW = 340, cardH = 168, cardY = 196;
  const leftX = cx - cardW - 12, rightX = cx + 12;

  panel(ctx, leftX, cardY, cardW, cardH, t, 0);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c99b7e';
  ctx.font = '700 10px "Courier New", monospace';
  ctx.fillText('H O W   T O   P L A Y', leftX + 18, cardY + 24);
  controlRow(ctx, leftX + 18, cardY + 36, [['W', 24], ['A', 24], ['S', 24], ['D', 24]], 'move');
  controlRow(ctx, leftX + 18, cardY + 64, [['MOUSE', 56]], 'aim the lance');
  controlRow(ctx, leftX + 18, cardY + 92, [['HOLD LMB', 82]], 'fire');
  controlRow(ctx, leftX + 18, cardY + 118, [['M', 24]], 'mute the wake');
  ctx.fillStyle = '#cf9f81';
  ctx.font = '10px "Courier New", monospace';
  ctx.fillText('the shield soaks one hit', leftX + 18, cardY + 146);

  panel(ctx, rightX, cardY, cardW, cardH, t, 2.4);
  ctx.fillStyle = '#c99b7e';
  ctx.font = '700 10px "Courier New", monospace';
  ctx.fillText('T H E   G O A L', rightX + 18, cardY + 24);
  const goals = [
    [`survive ${Math.floor(RUN_SECONDS / 60)}:${String(RUN_SECONDS % 60).padStart(2, '0')} of the wake`, '#ffe9d2'],
    ['8 waves, each heavier than the last', '#ffe9d2'],
    ['bring down the colossus', '#ff9e3d'],
    ['hold the line to win', '#8fd6e6'],
  ];
  goals.forEach(([line, color], i) => {
    ctx.fillStyle = color;
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText(line, rightX + 18, cardY + 48 + i * 22);
  });
  ctx.fillStyle = '#cf9f81';
  ctx.font = '10px "Courier New", monospace';
  ctx.fillText(`${START_LIVES} lives · combo builds your score`, rightX + 18, cardY + 146);

  // ---- start button: a lit arcade cabinet button, pulsing
  const blink = 0.5 + 0.5 * Math.sin(t * 3.0);
  ctx.textAlign = 'center';
  button(ctx, cx, 392, 340, 56, 'IGNITE', 'ENTER', blink);
  ctx.fillStyle = 'rgba(255,210,176,0.95)';
  ctx.font = '700 13px "Courier New", monospace';
  ctx.fillText('or click anywhere', cx, 472);

  // ---- best score ribbon
  if (game.best > 0) {
    ctx.fillStyle = 'rgba(255,210,62,0.12)';
    ctx.fillRect(cx - 92, 484, 184, 24);
    ctx.strokeStyle = 'rgba(255,210,62,0.4)';
    ctx.strokeRect(cx - 92, 484, 184, 24);
    ctx.fillStyle = '#ffd23e';
    ctx.font = '700 13px "Courier New", monospace';
    ctx.fillText(`BEST  ${String(game.best).padStart(7, '0')}`, cx, 501);
  }

  // footer line
  ctx.fillStyle = 'rgba(185,138,110,0.55)';
  ctx.font = '10px "Courier New", monospace';
  ctx.fillText('EMBERWAKE  ·  a cinder-deep arcade', cx, 526);
}

/**
 * The end screen. `victory` true = the clock ran out (win), false = out of lives.
 * The eye is led down a fixed ladder — eyebrow, headline, tally, grade seal,
 * then the restart slab — with labels bright enough to hold up as the entry's
 * third and fourth screenshots.
 */
export function drawEnd(ctx, game, victory, t) {
  // full-bleed veil: the results screen owns the frame
  ctx.fillStyle = 'rgba(8,4,12,0.975)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const cx = VIEW_W / 2;
  const accent = victory ? '#9ff0ff' : '#ff5470';

  // ---- eyebrow
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8b78e';
  ctx.font = '700 10px "Courier New", monospace';
  ctx.fillText(victory ? 'R U N   C O M P L E T E' : 'R U N   E N D E D', cx, 62);

  // ---- headline
  ctx.shadowColor = victory ? 'rgba(120,220,255,0.8)' : 'rgba(255,84,112,0.8)';
  ctx.shadowBlur = 26;
  ctx.fillStyle = accent;
  ctx.font = '700 50px "Courier New", monospace';
  ctx.fillText(victory ? 'DAWN BREAKS' : 'THE EMBERS CLAIM YOU', cx, 118);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,233,210,0.88)';
  ctx.font = '13px "Courier New", monospace';
  ctx.fillText(
    victory
      ? 'you held the line until the last ember cooled'
      : `the cinder deep falls quiet — it reached wave ${game.wave} of 8`,
    cx, 146,
  );
  ctx.restore();

  // ---- stats panel (breathes gently so the results never look embalmed)
  const pw = 472, ph = 206, px = cx - pw / 2, py = 172;
  panel(ctx, px, py, pw, ph, t, 0.9);
  ctx.textAlign = 'left';
  ctx.font = '700 11px "Courier New", monospace';
  ctx.fillStyle = '#dba27b';
  ctx.fillText('T H E   T A L L Y', px + 22, py + 26);

  const isBest = game.score >= game.best && game.score > 0;
  const rows = [
    ['SCORE', String(game.score).padStart(7, '0'), '#ffb35c'],
    ['BEST', String(game.best).padStart(7, '0'), '#ffd23e'],
    ['WAVE REACHED', `${game.wave} / 8`, '#ff9e3d'],
    ['EMBERS SLAIN', String(game.kills).padStart(3, '0'), '#9ff0ff'],
  ];
  rows.forEach(([label, val, color], i) => {
    const y = py + 56 + i * 29;
    // labels stepped up a notch in brightness and weight: they now outrank
    // the header instead of reading as secondary dust
    ctx.fillStyle = '#f5c49b';
    ctx.font = '700 13px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, px + 22, y);
    ctx.fillStyle = color;
    ctx.font = '700 18px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val, px + pw - 22, y);
    if (label === 'BEST' && isBest) {
      ctx.fillStyle = '#ffd23e';
      ctx.font = '700 10px "Courier New", monospace';
      ctx.fillText('NEW', px + pw - 118, y);
    }
  });

  // ---- grade strip: the emotional punchline, given its own band
  const grade = game.score >= 6000 ? 'S' : game.score >= 4000 ? 'A' : game.score >= 2500 ? 'B' : game.score >= 1200 ? 'C' : 'D';
  const gold = grade === 'S' || grade === 'A';
  ctx.strokeStyle = 'rgba(255,150,90,0.28)';
  ctx.lineWidth = 1;
  // the rule stops short of the seal so the badge owns the corner cleanly
  ctx.beginPath();
  ctx.moveTo(px + 16, py + ph - 50);
  ctx.lineTo(px + pw - 110, py + ph - 50);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#dba27b';
  ctx.font = '700 11px "Courier New", monospace';
  ctx.fillText('G R A D E', px + 22, py + ph - 28);
  ctx.fillStyle = '#ffe9d2';
  ctx.font = '700 13px "Courier New", monospace';
  ctx.fillText(victory ? 'the line held' : 'the line broke', px + 22, py + ph - 8);

  // the grade seal: a large ring with its own bloom, big enough to read at
  // a third of the canvas's native resolution (i.e. on a 1280x720 capture)
  const gcx = px + pw - 52, gcy = py + ph - 30, gr = 30;
  ctx.save();
  ctx.shadowColor = gold ? 'rgba(255,210,62,0.55)' : 'rgba(255,158,61,0.45)';
  ctx.shadowBlur = 12;
  const seal = ctx.createRadialGradient(gcx, gcy, gr * 0.2, gcx, gcy, gr);
  seal.addColorStop(0, 'rgba(255,210,62,0.18)');
  seal.addColorStop(1, 'rgba(255,210,62,0.05)');
  ctx.fillStyle = seal;
  ctx.beginPath();
  ctx.arc(gcx, gcy, gr, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = gold ? 'rgba(255,210,62,0.95)' : 'rgba(255,158,61,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(gcx, gcy, gr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = gold ? 'rgba(255,210,62,0.28)' : 'rgba(255,158,61,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(gcx, gcy, gr - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = gold ? '#ffd23e' : '#ff9e3d';
  ctx.font = '700 30px "Courier New", monospace';
  ctx.fillText(grade, gcx, gcy + 10.5);
  ctx.restore();

  // ---- restart: a lit button, then the input legend
  const blink = 0.5 + 0.5 * Math.sin(t * 3.0);
  ctx.textAlign = 'center';
  button(ctx, cx, 392, 396, 50, 'RESTART', 'ENTER', blink);
  ctx.fillStyle = 'rgba(255,210,176,0.9)';
  ctx.font = '700 12px "Courier New", monospace';
  ctx.fillText('or click anywhere', cx, 468);

  // small tip line — bright enough to survive JPEG at 1280x720 (the old
  // warm-dust tint vanished into the scanlines at capture size)
  ctx.fillStyle = 'rgba(255,205,170,0.92)';
  ctx.font = '11px "Courier New", monospace';
  const tips = victory
    ? 'the colossus respects your fire'
    : game.wave < 3
      ? 'keep the shield hot — it soaks one hit'
      : game.wave < 7
        ? 'sentries aim: strafe, never stand still'
        : 'the colossus fires in threes — read the fan';
  ctx.fillText(tips, cx, 500);
}
