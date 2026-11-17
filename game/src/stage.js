/**
 * Screenshot stage: composes the exact frame each screenshot shows, using the
 * game's own entities (so the HUD agrees with the screen). A `?shot=` query
 * picks one; with no `shot` the game just plays normally.
 *
 *   start  the animated title with its background arena
 *   play   a staged mid-run battle, HUD live
 *   lose   a real defeat, then the results screen
 *   win    the killing blow and the clock running out: the victory screen
 */
import { STATE } from './game.js';
import { makeEnemy } from './enemies.js';
import { VIEW_W, VIEW_H, ARENA, RUN_SECONDS } from './config.js';

export const STEP = 1 / 60;

/** A crude but honest pilot: aim at the nearest threat, drift away from it. */
export function autopilot(game) {
  const ship = game.ship;
  let nearest = null;
  let bestD = Infinity;
  for (const e of game.enemies) {
    const d = (e.x - ship.x) ** 2 + (e.y - ship.y) ** 2;
    if (d < bestD) {
      bestD = d;
      nearest = e;
    }
  }
  ship.keys.clear();
  ship.mouseDown = true;
  if (nearest) {
    ship.mouse.x = nearest.x;
    ship.mouse.y = nearest.y;
    ship.keys.add(ship.x < nearest.x ? 'a' : 'd');
    if (ship.y > VIEW_H - 120) ship.keys.add('w');
  } else {
    ship.mouse.x = VIEW_W / 2;
    ship.mouse.y = VIEW_H * 0.3;
    ship.keys.add(ship.x < VIEW_W / 2 ? 'd' : 'a');
  }
}

/** Step the simulation n fixed frames with the autopilot flying. */
export function simulate(game, frames) {
  for (let i = 0; i < frames; i++) {
    autopilot(game);
    game.update(STEP);
    if (game.state !== STATE.PLAYING) break;
  }
}

/**
 * A hand-composed battle: the whole bestiary on screen at once, laid out in a
 * readable arc, with fire in the air and embers on the hull.
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
    // park it high and centred for the frame: clear of the boss strip,
    // with the whole silhouette inside the arena
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

  // the ship low and centered, lancing upward, shield still charging
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
  game.waveBanner = 1.5;
}

/** Build the requested frame; the caller then just draws forever. */
export function prepareShot(game, shot) {
  const ship = game.ship;
  if (shot === 'start') {
    for (let i = 0; i < 110; i++) game.update(STEP);
    return;
  }
  if (shot === 'play') {
    game.start();
    ship.invuln = 999;
    simulate(game, 60 * 22);
    game.wave = 8;
    game.lives = 2;
    game.score = 5240;
    game.kills = 44;
    game.combo = 6;
    game.elapsed = 62;
    game.scorePop = 0.5;
    stageBattlefield(game, { withBoss: true });
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
    game.wave = 8;
    game.lives = 2;
    game.score = 4120;
    game.kills = 58;
    game.elapsed = RUN_SECONDS;
    game._win();
    for (let i = 0; i < 26; i++) game.update(STEP);
  }
}
