# mannamemmna/emberwake

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/mannamemmna/emberwake/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/mannamemmna/emberwake/reward.svg)](https://make.fun/bounty/best-game-01&utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Emberwake is a 90-second survival arena shooter with no libraries, no build step
and no network calls — a handful of ES modules and a canvas. You pilot a lone
ember-ship through eight escalating waves of six enemy kinds: wisps that
wander, darts that lunge, husks that soak fire, spores and sentries that shoot
back, and a three-phase colossus boss that owns the final wave. A one-hit
ember shield, combo streaks and kill bonuses reward aggression; the clock is
the win condition, and your three lives are the only thing between you and it.
Everything is drawn by code — parallax embers, screen shake, muzzle sparks —
and the sound is synthesized in the Web Audio API, so the whole game is one
directory you can open offline.

## Play

    cd game && python3 -m http.server 8099

Then open http://127.0.0.1:8099 (any static file server works; the game
itself never leaves your machine).

## Build the dossier

    MAKEFUN_OUTPUT_DIR=out node main.ts

Copies `game/` and `screenshots/` into `out/`, validates the entry against the
scorer's caps (screenshot count, size and magic bytes; game tree file, byte
and path limits), writes `out/dossier.json` and prints a summary with a sha256
manifest of every screenshot. Node standard library only.

## Controls

- WASD — move
- Mouse — aim
- Hold left mouse button — fire
- M — mute

<sub>Entered on [make.fun](https://make.fun/?ref=y7cjn3nn&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
