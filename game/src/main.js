/**
 * Emberwake — entrypoint. Builds the ship and the game, wires the input that
 * starts and restarts a run, and runs the frame loop.
 *
 * A `?shot=` query (start / play / lose / win) hands the frame to stage.js so a
 * capture tool can photograph a specific moment of the loop deterministically.
 */
import { Rng } from './rng.js';
import { Game, STATE } from './game.js';
import { Ship } from './ship.js';
import { prepareShot } from './stage.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') ?? 7);

const canvas = document.getElementById('game');
const ship = new Ship();
ship.setCanvas(canvas);
const game = new Game(canvas, new Rng(0x5eed ^ seed), ship);
// Dev hook: the capture tool reads live state from here.
window.__game = game;

if (shot) prepareShot(game, shot);
if (shot) requestAnimationFrame(() => { window.__shotReady = true; });

// ---------------------------------------------------------------- loop
const frozen = Boolean(shot);
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (!frozen) {
    // Enter or Space starts a run, and restarts one from the results screen
    const pressed = game.drainInput();
    const onMenu = game.state === STATE.TITLE || game.state === STATE.OVER || game.state === STATE.WON;
    const wantsStart = pressed.includes('enter') || pressed.includes(' ');
    if (onMenu && wantsStart && game.inputLock <= 0) game.start();
    game.update(dt);
  }
  game.draw(now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
