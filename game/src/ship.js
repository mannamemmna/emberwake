/**
 * The player ship: an ember-driven arrowhead that flies on WASD, aims at the
 * mouse and lances on the fire button.
 *
 * This module owns its own input listeners so the game loop only ever calls
 * update() and draw(). update() never touches bullets: it returns a shot
 * descriptor (or null) and the game puts it in the pool it already owns.
 *
 * Folded into this pass:
 *   - the hull gets a second outline pass — a dark contour under a pale rim —
 *     so the silhouette survives being drawn on top of additive ember bloom
 *     instead of dissolving into it;
 *   - a thruster trail sampled from real motion, so the streak behind the ship
 *     is a function of how fast it is actually travelling, not a constant
 *     decoration.
 */
import {
  SHIP_RADIUS, SHIP_SPEED, SHIP_ACCEL, SHIP_FRICTION,
  SHIELD_RADIUS, ARENA, VIEW_W, VIEW_H, FIRE_COOLDOWN, BULLET_SPEED,
} from './config.js';
import { clamp, damp } from './rng.js';

/** Trail sampling: one node every this many seconds of flight. */
const TRAIL_SAMPLE = 0.018;
/** How long a trail node survives, in seconds. */
const TRAIL_LIFE = 0.26;
/** Hard cap on stored nodes, so a long run cannot grow the array. */
const TRAIL_MAX = 26;
/** A jump longer than this means the ship was repositioned: drop the trail. */
const TRAIL_TELEPORT = 90;

export class Ship {
  constructor() {
    this.x = VIEW_W / 2;
    this.y = VIEW_H - 90;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2;   // nose up
    this.fireCd = 0;             // seconds until the next shot is ready
    this.invuln = 0;             // seconds of post-hit immunity left
    this.shieldHot = false;      // shield just soaked a hit
    this.shieldCd = 0;           // seconds until the shield is ready again
    this.thrust = 0;             // 0..1, drives the exhaust plume
    this.muzzle = 0;             // muzzle-flash timer
    this.showReticle = true;     // aim ring at the mouse, hidden on menus

    // motion history for the trail: newest node last
    this.trail = [];
    this._trailClock = 0;

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
    this.angle = -Math.PI / 2;
    this.invuln = 1.0;
    this.shieldHot = false;
    this.shieldCd = 0;
    this.muzzle = 0;
    this.trail.length = 0;
    this._trailClock = 0;
  }

  get hasShield() {
    return this.shieldHot && this.shieldCd > 0;
  }

  /** Current speed as a 0..1 fraction of the ship's cap. */
  get speedFrac() {
    return Math.min(1, Math.hypot(this.vx, this.vy) / SHIP_SPEED);
  }

  /** Append a trail node and age out the old ones. */
  _ageTrail(dt) {
    for (const n of this.trail) n.life -= dt;
    while (this.trail.length && (this.trail[0].life <= 0 || this.trail.length > TRAIL_MAX)) {
      this.trail.shift();
    }

    const last = this.trail[this.trail.length - 1];
    if (last && Math.hypot(this.x - last.x, this.y - last.y) > TRAIL_TELEPORT) {
      // teleported (a staged frame, a respawn): a trail across the gap would
      // read as a wall of light, so start over from here
      this.trail.length = 0;
    }

    this._trailClock += dt;
    if (this._trailClock >= TRAIL_SAMPLE) {
      this._trailClock = 0;
      this.trail.push({ x: this.x, y: this.y, life: TRAIL_LIFE });
    }
  }

