/**
 * Screenshot stage — the deterministic frames behind the entry's four renders.
 *
 * Every frame is built out of the game's own objects (real enemies, real
 * bullets, real juice) and then frozen, so a capture can never disagree with
 * what a player would see. A `?shot=` query selects which frame:
 *
 *   start  the animated title, with its quiet live arena behind it
 *   play   a staged mid-run battle with the HUD live
 *   lose   a genuine death, then the defeat screen
 *   win    the killing blow on the colossus, then the victory screen
 *
 * Folded into this pass:
 *   - wave composition is no longer computed here or inside the spawner: the
 *     per-wave weights live in config.js (WAVE_SPAWN_WEIGHTS) and this module
 *     expands them through `waveRoster`, so a staged board and a played board
 *     are drawn from the same table;
 *   - the wave-start banner has an explicit envelope (in / hold / out) and a
 *     single entry point, `openWave`, so its timing is one readable decision
 *     instead of a bare number written in three places.
 */
import { STATE } from './game.js';
import { makeEnemy } from './enemies.js';
import {
  VIEW_W, VIEW_H, ARENA, RUN_SECONDS,
  WAVE_SPAWN_WEIGHTS, SPAWN_ORDER, WAVE_BANNER_SECONDS,
  WAVE_BANNER_IN, WAVE_BANNER_OUT, FINAL_WAVE,
} from './config.js';

/** One simulation tick, in seconds. The stage is always stepped at 60 Hz. */
export const STEP = 1 / 60;

// ---------------------------------------------------------------------------
// Wave banners
// ---------------------------------------------------------------------------

/**
 * Banner opacity for a banner that has been on screen for `age` seconds.
 * Eases in fast so the announcement lands with the wave, holds, then fades
 * out over the last WAVE_BANNER_OUT seconds. Returns 0 outside the window.
 */
export function bannerAlpha(age) {
  if (age < 0 || age > WAVE_BANNER_SECONDS) return 0;
  if (age < WAVE_BANNER_IN) return age / WAVE_BANNER_IN;
  const tail = WAVE_BANNER_SECONDS - age;
  if (tail < WAVE_BANNER_OUT) return tail / WAVE_BANNER_OUT;
  return 1;
}

/** The line the banner shows for a wave. Late waves get their own voice. */
export function bannerLabel(wave) {
  if (wave >= FINAL_WAVE) return 'THE COLOSSUS STIRS';
  if (wave === FINAL_WAVE - 1) return 'THE DEEP IS LISTENING';
  return `WAVE ${wave}`;
}

/**
 * Announce a wave: stamp the timer the HUD reads, and return the banner
 * label so a caller that wants to speak it aloud (audio, log) can.
 */
export function openWave(game, wave) {
  game.wave = wave;
  game.waveBanner = WAVE_BANNER_SECONDS;
  game.waveBannerWave = wave;
  return bannerLabel(wave);
}

// ---------------------------------------------------------------------------
// The wave table
// ---------------------------------------------------------------------------

/**
 * Expand a wave's configured weights into a concrete, deterministic roster of
 * enemy kinds. `count` is how many bodies the wave fields; the weights decide
 * the mix in proportion, with the largest-remainder method so the roster is
 * exactly `count` long and no kind is silently dropped when its share rounds
 * to nothing.
 */
export function waveRoster(wave, count) {
  const weights = WAVE_SPAWN_WEIGHTS[wave] ?? WAVE_SPAWN_WEIGHTS[FINAL_WAVE];
  const total = SPAWN_ORDER.reduce((sum, kind) => sum + (weights[kind] ?? 0), 0);
  if (!(total > 0) || count <= 0) return [];

  const exact = SPAWN_ORDER.map((kind) => ((weights[kind] ?? 0) / total) * count);
  const roster = SPAWN_ORDER.map((kind, i) => ({
    kind,
    n: Math.floor(exact[i]),
    rem: exact[i] - Math.floor(exact[i]),
  }));

  // hand the leftover slots to the kinds with the largest fractional shares
  let seated = roster.reduce((sum, r) => sum + r.n, 0);
  const byRemainder = [...roster].sort((a, b) => b.rem - a.rem);
  for (let i = 0; seated < count; i++, seated++) {
    byRemainder[i % byRemainder.length].n++;
  }

  // flat list, ordered as SPAWN_ORDER so runs stay reproducible
  const list = [];
  for (const r of roster) for (let i = 0; i < r.n; i++) list.push(r.kind);
  return list;
}

// ---------------------------------------------------------------------------
// Autopilot + simulation
// ---------------------------------------------------------------------------

/**
 * A crude but honest pilot: it looks at every live threat, scores it by how
 * much danger it actually represents (closing speed and bulk, not just raw
 * distance), aims at the most dangerous one, and slides sideways away from it.
 * It never cheats — it only touches the same inputs a player would.
 */
