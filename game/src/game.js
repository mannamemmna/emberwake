/**
 * The run: state machine, wave scheduling, collisions, scoring and the
 * win (survive the clock) / lose (out of lives) transitions.
 * Owns the entity lists; draws the world then hands off to hud/screens.
 */
import {
  ARENA, VIEW_W, VIEW_H, RUN_SECONDS, START_LIVES, WAVE_COUNTS, COMBO_TIERS,
  SHIP_RADIUS, SHIELD_RADIUS, INVULN_SECONDS,
  BONUS_SHIELD_HIT, BONUS_KILL_STREAK, BONUS_TIME, MAX_COMBO,
  WAVE_SPAWN_WEIGHTS, SPAWN_ORDER, WAVE_BANNER_SECONDS, FINAL_WAVE,
} from './config.js';
import { dist2 } from './rng.js';
import { Juice } from './juice.js';
import { makeEnemy, updateEnemy, drawEnemies, drawEBullets, drawBossBar } from './enemies.js';
import { drawBackground } from './background.js';
import { drawHud } from './hud.js';
import { drawTitle, drawEnd } from './screens.js';
import { Sfx } from './audio.js';

export const STATE = { TITLE: 'title', PLAYING: 'playing', OVER: 'over', WON: 'won' };

export class Game {
  constructor(canvas, rng, ship) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rng = rng;
    this.ship = ship;
    this.juice = new Juice();
    this.sfx = new Sfx();
    this.state = STATE.TITLE;
    this.victory = false;
    this.best = Number(localStorage.getItem('emberwake.best') ?? 0) || 0;
    this.keys = new Set();
    this.pressed = new Set();
    this._comboTimer = 0;
    this.inputLock = 0; // brief lock so a stray click cannot skip the results
    this.reset();

