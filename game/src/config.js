/**
 * World geometry: the arena rectangle, canvas resolution, and derived constants.
 * Everything is drawn in world units; the canvas is scaled to fit.
 */
export const VIEW_W = 960;
export const VIEW_H = 540;

/** The playable arena (leaves room for the HUD band at the top). */
export const ARENA = { x: 24, y: 72, w: VIEW_W - 48, h: VIEW_H - 72 - 24 };

/** HUD band height at the top of the screen. */
export const HUD_H = 72;

/** The ship's hard core: anything touching it is a hit. */
export const SHIP_RADIUS = 13;

/** The ship's ember shield: a soft ring that soaks one hit while hot. */
export const SHIELD_RADIUS = 28;

/** Ship base speed in world units per second. */
export const SHIP_SPEED = 340;

/** How fast a held key accelerates the ship. */
export const SHIP_ACCEL = 2600;

/** Friction applied to the ship's velocity. */
export const SHIP_FRICTION = 8.5;

/** Firing rate, seconds between shots. */
export const FIRE_COOLDOWN = 0.14;

/** Bullet speed. */
export const BULLET_SPEED = 780;

/** How long the shield stays hot after it soaks a hit. */
export const SHIELD_COOLDOWN = 4.0;

/** The run lasts this many seconds; survive it to win. */
export const RUN_SECONDS = 90;

/** Seconds of invulnerability after being hit. */
export const INVULN_SECONDS = 1.5;

/** Enemy catalogue: base stats per kind. `shoot` is seconds between volleys. */
export const ENEMY_TYPES = {
  wisp: {
    r: 18, hp: 1, score: 10, color: '#ff9e3d',
    speed: 120, shoot: 0,
  },
  dart: {
    r: 16, hp: 1, score: 15, color: '#ff6a5c',
    speed: 300, shoot: 0,
  },
  husk: {
    r: 26, hp: 3, score: 30, color: '#c9548e',
    speed: 55, shoot: 0,
  },
  spore: {
    r: 17, hp: 2, score: 25, color: '#5ad0e0',
    speed: 90, shoot: 2.2,
  },
  sentry: {
    r: 21, hp: 4, score: 40, color: '#b08cff',
    speed: 60, shoot: 1.6,
  },
  cinder: {
    r: 21, hp: 2, score: 35, color: '#ff4fa0',
    speed: 70, shoot: 0,
  },
  shard: {
    r: 8, hp: 1, score: 5, color: '#ff9dc6',
    speed: 275, shoot: 0,
  },
  colossus: {
    r: 50, hp: 14, score: 250, color: '#ffd23e',
    speed: 34, shoot: 1.1,
  },
};

/** Enemy bullets. */
export const E_BULLET_SPEED = 200;
export const E_BULLET_RADIUS = 6;
export const E_BULLET_LIFE = 4.5;

/** Longest streak a run can keep alive: the combo pointer a choker angel can reach. */
export const MAX_COMBO = 16;

/** Score bonuses. */
export const BONUS_SHIELD_HIT = 5;   // shield soaks a hit
export const BONUS_KILL_STREAK = 50; // every 5 kills in a row
export const BONUS_TIME = 100;       // survive the clock

/**
 * Combo milestone tiers: on top of the every-5 streak bonus, sustained
 * kill chains pay out escalating flares at 8 / 12 / 16.
 */
export const COMBO_TIERS = [
  { at: 16, label: 'SUPERNOVA +500', bonus: 500 },
  { at: 12, label: 'INFERNO +300', bonus: 300 },
  { at: 8, label: 'RAGING +150', bonus: 150 },
];

/** Enemies per wave, hand-tuned: gentle open, tense middle, brutal close. */
export const WAVE_COUNTS = [0, 5, 7, 9, 11, 12, 14, 16, 17];

/**
 * Spawn mix per wave: the relative weight of each enemy kind. Index 0 is the
 * unused "wave 0" slot, so lookups line up with WAVE_COUNTS. Keeping the table
 * here (rather than a formula inside the spawner) means the wave curve is one
 * readable artefact: a designer can retune the run without touching logic.
 *
 * Read order matches SPAWN_ORDER. A zero means the kind does not appear yet.
 */
export const SPAWN_ORDER = ['wisp', 'dart', 'husk', 'spore', 'sentry', 'cinder'];

export const WAVE_SPAWN_WEIGHTS = [
  null, // wave 0 never spawns
  { wisp: 3.4,  dart: 1.05, husk: 0,    spore: 0,    sentry: 0,   cinder: 0 },
  { wisp: 2.8,  dart: 1.95, husk: 1.1,  spore: 0,    sentry: 0,   cinder: 0 },
  { wisp: 2.2,  dart: 2.85, husk: 1.45, spore: 1.5,  sentry: 0,   cinder: 0 },
  { wisp: 1.6,  dart: 3.75, husk: 1.8,  spore: 1.75, sentry: 1.1, cinder: 0.4 },
  { wisp: 1.2,  dart: 4.65, husk: 2.15, spore: 2,    sentry: 1.4, cinder: 0.5 },
  { wisp: 1.2,  dart: 5,    husk: 2.4,  spore: 2.25, sentry: 1.7, cinder: 1 },
  { wisp: 1.2,  dart: 5.35, husk: 2.4,  spore: 2.3,  sentry: 2,   cinder: 1.5 },
  { wisp: 1.2,  dart: 5.7,  husk: 2.4,  spore: 2.3,  sentry: 2.1, cinder: 1.6 },
];

/** The last wave; it also brings the colossus. */
export const FINAL_WAVE = 8;

/** How long the wave-start banner lives, in seconds. */
export const WAVE_BANNER_SECONDS = 2.2;

/** Nice fade-in / fade-out lengths inside that banner window. */
export const WAVE_BANNER_IN = 0.3;
export const WAVE_BANNER_OUT = 0.5;

/** Lives per run. */
export const START_LIVES = 3;
