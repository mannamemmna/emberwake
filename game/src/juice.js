/**
 * Particles, floaters and the screen-shake / hit-flash juice system.
 * Pure data + update + draw, no game logic of its own.
 */
const MAX_PARTICLES = 512;

export class Juice {
  constructor() {
    this.particles = [];
    this.floaters = []; // score popups
    this.shake = 0;         // shake magnitude in px
    this.shakeTime = 0;     // seconds of shake left
    this.flash = 0;         // 0..1 white-hot flash on the arena
    this.flashColor = '#ffffff';
  }

  /** One additive ember sprite with velocity, drag and a life. */
  spawn(x, y, opts = {}) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      x, y,
      vx: opts.vx ?? 0,
      vy: opts.vy ?? 0,
      r: opts.r ?? 2.5,
      r0: opts.r ?? 2.5,
      life: opts.life ?? 0.6,
      age: 0,
      color: opts.color ?? '#ffb35c',
      drag: opts.drag ?? 2.2,
      gravity: opts.gravity ?? 0,
      grow: opts.grow ?? false,
      shape: opts.shape ?? 'dot', // 'dot' | 'ring' | 'spark'
      angle: opts.angle ?? 0,
    });
  }

  /** A burst of embers in every direction. */
  burst(x, y, count, color, speed = 160, life = 0.5, size = 2.5) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color, life: life * (0.6 + Math.random() * 0.8),
        r: size * (0.6 + Math.random() * 0.8),
      });
    }
  }

  /** A directed spark trail (shrapnel, explosions). */
  sparks(x, y, angle, count, speed, spread, color, life = 0.5) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color, life: life * (0.5 + Math.random()),
        r: 1.6 + Math.random() * 1.6,
        shape: 'spark',
        angle: a,
        drag: 1.4,
      });
    }
  }

  /** An expanding shock ring. */
  ring(x, y, color, maxR = 40, life = 0.45) {
    this.spawn(x, y, { color, life, r: 4, r0: 4, grow: true, shape: 'ring', ringTarget: maxR });
  }

  /** A score popup that rises and fades. */
  floatText(x, y, text, color = '#ffe9d2', size = 14) {
    this.floaters.push({ x, y, text, color, size, age: 0, life: 0.9 });
  }

  kick(strength, seconds = 0.25) {
    this.shake = Math.max(this.shake, strength);
    this.shakeTime = Math.max(this.shakeTime, seconds);
  }

  /** full-screen flash (hit = white, crit = amber). */
  flashIt(strength, color = '#ffffff') {
    this.flash = Math.max(this.flash, strength);
    this.flashColor = color;
  }

  /**
   * Advance everything by dt. Returns the current shake offset the
   * renderer should apply to the camera.
   */
  update(dt) {
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      const k = 1 - p.age / p.life;
      if (p.grow) p.r = p.r0 + (p.ringTarget - p.r0) * (1 - k);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-p.drag * dt);
      p.vy *= Math.exp(-p.drag * dt);
      p.vy += p.gravity * dt;
      p.k = k;
    }
    // floaters
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.age += dt;
      f.y -= 26 * dt;
      if (f.age >= f.life) this.floaters.splice(i, 1);
    }
    // shake decay
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime <= 0) this.shake = 0;
    }
    // flash decay
    this.flash = Math.max(0, this.flash - dt * 3.2);
    return {
      dx: this.shake > 0 ? (Math.random() * 2 - 1) * this.shake : 0,
      dy: this.shake > 0 ? (Math.random() * 2 - 1) * this.shake : 0,
    };
  }

  /** Draw particles + floaters. Caller sets up the camera transform first. */
  draw(ctx) {
    // additive pass for embers
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const a = Math.min(1, p.k ?? 0);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === 'ring') {
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 * a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.shape === 'spark') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillRect(-5, -0.9, 10, 1.8);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.r * (0.4 + 0.6 * a)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // floaters on top, normal blend
    for (const f of this.floaters) {
      const a = 1 - f.age / f.life;
      ctx.globalAlpha = a;
      ctx.font = `700 ${f.size}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    // hit flash veil
    if (this.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flash * 0.5;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(-80, -80, 1120, 700);
      ctx.restore();
    }
  }
}