export function autopilot(game) {
  const ship = game.ship;
  let threat = null;
  let worst = -Infinity;

  for (const e of game.enemies) {
    if (e.dead) continue;
    const dx = e.x - ship.x;
    const dy = e.y - ship.y;
    const d = Math.hypot(dx, dy) || 1;
    // nearer, faster, chunkier = more dangerous. A boss is always top weight.
    const closing = -(dx * (e.vx ?? 0) + dy * (e.vy ?? 0)) / d;
    const score = (e.type === 'colossus' ? 400 : 60) + (e.r ?? 12) * 2 - d * 0.6 + closing * 0.5;
    if (score > worst) {
      worst = score;
      threat = e;
    }
  }

  ship.keys.clear();
  ship.mouseDown = true;

  if (threat) {
    ship.mouse.x = threat.x;
    ship.mouse.y = threat.y;
    // strafe away laterally, and back off if the threat is crowding us
    ship.keys.add(ship.x < threat.x ? 'a' : 'd');
    if (ship.y > threat.y) ship.keys.add('s');
    if (ship.y > VIEW_H - 130) ship.keys.add('w');
    if (threat.y > ship.y - 90 && Math.abs(threat.x - ship.x) < 80) ship.keys.add('w');
  } else {
    ship.mouse.x = VIEW_W / 2;
    ship.mouse.y = VIEW_H * 0.3;
    ship.keys.add(ship.x < VIEW_W / 2 ? 'd' : 'a');
  }
}

/**
 * Step the simulation `frames` fixed ticks with the autopilot at the controls.
 * Stops early if the run leaves the playing state, so a lost run never ticks
 * on into the results screen.
 */
export function simulate(game, frames) {
  for (let i = 0; i < frames; i++) {
    autopilot(game);
    game.update(STEP);
    if (game.state !== STATE.PLAYING) break;
  }
}

// ---------------------------------------------------------------------------
// Staged battlefields
// ---------------------------------------------------------------------------

/**
 * A hand-composed battle: the whole bestiary on screen at once, laid out in a
 * readable arc, with fire in the air and embers on the hull. Positions are
 * fixed so the frame is identical on every capture; only the RNG-derived
 * details move.
 */
function stageBattlefield(game, { withBoss = true } = {}) {
  const R = game.rng;
  const ship = game.ship;
  game.enemies.length = 0;
  game.ebullets.length = 0;
  game.boss = null;

  const place = (type, x, y, tweak) => {
    const e = makeEnemy(type, x, y, R, game.wave, ship);
    if (tweak) tweak(e);
    game.enemies.push(e);
    return e;
  };

  if (withBoss) {
    const boss = place('colossus', VIEW_W / 2, ARENA.y + 150);
    boss.hp = Math.round(boss.maxHp * 0.54);
    // park it high and centred for the frame: clear of the boss strip, with
    // the whole silhouette inside the arena
    boss.orbitCx = VIEW_W / 2;
    boss.orbitCy = ARENA.y + 168;
    boss.orbitR = 130;
    boss.orbitA = -Math.PI / 2;
    boss.orbitSp = 0.12;
    game.boss = boss;
  }

  // the two big rocks
  place('husk', ARENA.x + 86, ARENA.y + 224);
  place('husk', ARENA.x + ARENA.w - 96, ARENA.y + 316);

  // hovering spores, mid field
  place('spore', ARENA.x + 250, ARENA.y + 300, (e) => { e.homeY = e.y; });
  place('spore', ARENA.x + ARENA.w - 256, ARENA.y + 216, (e) => { e.homeY = e.y; });

  // two sentries on small fixed orbits
  const s1 = place('sentry', ARENA.x + 152, ARENA.y + 344);
  s1.orbitCx = s1.x; s1.orbitCy = s1.y; s1.orbitR = 42;
  const s2 = place('sentry', ARENA.x + ARENA.w - 156, ARENA.y + 142);
  s2.orbitCx = s2.x; s2.orbitCy = s2.y; s2.orbitR = 38;

  // darts already committed to their dive
  place('dart', ARENA.x + 330, ARENA.y + 362, (e) => { e.vx = 110; e.vy = 270; });
  place('dart', ARENA.x + 636, ARENA.y + 330, (e) => { e.vx = -100; e.vy = 255; });

  // a loose arc of ember motes, lowest and closest
  const wisps = [[176, 372], [262, 306], [344, 404], [424, 348], [512, 400], [590, 336], [662, 386], [736, 306]];
  for (const [x, y] of wisps) place('wisp', x, y, (e) => { e.vy = 48; });

  // top up with kinds this wave's roster fields but the hero composition
  // above does not: the frame then documents the wave's real mix (a wave-6
  // board has cinders in it, a wave-1 board does not)
  const roster = new Set(waveRoster(game.wave, 12));
  const shown = new Set(game.enemies.map((e) => e.type));
  const spare = [[ARENA.x + 430, ARENA.y + 236], [ARENA.x + ARENA.w - 132, ARENA.y + 388]];
  let slot = 0;
  for (const kind of SPAWN_ORDER) {
    if (!roster.has(kind) || shown.has(kind) || slot >= spare.length) continue;
    const [x, y] = spare[slot++];
    place(kind, x, y, (e) => {
      // the cinder is a splitter: give it a live burst heading so the frame
      // shows the mechanic mid-threat rather than a parked prop
      if (kind === 'cinder') {
        e.burstA = -Math.PI / 2 + 0.35;
        e.phase = 0.8;
      }
      if (kind === 'spore') e.homeY = y;
    });
  }

  // enemy fire: a fan rising from the lower field, plus the boss's ring
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + R.range(-0.55, 0.55);
    const sp = 130 + R.range(0, 60);
    game.ebullets.push({
      x: ARENA.x + 120 + i * 68,
      y: ARENA.y + 316 + (i % 4) * 44,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      age: 0.3 + (i % 5) * 0.2, r: 6, color: '#ff5470',
    });
  }
  if (withBoss) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.22;
      game.ebullets.push({
        x: VIEW_W / 2 + Math.cos(a) * 58,
        y: ARENA.y + 128 + Math.sin(a) * 58,
        vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
        age: 0.5, r: 6, color: '#ffd23e',
      });
    }
  }

  // the ship low and centred, lancing upward, shield still charging
  ship.x = VIEW_W / 2 - 34;
  ship.y = VIEW_H - 100;
  ship.angle = -Math.PI / 2 + 0.05;
  ship.mouse.x = VIEW_W / 2 + 6;
  ship.mouse.y = ARENA.y + 160;
  ship.mouseDown = true;
  ship.invuln = 0.3;
  ship.shieldCd = 1.5;
  ship.shieldHot = true;
  ship.muzzle = 0.06;
  for (let i = 0; i < 7; i++) {
    game.bullets.push({
      x: ship.x + R.range(-8, 8), y: ship.y - 44 - i * 48,
      vx: 0, vy: -780,
    });
  }

  // a kill in progress and a shield soak, for the juice
  game.juice.burst(ARENA.x + 296, ARENA.y + 244, 18, '#ff9e3d', 190, 0.6, 2.6);
  game.juice.sparks(ARENA.x + 380, ARENA.y + 196, -Math.PI / 2, 10, 230, 0.9, '#ffd9a0', 0.4);
  game.juice.ring(ARENA.x + 640, ARENA.y + 256, '#c9548e', 52, 0.5);
  game.juice.floatText(ARENA.x + 640, ARENA.y + 228, '+30', '#ff9e3d');
  game.juice.floatText(ARENA.x + 300, ARENA.y + 266, '+250', '#ffd23e', 17);
  game.juice.floatText(ship.x + 6, ship.y - 58, 'SHIELD!', '#78dcff', 12);
  game.juice.kick(3, 0.3);
}

