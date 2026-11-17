/**
 * Procedural sound: every effect is synthesised with WebAudio oscillators and
 * noise, so the game ships no audio files and makes no network request.
 * The context is created lazily on the first user gesture (browsers require
 * one), and every call is guarded so a blocked or missing audio device is
 * never fatal.
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.lastShot = 0;
    this._noise = null;
  }

  /** Create the audio graph; safe to call repeatedly. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctx) {
        this.enabled = false;
        return;
      }
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.enabled = false;
    }
  }

  /** A short tone with an exponential pitch sweep and a soft attack. */
  tone({ type = 'square', from = 440, to = 220, dur = 0.09, gain = 0.14, delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Filtered noise burst, used for impacts. */
  noise({ dur = 0.18, gain = 0.18, freq = 900, q = 0.9, delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    if (!this._noise) {
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._noise = buf;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.25), t0 + dur);
    filter.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  shoot() {
    if (!this.ctx) return;
    // throttle: at most ~14 shots a second of voice
    const now = this.ctx.currentTime;
    if (now - this.lastShot < 0.07) return;
    this.lastShot = now;
    this.tone({ type: 'square', from: 880, to: 320, dur: 0.07, gain: 0.05 });
  }

  hit() {
    this.tone({ type: 'triangle', from: 520, to: 380, dur: 0.05, gain: 0.05 });
  }

  kill(boss = false) {
    if (boss) {
      this.noise({ dur: 0.7, gain: 0.3, freq: 1400 });
      this.tone({ type: 'sawtooth', from: 180, to: 40, dur: 0.8, gain: 0.18 });
    } else {
      this.noise({ dur: 0.16, gain: 0.13, freq: 1100 });
      this.tone({ type: 'triangle', from: 360, to: 90, dur: 0.16, gain: 0.07 });
    }
  }

  shield() {
    this.tone({ type: 'sine', from: 620, to: 1240, dur: 0.22, gain: 0.12 });
    this.tone({ type: 'sine', from: 930, to: 1600, dur: 0.18, gain: 0.06, delay: 0.03 });
  }

  hurt() {
    this.noise({ dur: 0.32, gain: 0.24, freq: 500 });
    this.tone({ type: 'sawtooth', from: 300, to: 60, dur: 0.34, gain: 0.14 });
  }

  wave() {
    this.tone({ type: 'triangle', from: 300, to: 520, dur: 0.13, gain: 0.07 });
    this.tone({ type: 'triangle', from: 460, to: 700, dur: 0.13, gain: 0.05, delay: 0.11 });
  }

  /** Three rising notes for a win, three falling ones for a loss. */
  fanfare(win) {
    const notes = win ? [392, 523, 659, 784] : [330, 262, 196, 147];
    notes.forEach((f, i) => {
      this.tone({
        type: win ? 'triangle' : 'sawtooth',
        from: f, to: f * (win ? 1.004 : 0.996), dur: 0.26,
        gain: 0.09, delay: i * 0.14,
      });
    });
  }

  start() {
    this.tone({ type: 'triangle', from: 220, to: 660, dur: 0.3, gain: 0.11 });
  }
}
