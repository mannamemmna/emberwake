/**
 * The ship: player-controlled, mouse-aimed.
 * Input (WASD/arrows + mouse + fire button) is folded in here so the
 * game loop can call update() and draw() without knowing about keys.
 */
import {
  SHIP_RADIUS, SHIP_SPEED, SHIP_ACCEL, SHIP_FRICTION,
  SHIELD_RADIUS, ARENA, VIEW_W, VIEW_H, FIRE_COOLDOWN, BULLET_SPEED,
} from './config.js';
import { clamp, damp, dist2 } from './rng.js';

export class Ship {
  constructor() {
    this.x = VIEW_W / 2;
    this.y = VIEW_H - 90;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2; // faces up
    this.fireCd = 0;           // seconds until the next shot is ready
    this.invuln = 0;          // seconds of post-hit immunity left
    this.shieldHot = false;   // shield just soaked a hit
    this.shieldCd = 0;        // seconds until the shield is ready again
    this.thrust = 0;          // 0..1, for the exhaust flame
    this.muzzle = 0;         // muzzle-flash timer
    this.showReticle = true; // the aim ring at the mouse, hidden on menus

    // input
    this.keys = new Set();
    this.mouse = { x: VIEW_W / 2, y: VIEW_H / 2 - 100 };
    this.mouseDown = false;

    this._bind();
  }

