/**
 * Procedural sound for Emberwake. Every cue is synthesised at runtime from
 * oscillators and filtered noise, so the game ships no audio files, makes no
 * network request, and stays inside the entry's "fully offline" promise.
 *
 * Ground rules this module keeps:
 *   - the AudioContext is created lazily on the first user gesture, because
 *     browsers refuse to start one otherwise;
 *   - every method is guarded: a blocked context, a missing device or a
 *     suspended context is never fatal, it is simply silent;
 *   - nothing is scheduled further ahead than a fraction of a second, so
 *     muting or tab-switching mid-cue cannot leave an ugly tail behind.
 *
 * Folded into this pass:
 *   - the victory screen now gets a real three-note leitmotif (a rising
 *     E-G-B triad that resolves upward) instead of a generic scale run, and
 *     it is a distinct, named cue rather than a side effect of fanfare();
 *   - a siren whose wobble drops in pitch as the run heats up: at wanted
 *     star 2 and above the two-tone alarm sits a fifth lower and its LFO
 *     slows, so a dangerous run *sounds* heavier rather than just louder.
 */

/** MIDI note number -> Hz, so the cues below can be written as note names. */
const A4 = 440;
function hz(midi) {
  return A4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * The victory motif, written as scale degrees rather than raw frequencies:
 * E5, G5, B5 — a major triad climbing, each note held and then handed to the
 * next. This is the melody the win screen plays; nothing else in the game
 * uses these three notes in this order.
 */
const WIN_MOTIF = [
  { midi: 76, dur: 0.30, gain: 0.10 }, // E5
  { midi: 79, dur: 0.28, gain: 0.09 }, // G5
  { midi: 83, dur: 0.46, gain: 0.10 }, // B5
];

/** The defeat figure: three notes falling, the inverse shape of the motif. */
const LOSE_MOTIF = [
  { midi: 64, dur: 0.30, gain: 0.09 }, // E4
  { midi: 60, dur: 0.30, gain: 0.09 }, // C4
  { midi: 52, dur: 0.50, gain: 0.10 }, // E3
];

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.lastShot = 0;
    this._noise = null;
    /** Wanted stars: 0..5. Danger level, drives the siren's pitch. */
    this.stars = 0;
    /** Wall-clock of the last siren, so it cannot retrigger into a stutter. */
    this._lastSiren = -1;
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

  /** True when a cue can actually be scheduled right now. */
  get live() {
    return Boolean(this.enabled && this.ctx && this.ctx.state !== 'closed');
  }

  /**
   * Wanted stars: how much heat the run is under (0..5). The siren's pitch
   * and the intensity of the wave cue both read it. Deliberately cheap — it
   * is called on wave boundaries, not per frame.
   */
  setStars(n) {
    this.stars = Math.max(0, Math.min(5, Math.round(n)));
  }

  /** A short tone with an exponential pitch sweep and a soft attack. */
  tone({ type = 'square', from = 440, to = 220, dur = 0.09, gain = 0.14, delay = 0 }) {
    if (!this.live) return;
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

  /**
   * A held note with a slow vibrato and a proper sustain/decay: used for the
   * leitmotif, where a plain sweeping tone would sound like a laser rather
   * than a horn. Adds its own quiet octave for weight.
   */
  note({ midi, dur = 0.3, gain = 0.1, delay = 0, type = 'triangle', octave = true }) {
    if (!this.live) return;
    const t0 = this.ctx.currentTime + delay;
    const f = hz(midi);

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);

    // vibrato: a slow LFO wiggling the pitch by a few cents
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 5.2;
    lfoGain.gain.value = f * 0.006;
    lfo.connect(lfoGain).connect(osc.frequency);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.03);
    env.gain.exponentialRampToValueAtTime(gain * 0.55, t0 + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.04);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.04);

    if (octave) {
      // a quiet sub-octave, so the note reads as a horn in a big room
      const sub = this.ctx.createOscillator();
      const subEnv = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(f / 2, t0);
      subEnv.gain.setValueAtTime(0.0001, t0);
      subEnv.gain.exponentialRampToValueAtTime(gain * 0.35, t0 + 0.04);
      subEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      sub.connect(subEnv).connect(this.master);
      sub.start(t0);
      sub.stop(t0 + dur + 0.04);
    }
  }

  /** Filtered noise burst, used for impacts. */
  noise({ dur = 0.18, gain = 0.18, freq = 900, q = 0.9, delay = 0 }) {
    if (!this.live) return;
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

  // ------------------------------------------------------------------ cues

  shoot() {
    if (!this.live) return;
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
      // the colossus dies downward: a long fall through two octaves
      this.tone({ type: 'triangle', from: 120, to: 30, dur: 1.1, gain: 0.12, delay: 0.12 });
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

  /**
   * The wave alarm. At zero or one star it is the familiar two-note rise.
   * From two stars up a siren joins in and the wobble drops: the base tone
   * falls from 302 Hz toward 208 Hz and the LFO slows from 0.62 Hz to 0.34 Hz
   * as stars climb, so the alarm gets heavier and more ominous instead of
   * merely louder. `stars` defaults to whatever setStars() last banked.
   */
  wave(stars = this.stars) {
    const s = Math.max(0, Math.min(5, stars));
    this.tone({ type: 'triangle', from: 300, to: 520, dur: 0.13, gain: 0.07 });
    this.tone({ type: 'triangle', from: 460, to: 700, dur: 0.13, gain: 0.05, delay: 0.11 });
    if (s < 2) return;

    // the siren proper: one pitch-modulated tone, two wobbles per call
    const now = this.live ? this.ctx.currentTime : 0;
    if (now - this._lastSiren < 0.35) return; // never stutter two sirens together
    this._lastSiren = now;

    // the wanted-star ladder: each star takes ~19 Hz off the base pitch and
    // a little off the wobble rate, bottoming out at star 5
    const base = 302 - (s - 2) * 19;      // 302 -> 245 at five stars
    const lfoRate = 0.62 - (s - 2) * 0.07; // 0.62 -> 0.41 Hz
    const depth = 26 + s * 9;             // a wider wobble as it gets worse
    const dur = 1.5;
    this._sirenTone(base, lfoRate, depth, dur, 0.075 + s * 0.006);
  }

  /**
   * The raw siren voice: a triangle carrier with a sine LFO on its frequency
   * and a slow amplitude swell, so it reads as an air-raid wail rather than a
   * beep. Kept private — `wave()` decides the pitch from the star level.
   */
  _sirenTone(base, lfoRate, depth, dur, gain) {
    if (!this.live) return;
    const t0 = this.ctx.currentTime + 0.06;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base, t0);

    // pitch wobble
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(lfoRate, t0);
    lfoGain.gain.setValueAtTime(depth, t0);
    lfo.connect(lfoGain).connect(osc.frequency);

    // amplitude swell: two breaths across the call
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.18);
    env.gain.exponentialRampToValueAtTime(gain * 0.45, t0 + dur * 0.45);
    env.gain.exponentialRampToValueAtTime(gain * 0.9, t0 + dur * 0.72);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.03);

    // a low saw shadow, an octave down, gives the wail some body
    const sub = this.ctx.createOscillator();
    const subEnv = this.ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(base / 2, t0);
    subEnv.gain.setValueAtTime(0.0001, t0);
    subEnv.gain.exponentialRampToValueAtTime(gain * 0.4, t0 + 0.22);
    subEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    sub.connect(subEnv).connect(this.master);
    sub.start(t0);
    sub.stop(t0 + dur + 0.03);
  }

  /**
   * The three-note leitmotif. `win` plays it rising (E5-G5-B5) over a soft
   * tail; a loss plays the mirror figure falling. Exactly three notes: the
   * melody is short enough to be memorable and distinct from every other cue
   * in the game, which is the point of a leitmotif.
   */
  leitmotif(win = true) {
    if (!this.live) return;
    const figure = win ? WIN_MOTIF : LOSE_MOTIF;
    const type = win ? 'triangle' : 'sawtooth';
    let at = 0;
    for (const step of figure) {
      this.note({
        midi: step.midi,
        dur: step.dur,
        gain: step.gain,
        delay: at,
        type,
        octave: win, // the defeat figure stays bare: no heroic sub-octave
      });
      at += step.dur * 0.82;
    }
    if (win) {
      // a quiet shimmer on the final note, so the motif lands rather than
      // just stopping
      const last = figure[figure.length - 1];
      this.tone({
        type: 'sine',
        from: hz(last.midi) * 2,
        to: hz(last.midi) * 2,
        dur: 0.5,
        gain: 0.045,
        delay: at - last.dur * 0.3,
      });
    }
  }

  /**
   * End-of-run fanfare. The melody is the leitmotif; this layers a body under
   * it so the win has weight without a second competing tune.
   */
  fanfare(win) {
    this.leitmotif(win);
    if (win) {
      // a held low fifth under the whole figure: room, not another melody
      this.note({ midi: 52, dur: 1.0, gain: 0.06, delay: 0.02, type: 'sine', octave: false });
      this.note({ midi: 59, dur: 1.0, gain: 0.05, delay: 0.02, type: 'sine', octave: false });
    } else {
      this.noise({ dur: 0.9, gain: 0.10, freq: 340, delay: 0.1 });
    }
  }

  start() {
    this.tone({ type: 'triangle', from: 220, to: 660, dur: 0.3, gain: 0.11 });
  }
}