    const unlockAudio = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlockAudio, { once: false });
    window.addEventListener('keydown', unlockAudio, { once: false });
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.pressed.add(k);
      if (k === ' ' || k === 'enter') e.preventDefault();
      if (k === 'm') this.sfx.enabled = !this.sfx.enabled;
    });
    canvas.addEventListener('click', () => {
      if (this.state !== STATE.PLAYING && this.inputLock <= 0) this.start();
    });
  }

  reset() {
    this.score = 0;
    this.lives = START_LIVES;
    this.wave = 0;
    this.elapsed = 0;
    this.combo = 0;
    this.kills = 0;
    this.scorePop = 0;
    this.waveBanner = 0;
    this.waveTimer = 1.0;
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.boss = null;
    this._comboTimer = 0;
  }

  start() {
    this.reset();
    this.ship.reset();
    this.state = STATE.PLAYING;
    this.victory = false;
    this.sfx.unlock();
    this.sfx.start();
  }

  /**
   * Wave composition: the weights live in config.js (WAVE_SPAWN_WEIGHTS);
   * the spawner and the staged frame both read the same table. The wave gate
   * (lodash-like gate) is honoured first so a wave can never field an enemy
   * kind it has not been configured to.
   */
  _spawnWave(wave) {
    const rng = this.rng;
    const count = WAVE_COUNTS[wave] ?? 4 + wave * 2;
    const weights = WAVE_SPAWN_WEIGHTS[wave];
    for (let i = 0; i < count; i++) {
      const x = ARENA.x + 40 + rng.range(0, ARENA.w - 80);
      const y = ARENA.y - 40 - rng.range(0, 140 + wave * 14);
      let kind;
      if (weights) {
        // on-table wave: roll against the configured mix
        let total = 0;
        for (const type of SPAWN_ORDER) total += weights[type];
        kind = rng.weighted(SPAWN_ORDER, SPAWN_ORDER.map((type) => weights[type]));
        // future-proof: if a wave's table is all zeros, fall back to wisps
        if (!(total > 0)) kind = 'wisp';
      } else {
        kind = 'wisp'; // off-table waves should never happen, but stay safe
      }
      this.enemies.push(makeEnemy(kind, x, y, rng, wave, this.ship));
    }
    if (wave === FINAL_WAVE && this.boss === null) {
      this.boss = makeEnemy('colossus', VIEW_W / 2, ARENA.y - 60, rng, FINAL_WAVE, this.ship);
      this.enemies.push(this.boss);
      this.juice.kick(7, 0.5);
    }
    // banner timing: a full envelope with a fast fade-in so the label lands
    // with the wave instead of drifting in behind it
    this.waveBanner = WAVE_BANNER_SECONDS;
    // wanted stars climb with the wave: from wave 3 the siren joins the alarm,
    // and its pitch keeps dropping from there (audio.js owns the ladder)
    this.sfx.setStars(wave - 1);
    this.sfx.wave();
  }

  update(dt) {
    if (this.inputLock > 0) this.inputLock = Math.max(0, this.inputLock - dt);
    if (this.state === STATE.TITLE) {
      this._titleAmbience(dt);
      return;
    }
    if (this.state !== STATE.PLAYING) return;
    this.elapsed += dt;
    this.scorePop = Math.max(0, this.scorePop - dt * 4);
    this.waveBanner = Math.max(0, this.waveBanner - dt);
    this._comboTimer -= dt;
    if (this._comboTimer <= 0) this.combo = 0;

    if (this.elapsed >= RUN_SECONDS) {
      this._win();
      return;
    }

    this.waveTimer -= dt;
    if (this.waveTimer <= 0 && this.wave < 8) {
      this.wave++;
      this.waveTimer = 9;
      this._spawnWave(this.wave);
    }

    const shot = this.ship.update(dt);
    if (shot) {
      this.bullets.push(shot);
      this.sfx.shoot();
      this.juice.sparks(shot.x, shot.y, Math.atan2(shot.vy, shot.vx), 3, 130, 0.5, '#ffd9a0', 0.22);
    }
    this._updateBullets(dt);
    for (const e of this.enemies) if (!e.dead) updateEnemy(this, e, dt, this.rng);
    this._updateEnemyBullets(dt);
    this._shipCollisions();

    this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.boss && this.boss.dead) this.boss = null;
    this.juice.update(dt);
  }

  _updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let consumed = false;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (dist2(b.x, b.y, e.x, e.y) < (e.r + 4) ** 2) {
          consumed = true;
          e.hp -= 1;
          e.flash = 1; // white hit-flash, decays in updateEnemy
          this.juice.sparks(b.x, b.y, Math.atan2(b.vy, b.vx), 4, 190, 0.9, e.color, 0.3);
          this.juice.burst(b.x, b.y, 3, '#fff3d6', 90, 0.28, 1.8);
          if (e.hp <= 0) this._killEnemy(e);
          else {
            this.sfx.hit();
            // every landed hit on the boss thumps the camera, so the
            // fight feels weighty without waiting for the kill
            if (e.type === 'colossus') this.juice.kick(3.2, 0.13);
          }
          break;
        }
      }
      if (consumed || b.x < -20 || b.x > VIEW_W + 20 || b.y < -20 || b.y > VIEW_H + 20) {
        this.bullets.splice(i, 1);
      }
    }
  }

  _updateEnemyBullets(dt) {
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.age += dt;
      const off = b.x < -30 || b.x > VIEW_W + 30 || b.y < -30 || b.y > VIEW_H + 30;
      if (b.age > 4.5 || off) {
        this.ebullets.splice(i, 1);
        continue;
      }
      if (this.ship.invuln <= 0 && dist2(b.x, b.y, this.ship.x, this.ship.y) < (SHIELD_RADIUS + b.r) ** 2) {
        this.ebullets.splice(i, 1);
        this._hitShip();
      }
    }
  }

  /** Ram kills: an enemy body that touches the ship hurts both. */
  _shipCollisions() {
    for (const e of this.enemies) {
      if (e.dead || e.type === 'colossus') continue;
      if (this.ship.invuln > 0) continue;
      if (dist2(e.x, e.y, this.ship.x, this.ship.y) < (e.r + SHIP_RADIUS * 0.85) ** 2) {
        this._hitShip();
        this._killEnemy(e);
      }
    }
  }

  _killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    this.combo++;
    this._comboTimer = 3;
    this.combo = Math.min(this.combo, MAX_COMBO);
    const boss = e.type === 'colossus';
    const streak = this.combo % 5 === 0 ? BONUS_KILL_STREAK : 0;

    // combo tiers: sustained chains flare harder at 8 / 12 / 16
    let tierBonus = 0;
    let tierLabel = null;
    for (const tier of COMBO_TIERS) {
      if (this.combo === tier.at) {
        tierBonus = tier.bonus;
        tierLabel = tier.label;
        break;
      }
    }

    // a cinder bursts into two aimed shards on death
    if (e.type === 'cinder') {
      for (const off of [-0.28, 0.28]) {
        this.enemies.push(makeEnemy('shard', e.x, e.y, this.rng, this.wave, this.ship));
        const sh = this.enemies[this.enemies.length - 1];
        sh.phase = Math.random() * Math.PI * 2;
        const a = e.burstA + off;
        sh.vx = Math.cos(a) * 275;
        sh.vy = Math.sin(a) * 275;
      }
      this.juice.burst(e.x, e.y, 10, '#ff4fa0', 150, 0.4, 2);
    }

    const gained = e.score + streak + tierBonus;
    this.score += gained;
    this.scorePop = 1;
    this.juice.burst(e.x, e.y, boss ? 48 : 14, e.color, boss ? 340 : 170, boss ? 1.1 : 0.55, boss ? 4 : 2.6);
    this.juice.ring(e.x, e.y, e.color, e.r * (boss ? 5 : 3.2), 0.5);
    this.juice.floatText(e.x, e.y - e.r, `+${gained}`, e.color, boss ? 20 : 14);
    if (streak) this.juice.floatText(e.x, e.y - e.r - 18, 'STREAK +50', '#ffd23e');
    if (tierLabel) {
      // the tier flare: full-arena ring, flash, and a banner in the HUD's font
      this.juice.kick(7, 0.35);
      this.juice.flashIt(0.35, '#ffd23e');
      this.juice.ring(e.x, e.y, '#ffd23e', 260, 0.7);
      this.juice.floatText(VIEW_W / 2, ARENA.y + 150, tierLabel, '#ffd23e', 22);
    }
    this.juice.kick(boss ? 14 : 2.4, boss ? 0.7 : 0.14);
    this.sfx.kill(boss);
    if (boss) this.juice.flashIt(0.5, '#ffd23e');
  }

  /** The ship is hit: the shield soaks one, then lives drain. */
  _hitShip() {
    const s = this.ship;
    if (s.invuln > 0) return;
    if (s.shieldCd <= 0) {
      s.shieldCd = 4.0;
      s.shieldHot = true;
      this.score += BONUS_SHIELD_HIT;
      this.scorePop = 1;
      this.juice.ring(s.x, s.y, '#78dcff', SHIELD_RADIUS * 2.6, 0.5);
      this.juice.burst(s.x, s.y, 12, '#78dcff', 180, 0.5, 2);
      this.juice.floatText(s.x, s.y - SHIELD_RADIUS - 10, 'SHIELD!', '#78dcff');
      this.juice.kick(4, 0.22);
      this.sfx.shield();
      s.invuln = 0.35;
      return;
    }
    this.lives--;
    this.combo = 0;
    s.invuln = INVULN_SECONDS;
    this.sfx.hurt();
    this.juice.burst(s.x, s.y, 26, '#ff5470', 240, 0.8, 3);
    this.juice.ring(s.x, s.y, '#ff5470', 64, 0.5);
    this.juice.kick(9, 0.4);
    this.juice.flashIt(0.35, '#ff5470');
    if (this.lives <= 0) this._lose();
  }

  _lose() {
    this.state = STATE.OVER;
    this.victory = false;
    this._saveBest();
    this.juice.floaters.length = 0;
    this.juice.burst(this.ship.x, this.ship.y, 40, '#ffb35c', 300, 1.0, 3);
    this.juice.kick(10, 0.5);
    this.inputLock = 0.8;
    this.sfx.fanfare(false);
  }

  /**
   * Title-screen ambience: a slow parade of harmless embers drifting behind
   * the wordmark, and the ship idling in the middle of the arena. No scoring,
   * no damage — it exists so the cover screenshot reads as a living game.
   */
  _titleAmbience(dt) {
    this._titleT = (this._titleT ?? 0) + dt;
    this._titleSpawn = (this._titleSpawn ?? 0) - dt;
    if (this._titleSpawn <= 0) {
      this._titleSpawn = 0.85;
      const x = ARENA.x + this.rng.range(0, ARENA.w);
      const e = makeEnemy(this.rng.pick(['wisp', 'wisp', 'spore']), x, ARENA.y - 30, this.rng, 0, this.ship);
      e.vy = 34 + this.rng.range(0, 26);
      e.hp = 1;
      this.enemies.push(e);
    }
    for (const e of this.enemies) {
      e.y += (e.vy || 40) * dt;
      if (e.type === 'wisp') e.x += Math.sin(e.t * 1.4 + e.phase) * 28 * dt;
      e.t += dt;
      if (e.y > VIEW_H + 40) e.dead = true;
    }
    this.enemies = this.enemies.filter((e) => !e.dead);

    // the ship idles: a slow figure-eight so the title screen has motion
    this.ship.keys.clear();
    const a = this._titleT * 0.7;
    this.ship.mouse.x = VIEW_W / 2 + Math.cos(a) * 180;
    this.ship.mouse.y = VIEW_H * 0.72 + Math.sin(a * 2) * 40;
    this.ship.update(dt);
    this.ship.vx = Math.cos(a) * 40;
    this.ship.vy = Math.sin(a * 2) * 24;
    this.juice.update(dt);
  }

  _win() {
    this.state = STATE.WON;
    this.victory = true;
    this.score += BONUS_TIME;
    this._saveBest();
    this.juice.floaters.length = 0;
    this.juice.burst(VIEW_W / 2, VIEW_H / 2, 64, '#9ff0ff', 300, 1.2, 3);
    this.juice.flashIt(0.6, '#9ff0ff');
    this.inputLock = 0.8;
    this.sfx.fanfare(true);
  }

  _saveBest() {
    if (this.score > this.best) {
      this.best = this.score;
      try {
        localStorage.setItem('emberwake.best', String(this.best));
      } catch {
        /* private mode: the best score just does not persist */
      }
    }
  }

  /** Keys pressed since the previous frame (for Enter-to-start). */
  drainInput() {
    const list = [...this.pressed];
    this.pressed.clear();
    return list;
  }

  draw(t) {
    const ctx = this.ctx;
    const s = this.juice.shakeTime > 0 ? this.juice.shake : 0;
    const sx = s ? (Math.random() * 2 - 1) * s : 0;
    const sy = s ? (Math.random() * 2 - 1) * s : 0;

    drawBackground(ctx, t, sx, sy);

    ctx.save();
    ctx.translate(sx, sy);
    this.ship.showReticle = this.state === STATE.PLAYING;
    if (this.state !== STATE.TITLE) {
      this._drawShots(ctx);
      drawEBullets(ctx, this.ebullets);
      drawEnemies(ctx, this.enemies);
      if (this.boss && !this.boss.dead) drawBossBar(ctx, this.boss);
      if (this.state === STATE.PLAYING) this.ship.draw(ctx);
      this.juice.draw(ctx);
    } else {
      // the title screen keeps a quiet live arena behind it
      drawEnemies(ctx, this.enemies);
      this.ship.draw(ctx);
      this.juice.draw(ctx);
    }
    ctx.restore();

    if (this.state === STATE.PLAYING) drawHud(ctx, this);
    if (this.state === STATE.TITLE) drawTitle(ctx, this, t);
    else if (this.state === STATE.OVER || this.state === STATE.WON) {
      // the veil hides the last fight; a couple of embers keep it alive
      this.juice.draw(ctx);
      drawEnd(ctx, this, this.victory, t);
    }
  }

  _drawShots(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
      const g = ctx.createLinearGradient(0, -16, 0, 8);
      g.addColorStop(0, 'rgba(255,240,190,0)');
      g.addColorStop(0.45, 'rgba(255,217,160,0.85)');
      g.addColorStop(1, '#fff8e0');
      ctx.fillStyle = g;
      ctx.fillRect(-2.2, -16, 4.4, 24);
      ctx.restore();
    }
    ctx.restore();
  }
}