  /** Keyboard + mouse listeners. Returns a detach function. */
  _bind() {
    const onKey = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') {
        e.preventDefault();
      }
      this.keys.add(k);
    };
    const offKey = (e) => this.keys.delete(e.key.toLowerCase());
    const onMove = (e) => {
      const rect = this._canvas ? this._canvas.getBoundingClientRect() : null;
      if (!rect) return;
      // screen px -> world units (the canvas is CSS-scaled)
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
      this.mouse.y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    };
    const onDown = (e) => {
      if (e.button === 0) this.mouseDown = true;
    };
    const onUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
    };
    const onCtx = (e) => e.preventDefault();

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', offKey);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('contextmenu', onCtx);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', offKey);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('contextmenu', onCtx);
    };
  }

  /** The canvas element, for mouse coordinate conversion. */
  setCanvas(canvas) {
    this._canvas = canvas;
  }

  reset() {
    this.x = VIEW_W / 2;
    this.y = VIEW_H - 90;
    this.vx = this.vy = 0;
    this.invuln = 1.0;
    this.shieldHot = false;
    this.shieldCd = 0;
  }

  get hasShield() {
    return this.shieldHot && this.shieldCd > 0;
  }

  /**
   * Advance the ship by dt. Emits the shot as a return value so the
   * game owns the bullet pool: returns {x, y, angle} or null.
   */
  update(dt) {
    // keyboard vector
    let ax = 0, ay = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) ax -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) ax += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) ay -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) ay += 1;
    const keyMag = Math.hypot(ax, ay);
    if (keyMag > 0) {
      this.vx += (ax / keyMag) * SHIP_ACCEL * dt;
      this.vy += (ay / keyMag) * SHIP_ACCEL * dt;
    }

    // friction
    const fr = Math.exp(-SHIP_FRICTION * dt);
    this.vx *= fr;
    this.vy *= fr;

    // cap speed
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > SHIP_SPEED) {
      this.vx = (this.vx / sp) * SHIP_SPEED;
      this.vy = (this.vy / sp) * SHIP_SPEED;
      this.thrust = 0.4;
    } else {
      this.thrust = damp(this.thrust, keyMag > 0 ? 1 : 0, 8, dt);
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // clamp to the arena (the ship may not leave the board)
    this.x = clamp(this.x, ARENA.x + SHIP_RADIUS, ARENA.x + ARENA.w - SHIP_RADIUS);
    this.y = clamp(this.y, ARENA.y + SHIP_RADIUS, ARENA.y + ARENA.h - SHIP_RADIUS);

    // aim: the ship turns toward the mouse smoothly
    const tx = this.mouse.x - this.x;
    const ty = this.mouse.y - this.y;
    const target = Math.atan2(ty, tx);
    let da = target - this.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    this.angle += da * Math.min(1, dt * 14);

    // timers
    this.fireCd -= dt;
    this.invuln -= dt;
    this.shieldCd -= dt;
    this.muzzle -= dt;
    if (this.shieldCd <= 0) this.shieldHot = false;

    // fire: hold mouse (or space) for a steady stream
    const wantFire = this.mouseDown || this.keys.has(' ');
    let shot = null;
    if (wantFire && this.fireCd <= 0) {
      this.fireCd = FIRE_COOLDOWN;
      this.muzzle = 0.07;
      const nx = Math.cos(this.angle);
      const ny = Math.sin(this.angle);
      shot = {
        x: this.x + nx * 20,
        y: this.y + ny * 20,
        vx: nx * BULLET_SPEED,
        vy: ny * BULLET_SPEED,
      };
    }
    return shot;
  }

  /** Draw the ship + shield + exhaust. Caller handles the camera. */
  draw(ctx) {
    // exhaust plume (additive, behind the hull)
    if (this.thrust > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      const len = 12 + this.thrust * 16 + Math.random() * 4;
      const grad = ctx.createLinearGradient(-10, 0, -10 - len, 0);
      grad.addColorStop(0, 'rgba(255,190,120,0.85)');
      grad.addColorStop(1, 'rgba(255,90,50,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-8, -5);
      ctx.lineTo(-8 - len, 0);
      ctx.lineTo(-8, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // shield ring
    if (this.hasShield || this.shieldCd > 0) {
      const ready = this.shieldCd <= 0;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 90);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = ready ? `rgba(120,220,255,${0.25 + 0.25 * pulse})` : `rgba(255,120,80,${0.2})`;
      ctx.lineWidth = ready ? 2 : 1.2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, SHIELD_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // hull: a bright arrowhead with swept wings and a glowing core
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2); // hull art is drawn nose-up
    // blink during invulnerability
    if (this.invuln > 0 && Math.floor(performance.now() / 90) % 2 === 0) ctx.globalAlpha = 0.45;

    // under-glow so the ship always reads against the dark field
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, SHIP_RADIUS * 2.6);
    halo.addColorStop(0, 'rgba(255,170,90,0.35)');
    halo.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, SHIP_RADIUS * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // swept wings
    ctx.fillStyle = '#f4f1e4';
    ctx.beginPath();
    ctx.moveTo(-SHIP_RADIUS * 1.15, SHIP_RADIUS * 0.95);
    ctx.lineTo(-SHIP_RADIUS * 0.28, SHIP_RADIUS * 0.15);
    ctx.lineTo(-SHIP_RADIUS * 0.2, SHIP_RADIUS * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(SHIP_RADIUS * 1.15, SHIP_RADIUS * 0.95);
    ctx.lineTo(SHIP_RADIUS * 0.28, SHIP_RADIUS * 0.15);
    ctx.lineTo(SHIP_RADIUS * 0.2, SHIP_RADIUS * 0.95);
    ctx.closePath();
    ctx.fill();

    // main hull: a long arrowhead
    ctx.fillStyle = '#ffb35c';
    ctx.beginPath();
    ctx.moveTo(0, -SHIP_RADIUS * 1.5);
    ctx.lineTo(SHIP_RADIUS * 0.72, SHIP_RADIUS * 0.55);
    ctx.lineTo(0, SHIP_RADIUS * 0.22);
    ctx.lineTo(-SHIP_RADIUS * 0.72, SHIP_RADIUS * 0.55);
    ctx.closePath();
    ctx.fill();
    // hot leading edge
    ctx.fillStyle = '#fff6df';
    ctx.beginPath();
    ctx.moveTo(0, -SHIP_RADIUS * 1.5);
    ctx.lineTo(SHIP_RADIUS * 0.3, -SHIP_RADIUS * 0.1);
    ctx.lineTo(-SHIP_RADIUS * 0.3, -SHIP_RADIUS * 0.1);
    ctx.closePath();
    ctx.fill();

    // engine core
    ctx.fillStyle = '#ff5470';
    ctx.beginPath();
    ctx.arc(0, SHIP_RADIUS * 0.55, SHIP_RADIUS * 0.26, 0, Math.PI * 2);
    ctx.fill();

    // muzzle flash
    if (this.muzzle > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#fff0c0';
      ctx.beginPath();
      ctx.arc(0, -SHIP_RADIUS * 1.6, 6 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // faint aim reticle at the mouse (play only)
    if (!this.showReticle) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,220,170,0.35)';
    ctx.lineWidth = 1;
    const mx = this.mouse.x, my = this.mouse.y;
    ctx.beginPath();
    ctx.arc(mx, my, 10, 0, Math.PI * 2);
    ctx.moveTo(mx - 14, my); ctx.lineTo(mx - 6, my);
    ctx.moveTo(mx + 6, my); ctx.lineTo(mx + 14, my);
    ctx.stroke();
    ctx.restore();
  }
}
