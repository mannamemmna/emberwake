/**
 * Enemies and enemy bullets. Each enemy is one object in a plain array
 * (pools get messy at this scale; 60fps at ~40 units is fine).
 *
 * Behavior by kind:
 *   wisp    — drifts down, wobbles side to side
 *   dart    — fast, aimed at the ship when it spawns, then straight
 *   husk    — slow, tough, straight down
 *   spore   — drops to a hold line, hovers, fires a 3-way volley
 *   sentry  — circles the arena, periodic aimed single shot
 *   colossus — the 90-second final boss; 3 phases
 */
import {
  ENEMY_TYPES, E_BULLET_SPEED, E_BULLET_RADIUS, E_BULLET_LIFE,
  ARENA, VIEW_W, VIEW_H,
} from './config.js';
import { Rng, dist2 } from './rng.js';

/** One enemy instance. */
export function makeEnemy(type, x, y, rng, wave, ship) {
  const base = ENEMY_TYPES[type];
  const e = {
    type, x, y,
    r: base.r,
    hp: base.hp + Math.floor(wave / 4) * (type === 'colossus' ? 0 : type === 'husk' ? 1 : 0),
    maxHp: base.hp,
    color: base.color,
    score: base.score,
    t: 0,                       // local clock
    phase: Math.floor(rng.range(0, Math.PI * 2)),
    vx: 0, vy: 0,
    fireCd: rng.range(0.6, base.shoot || 1.5),
    homeY: 0,
    orbitCx: 0, orbitCy: 0, orbitR: 0, orbitA: 0, orbitSp: 0,
    bossPhase: 0,
    dead: false,
  };
  const speedScale = 1 + wave * 0.03; // gentle per-wave speed ramp

  switch (type) {
    case 'wisp':
      e.vy = base.speed * speedScale;
      e.vx = rng.range(-60, 60);
      break;
    case 'dart': {
      // aim at the ship on spawn
      const dx = ship.x - x, dy = ship.y - y;
      const d = Math.hypot(dx, dy) || 1;
      e.vx = (dx / d) * base.speed;
      e.vy = (dy / d) * base.speed;
      break;
    }
    case 'husk':
      e.vy = base.speed * speedScale;
      break;
    case 'spore':
      e.homeY = rng.range(ARENA.y + 70, ARENA.y + 210);
      e.vy = 90;
      e.fireCd = rng.range(0.8, 1.6);
      break;
    case 'sentry': {
      e.orbitCx = rng.range(ARENA.x + 140, ARENA.x + ARENA.w - 140);
      e.orbitCy = rng.range(ARENA.y + 90, ARENA.y + 160);
      e.orbitR = rng.range(46, 110);
      e.orbitA = rng.range(0, Math.PI * 2);
      e.orbitSp = rng.range(0.5, 0.9) * (rng.next() < 0.5 ? -1 : 1);
      break;
    }
    case 'colossus':
      e.hp = 42; e.maxHp = 42;
      e.x = VIEW_W / 2;
      e.y = ARENA.y + 150;
      e.orbitCx = VIEW_W / 2;
      e.orbitCy = ARENA.y + 200;
      e.orbitR = 240;
      e.orbitA = Math.PI / 2;
      e.orbitSp = 0.35;
      break;
  }
  return e;
}

/** Fire an enemy bullet (aimed at the ship, or part of a fan). */
export function enemyShoot(game, e, angle) {
  const ship = game.ship;
  let a = angle;
  if (a === undefined) a = Math.atan2(ship.y - e.y, ship.x - e.x);
  game.ebullets.push({
    x: e.x + Math.cos(a) * (e.r + 4),
    y: e.y + Math.sin(a) * (e.r + 4),
    vx: Math.cos(a) * E_BULLET_SPEED,
    vy: Math.sin(a) * E_BULLET_SPEED,
    age: 0,
    r: E_BULLET_RADIUS,
    color: e.color,
  });
}

/** Update one enemy; returns 'died' when it leaves the board. */
export function updateEnemy(game, e, dt, rng) {
  e.t += dt;
  const wave = game.wave;

  switch (e.type) {
    case 'wisp': {
      e.y += e.vy * dt;
      e.x += Math.sin(e.t * 2.2 + e.phase) * 54 * dt;
      break;
    }
    case 'dart':
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      break;
    case 'husk':
      e.y += e.vy * dt;
      break;
    case 'spore': {
      if (e.y < e.homeY) e.y += e.vy * dt;
      else {
        // hover and fire 3-way volleys
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          e.fireCd = ENEMY_TYPES.spore.shoot * Math.max(0.55, 1 - wave * 0.03);
          const base = Math.atan2(game.ship.y - e.y, game.ship.x - e.x);
          for (const off of [-0.3, 0, 0.3]) enemyShoot(game, e, base + off);
          game.juice.burst(e.x, e.y + e.r, 4, '#5ad0e0', 60, 0.35, 2);
        }
      }
      break;
    }
    case 'sentry': {
      e.orbitA += e.orbitSp * dt;
      e.x = e.orbitCx + Math.cos(e.orbitA) * e.orbitR;
      e.y = e.orbitCy + Math.sin(e.orbitA) * e.orbitR * 0.55;
      e.fireCd -= dt;
      if (e.fireCd <= 0 && e.y > ARENA.y + 20) {
        e.fireCd = ENEMY_TYPES.sentry.shoot * Math.max(0.6, 1 - wave * 0.025);
        enemyShoot(game, e);
      }
      break;
    }
    case 'colossus': {
      runColossus(game, e, dt, rng);
      break;
    }
  }

  // board exit
  if (e.y > VIEW_H + 60 || e.x < -80 || e.x > VIEW_W + 80) {
    e.dead = true;
    return;
  }
}

