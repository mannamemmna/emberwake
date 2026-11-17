/**
 * Emberwake — deterministic seeded random generator and small math helpers.
 * Every run is replayable from a seed: waves, enemy placements, drift.
 */
export class Rng {
  /** 32-bit xorshift state. */
  state;
  constructor(seed) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }
  /** 32-bit step, 0..1 float. */
  next() {
    let s = this.state;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.state = s >>> 0;
    return this.state / 4294967296;
  }
  /** float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }
  /** integer in [min, max] inclusive. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick(items) {
    return items[Math.floor(this.next() * items.length)];
  }
  /** weighted pick: weights parallel to items. */
  weighted(items, weights) {
    let total = 0;
    for (const w of weights) total += w;
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

/** distance squared between two points. */
export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** exponential smoothing toward a target, framerate independent. */
export function damp(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Deterministic one-shot value noise (no state kept, so the title-screen
 * ember field and star field are stable across frames).
 */
export function hashNoise(seed, x, y) {
  let h = seed ^ (x * 374761393) ^ (y * 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