// ---------------------------------------------------------------------------
// Shot construction
// ---------------------------------------------------------------------------

/**
 * Build the requested frame; the caller then draws it forever. Each branch
 * leaves the game in the state its screenshot is supposed to document, with
 * the banner mid-life so the label is actually readable in the capture.
 */
export function prepareShot(game, shot) {
  const ship = game.ship;

  if (shot === 'start') {
    // let the title's ambience drift for ~2 seconds: embers in the air,
    // ship idling, panels breathing
    for (let i = 0; i < 110; i++) game.update(STEP);
    return;
  }

  if (shot === 'play') {
    game.start();
    ship.invuln = 999;
    simulate(game, 60 * 22);
    game.wave = FINAL_WAVE;
    game.lives = 2;
    game.score = 5240;
    game.kills = 44;
    game.combo = 6;
    game.elapsed = 62;
    game.scorePop = 0.5;
    stageBattlefield(game, { withBoss: true });
    // the boss owns the top band, so leave the banner off: the boss bar and a
    // wave label must never fight for the same strip
    game.waveBanner = 0;
    return;
  }

  if (shot === 'lose') {
    game.start();
    ship.invuln = 999;
    simulate(game, 60 * 30);
    game.wave = 6;
    game.score = 2310;
    game.kills = 38;
    game.lives = 1;
    game.combo = 0;
    game.elapsed = 52;
    stageBattlefield(game, { withBoss: false });
    // then a real death: no shield banked, so the hit costs the last life
    ship.invuln = 0;
    ship.shieldCd = 999;
    ship.shieldHot = false;
    game.lives = 1;
    game._hitShip();
    ship.invuln = 0;
    for (let i = 0; i < 6; i++) game.update(STEP);
    return;
  }

  if (shot === 'win') {
    game.start();
    ship.invuln = 999;
    simulate(game, 60 * 24);
    stageBattlefield(game, { withBoss: true });
    game.boss.hp = 1;
    game._killEnemy(game.boss);
    game.wave = FINAL_WAVE;
    game.lives = 2;
    game.score = 4120;
    game.kills = 58;
    game.elapsed = RUN_SECONDS;
    game._win();
    // the results screen owns the frame from here; let the win flash decay so
    // the veil is clean, not blown out
    for (let i = 0; i < 26; i++) game.update(STEP);
    return;
  }
}