/** The boss: slow orbit at the top, three escalating phases. */
function runColossus(game, e, dt, rng) {
  e.orbitA += e.orbitSp * dt;
  e.x = e.orbitCx + Math.cos(e.orbitA) * e.orbitR;
  e.y = e.orbitCy + Math.sin(e.orbitA * 0.7) * 90 + 30;
  const frac = e.hp / e.maxHp;
  const phase = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
  e.bossPhase = phase;
  e.fireCd -= dt;
  if (e.fireCd <= 0) {
    if (phase === 0) {
      // radial ring of 8
      e.fireCd = 1.5;
      for (let i = 0; i < 8; i++) enemyShoot(game, e, (i / 8) * Math.PI * 2 + e.orbitA);
    } else if (phase === 1) {
      // aimed fan of 3
      e.fireCd = 1.05;
      const base = Math.atan2(game.ship.y - e.y, game.ship.x - e.x);
      for (const off of [-0.35, 0, 0.35]) enemyShoot(game, e, base + off);
    } else {
      // fast double aimed + a slow spiral
      e.fireCd = 0.62;
      const base = Math.atan2(game.ship.y - e.y, game.ship.x - e.x);
      enemyShoot(game, e, base + 0.12);
      enemyShoot(game, e, base - 0.12);
      enemyShoot(game, e, e.orbitA * 4 + rng.range(0, 0.5));
    }
    game.juice.burst(e.x, e.y - e.r, 5, e.color, 90, 0.4, 2.2);
  }
}

