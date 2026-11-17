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

/** Lives per run. */
export const START_LIVES = 3;