  /**
   * Advance the ship by dt. Returns the shot for the game to spawn,
   * as { x, y, vx, vy }, or null when the weapon is not ready.
   */
  update(dt) {
    // ---- steering: a held key sets an input direction, friction bleeds it
    let ax = 0, ay = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) ax -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) ax += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) ay -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) ay += 1;
    const keyMag = Math.hypot(ax, ay);
    if (keyMag > 0) {
      // normalise so diagonals are not faster than the cardinals
      this.vx += (ax / keyMag) * SHIP_ACCEL * dt;
      this.vy += (ay / keyMag) * SHIP_ACCEL * dt;
    }

    const fr = Math.exp(-SHIP_FRICTION * dt);
    this.vx *= fr;
    this.vy *= fr;

    // hard speed cap, keeping the direction
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > SHIP_SPEED) {
      this.vx = (this.vx / sp) * SHIP_SPEED;
      this.vy = (this.vy / sp) * SHIP_SPEED;
    }

    // thrust follows input intent, so the plume lights when the pilot commits
    // and dies away when they coast
    this.thrust = damp(this.thrust, keyMag > 0 ? 1 : 0, 8, dt);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // the arena is a hard box: the ship may not leave the board
    this.x = clamp(this.x, ARENA.x + SHIP_RADIUS, ARENA.x + ARENA.w - SHIP_RADIUS);
    this.y = clamp(this.y, ARENA.y + SHIP_RADIUS, ARENA.y + ARENA.h - SHIP_RADIUS);

    // ---- aiming: turn toward the mouse at a fixed angular rate, shortest way
    const tx = this.mouse.x - this.x;
    const ty = this.mouse.y - this.y;
    const target = Math.atan2(ty, tx);
    let da = target - this.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    this.angle += da * Math.min(1, dt * 14);

    // ---- timers
    this.fireCd -= dt;
    this.invuln -= dt;
    this.shieldCd -= dt;
    this.muzzle -= dt;
    if (this.shieldCd <= 0) this.shieldHot = false;

    this._ageTrail(dt);

    // ---- firing: hold the mouse (or space) for a steady stream
    const wantFire = this.mouseDown || this.keys.has(' ');
    if (!wantFire || this.fireCd > 0) return null;

    this.fireCd = FIRE_COOLDOWN;
    this.muzzle = 0.07;
    const nx = Math.cos(this.angle);
    const ny = Math.sin(this.angle);
    return {
      x: this.x + nx * 20,
      y: this.y + ny * 20,
      vx: nx * BULLET_SPEED,
      vy: ny * BULLET_SPEED,
    };
  }

  /** The hull outline, nose-up in local space. Shared by every draw pass. */
  _hullPath(ctx) {
    const R = SHIP_RADIUS;
    ctx.beginPath();
    // left wing
    ctx.moveTo(-R * 1.15, R * 0.95);
    ctx.lineTo(-R * 0.28, R * 0.15);
    ctx.lineTo(-R * 0.2, R * 0.95);
    ctx.closePath();
    // right wing
    ctx.moveTo(R * 1.15, R * 0.95);
    ctx.lineTo(R * 0.28, R * 0.15);
    ctx.lineTo(R * 0.2, R * 0.95);
    ctx.closePath();
    // the arrowhead fuselage
    ctx.moveTo(0, -R * 1.5);
    ctx.lineTo(R * 0.72, R * 0.55);
    ctx.lineTo(0, R * 0.22);
    ctx.lineTo(-R * 0.72, R * 0.55);
    ctx.closePath();
  }

  /** Draw the ship, its trail, shield and exhaust. Caller owns the camera. */
  draw(ctx) {
    const R = SHIP_RADIUS;
    this._drawTrail(ctx);

    // ---- exhaust plume, behind the hull
    if (this.thrust > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      const len = 12 + this.thrust * 16 + Math.random() * 4;
      const grad = ctx.createLinearGradient(-10, 0, -10 - len, 0);
      grad.addColorStop(0, 'rgba(255,190,120,0.85)');
      grad.addColorStop(0.5, 'rgba(255,140,70,0.35)');
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

    // ---- shield ring: hot cyan when banked, dull ember while recharging
    if (this.hasShield || this.shieldCd > 0) {
      const ready = this.shieldCd <= 0;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 90);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = ready ? `rgba(120,220,255,${0.25 + 0.25 * pulse})` : 'rgba(255,120,80,0.20)';
      ctx.lineWidth = ready ? 2 : 1.2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, SHIELD_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2); // hull art is drawn nose-up
    // blink during invulnerability
    if (this.invuln > 0 && Math.floor(performance.now() / 90) % 2 === 0) ctx.globalAlpha = 0.45;

    // ---- under-glow: the ship carries its own light into the dark field
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, R * 2.6);
    halo.addColorStop(0, 'rgba(255,170,90,0.35)');
    halo.addColorStop(0.55, 'rgba(255,120,70,0.10)');
    halo.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, R * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // ---- silhouette pass: a dark inflated hull behind the real one. Against
    // additive ember bloom the fuselage would otherwise lose its edge, so the
    // ship gets a hard dark rim before any bright paint goes down.
    ctx.save();
    ctx.scale(1.14, 1.12);
    this._hullPath(ctx);
    ctx.fillStyle = 'rgba(12,5,14,0.92)';
    ctx.fill();
    ctx.restore();

    // ---- paint: wings, then the arrowhead over them
    ctx.fillStyle = '#f4f1e4';
    const Rw = R;
    ctx.beginPath();
    ctx.moveTo(-Rw * 1.15, Rw * 0.95);
    ctx.lineTo(-Rw * 0.28, Rw * 0.15);
    ctx.lineTo(-Rw * 0.2, Rw * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(Rw * 1.15, Rw * 0.95);
    ctx.lineTo(Rw * 0.28, Rw * 0.15);
    ctx.lineTo(Rw * 0.2, Rw * 0.95);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffb35c';
    ctx.beginPath();
    ctx.moveTo(0, -R * 1.5);
    ctx.lineTo(R * 0.72, R * 0.55);
    ctx.lineTo(0, R * 0.22);
    ctx.lineTo(-R * 0.72, R * 0.55);
    ctx.closePath();
    ctx.fill();

    // hot leading edge, so the nose reads as the brightest point
    ctx.fillStyle = '#fff6df';
    ctx.beginPath();
    ctx.moveTo(0, -R * 1.5);
    ctx.lineTo(R * 0.3, -R * 0.1);
    ctx.lineTo(-R * 0.3, -R * 0.1);
    ctx.closePath();
    ctx.fill();

    // ---- rim pass: one bright contour over the whole silhouette. This is the
    // second outline the last version lacked; it separates hull from wings and
    // both from the field in a single stroke.
    this._hullPath(ctx);
    ctx.strokeStyle = 'rgba(255,244,220,0.82)';
    ctx.lineWidth = 1.1;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // engine core
    ctx.fillStyle = '#ff5470';
    ctx.beginPath();
    ctx.arc(0, R * 0.55, R * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,214,168,0.9)';
    ctx.beginPath();
    ctx.arc(0, R * 0.55, R * 0.1, 0, Math.PI * 2);
    ctx.fill();

    // muzzle flash
    if (this.muzzle > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#fff0c0';
      ctx.beginPath();
      ctx.arc(0, -R * 1.6, 6 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ---- aim reticle at the mouse (play only)
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

  /**
   * The motion trail. Nodes are real positions the hull has occupied, so the
   * streak bends with the actual flight path; brightness and width scale with
   * current speed, which makes a hard strafe read as a hard strafe.
   */
  _drawTrail(ctx) {
    if (this.trail.length < 2) return;
    const speed = this.speedFrac;
    if (speed < 0.18) return; // a parked ship leaves nothing to trail

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      const age = Math.max(0, b.life / TRAIL_LIFE);          // 1 fresh -> 0 gone
      const t = i / this.trail.length;                        // tail -> head
      const alpha = 0.30 * age * t * (0.4 + 0.6 * speed);
      if (alpha <= 0.004) continue;
      ctx.strokeStyle = `rgba(255,168,96,${alpha.toFixed(3)})`;
      ctx.lineWidth = 1 + 5.5 * t * speed;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // a brighter core streak at the very end of the trail
    const head = this.trail[this.trail.length - 1];
    const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 22 * speed + 6);
    glow.addColorStop(0, `rgba(255,220,170,${(0.20 * speed).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(255,140,70,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 22 * speed + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