/** Draw all enemies with a little per-kind character. */
export function drawEnemies(ctx, enemies) {
  for (const e of enemies) {
    if (e.dead) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    // dark backing plate: every enemy gets a silhouette that reads against
    // its own glow, so shapes stay legible in a crowded frame
    if (e.type !== 'wisp') {
      ctx.fillStyle = 'rgba(8,3,12,0.72)';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 1.05, 0, Math.PI * 2);
      ctx.fill();
    }
    switch (e.type) {
      case 'wisp': {
        // a teardrop ember mote, trailing a tail
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, e.r * 2.4);
        g.addColorStop(0, 'rgba(255,246,224,1)');
        g.addColorStop(0.28, 'rgba(255,170,70,0.8)');
        g.addColorStop(1, 'rgba(255,110,50,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, e.r * 2.4, 0, Math.PI * 2); ctx.fill();
        const angle = Math.atan2(e.vy || 1, e.vx || 0) - Math.PI / 2;
        // tail: three shrinking puffs behind the mote
        for (let i = 1; i <= 3; i++) {
          ctx.globalAlpha = 0.5 - i * 0.12;
          ctx.fillStyle = '#ff8a3d';
          const tx = Math.sin(angle) * i * e.r * 0.55;
          const ty = -Math.cos(angle) * i * e.r * 0.55;
          ctx.beginPath();
          ctx.arc(tx, ty, e.r * (0.55 - i * 0.12), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        // bright ember body, egg-shaped along its path
        ctx.rotate(angle);
        ctx.fillStyle = '#ffb35c';
        ctx.beginPath();
        ctx.ellipse(0, 0, e.r * 0.62, e.r * 0.86, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff2d2';
        ctx.beginPath();
        ctx.ellipse(0, -e.r * 0.15, e.r * 0.3, e.r * 0.44, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'dart': {
        ctx.rotate(Math.atan2(e.vy, e.vx) + Math.PI / 2);
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(0, -e.r - 5);
        ctx.lineTo(e.r * 0.7, e.r);
        ctx.lineTo(0, e.r * 0.5);
        ctx.lineTo(-e.r * 0.7, e.r);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'husk': {
        // chunky rock
        ctx.fillStyle = e.color;
        ctx.beginPath();
        const n = 7;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + e.phase;
          const rr = e.r * (0.85 + 0.2 * Math.sin(e.phase * 3 + i));
          if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.arc(-e.r * 0.25, -e.r * 0.2, e.r * 0.3, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'spore': {
        // pulsing cell with three pods
        const pulse = 1 + 0.12 * Math.sin(e.t * 5 + e.phase);
        ctx.fillStyle = e.color;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.62 * pulse, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + e.t * 0.8;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * e.r * 0.9, Math.sin(a) * e.r * 0.9, e.r * 0.32 * pulse, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#d8fbff';
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.28, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'sentry': {
        // diamond platform with a lens
        ctx.rotate(e.orbitA);
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(0, -e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r); ctx.lineTo(-e.r, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#2a1030';
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e0c8ff';
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.22, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'colossus': {
        // big layered core: ring + plates + heart
        const pulse = 1 + 0.06 * Math.sin(e.t * 3);
        ctx.globalCompositeOperation = 'lighter';
        const halo = ctx.createRadialGradient(0, 0, e.r * 0.4, 0, 0, e.r * 2.2);
        halo.addColorStop(0, 'rgba(255,210,62,0.30)');
        halo.addColorStop(1, 'rgba(255,210,62,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(0, 0, e.r * 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        // rotating plates
        for (let i = 0; i < 6; i++) {
          ctx.save();
          ctx.rotate((i / 6) * Math.PI * 2 + e.t * 0.7);
          ctx.fillStyle = i % 2 ? '#e8a52e' : '#ffd23e';
          ctx.fillRect(-e.r * 0.28, -e.r * 1.05 * pulse, e.r * 0.56, e.r * 0.72);
          ctx.restore();
        }
        ctx.fillStyle = '#3a2408';
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.62, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = e.bossPhase === 2 ? '#ff5470' : e.bossPhase === 1 ? '#ffd23e' : '#fff3c0';
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.4 * pulse, 0, Math.PI * 2); ctx.fill();
        break;
      }
    }
    ctx.restore();

    // hp pips for tough ones
    if (e.maxHp >= 3 && e.type !== 'colossus' && e.hp < e.maxHp) {
      const w = e.r * 1.6;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w, 3);
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w * (e.hp / e.maxHp), 3);
    }
  }
}

/**
 * Boss health bar: a full-width header strip pinned to the top edge of the
 * arena, so it never fights the boss's own glow for contrast.
 */
export function drawBossBar(ctx, boss) {
  const a = ARENA;
  const stripH = 42;
  const frac = Math.max(0, boss.hp / boss.maxHp);

  // backing strip: solid enough to kill any glow behind the type
  const bg = ctx.createLinearGradient(0, a.y, 0, a.y + stripH);
  bg.addColorStop(0, 'rgba(10,5,16,0.96)');
  bg.addColorStop(1, 'rgba(10,5,16,0.60)');
  ctx.fillStyle = bg;
  ctx.fillRect(a.x, a.y, a.w, stripH);
  ctx.strokeStyle = 'rgba(255,210,62,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y + stripH);
  ctx.lineTo(a.x + a.w, a.y + stripH);
  ctx.stroke();

  // name + percentage
  ctx.font = '700 11px "Courier New", monospace';
  ctx.fillStyle = '#ffd23e';
  ctx.textAlign = 'left';
  ctx.fillText('T H E   C O L O S S U S   O F   E M B E R W A K E', a.x + 16, a.y + 18);
  ctx.textAlign = 'right';
  ctx.fillStyle = boss.hp > 0 ? '#ffe9d2' : '#9ff0ff';
  ctx.fillText(`${Math.ceil(frac * 100)}%`, a.x + a.w - 16, a.y + 18);

  // bar
  const bx = a.x + 16, bw = a.w - 32, by = a.y + 26, bh = 8;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(bx, by, bw, bh);
  const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  grad.addColorStop(0, '#ffd23e');
  grad.addColorStop(0.6, '#ff9e3d');
  grad.addColorStop(1, '#ff5470');
  ctx.fillStyle = grad;
  ctx.fillRect(bx, by, bw * frac, bh);
  // phase notches at thirds, so the three phases are visible at a glance
  ctx.fillStyle = 'rgba(10,5,16,0.85)';
  ctx.fillRect(bx + bw * 0.33, by, 2, bh);
  ctx.fillRect(bx + bw * 0.66, by, 2, bh);
}

/** Draw all enemy bullets: a hot core with a motion trail behind it. */
export function drawEBullets(ctx, bullets) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of bullets) {
    // trail: a short tapered streak opposite the velocity
    const tx = b.x - b.vx * 0.075;
    const ty = b.y - b.vy * 0.075;
    const trail = ctx.createLinearGradient(tx, ty, b.x, b.y);
    trail.addColorStop(0, 'rgba(0,0,0,0)');
    trail.addColorStop(1, b.color);
    ctx.strokeStyle = trail;
    ctx.lineWidth = b.r * 0.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    // core
    const g = ctx.createRadialGradient(b.x, b.y, 0.5, b.x, b.y, b.r * 2.2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, b.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
