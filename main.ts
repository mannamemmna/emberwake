/**
 * Hand-in entrypoint for the best-game-01 bounty — authored for
 * mannamemmna/emberwake, replacing the kit's starter script.
 *
 * What this does, in order:
 *   1. Decide where the hand-in lands. The grader's container expects it at
 *      /output; MAKEFUN_OUTPUT_DIR lets anyone reproduce the exact same
 *      hand-in locally without that path existing or being writable.
 *   2. Gate the entry with my own checks BEFORE the library sees it:
 *      index.html present, each screenshot a real JPEG/PNG under its cap,
 *      the game tree inside the scorer's caps. Fail fast, naming the
 *      offending path, so a rejected hand-in is never a mystery.
 *   3. Stage the two halves of the entry — game/ (a static, offline,
 *      dependency-free browser game: index.html + ES modules + styles) and
 *      screenshots/ (3 JPEG renders, the first by name is the cover) — into
 *      the hand-in directory.
 *   4. Emit dossier.json through the vendored buildDossier with the scorer's
 *      own caps, so a dossier that builds here is one the scorer accepts.
 *   5. Print a summary plus a sha256 manifest of every screenshot, so two
 *      runs of this script can be compared byte for byte.
 *
 * Node standard library only. Run it twice against two output directories;
 * the dossiers come out byte-identical:
 *
 *   mkdir -p out out2
 *   MAKEFUN_OUTPUT_DIR=out  node main.ts
 *   MAKEFUN_OUTPUT_DIR=out2 node main.ts
 *   sha256sum out/dossier.json out2/dossier.json
 */

import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// ---------------------------------------------------------------------------
// Layout: where this script sits, what it hands in, where the hand-in goes.
// ---------------------------------------------------------------------------

const entryRoot = fileURLToPath(new URL('.', import.meta.url));
const gameDir = join(entryRoot, 'game');
const shotsDir = join(entryRoot, 'screenshots');
const landingDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// ---------------------------------------------------------------------------
// The scorer's caps (reference/gate.json). Only text_max_bytes shapes the
// bytes of the dossier; the rest are hard refusals the scorer would make, so
// they are asserted here first.
// ---------------------------------------------------------------------------

const CAPS = {
  shotsMax: 4,            // at most 4 screenshots
  shotMaxBytes: 262144,   // each screenshot <= 256 KiB
  gameMaxFiles: 993,      // game/ tree <= 993 files
  gameMaxBytes: 50331648, // game/ tree <= 48 MiB total
  gameMaxPathBytes: 1000, // no single path under game/ over 1000 bytes
  textMaxBytes: 163840,   // the dossier text budget buildDossier packs into
} as const;

// ---------------------------------------------------------------------------
// Byte-level helpers.
// ---------------------------------------------------------------------------

/** Read the first `n` bytes of a file — enough to see any image magic number. */
function headBytes(path: string, n: number): Buffer {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(n);
    const read = readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

/** Magic-number sniffing, because extensions lie. JPEG and PNG only. */
function hasImageMagic(path: string): boolean {
  const head = headBytes(path, 8);
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng =
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  return isJpeg || isPng;
}

function sha256OfFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// ---------------------------------------------------------------------------
// Tree walking: every regular file under a directory, as [relative, absolute].
// ---------------------------------------------------------------------------

function* walkFiles(dir: string, base = dir): Generator<[string, string]> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(abs, base);
    else if (entry.isFile()) yield [relative(base, abs), abs];
  }
}

// ---------------------------------------------------------------------------
// The gate. Check order runs cheapest-and-most-fatal first: the entry page
// exists, the screenshots pass count/size/magic, then the game tree's three
// caps. Every failure names the exact path that broke the rule.
// ---------------------------------------------------------------------------

function assertEntryIsHandable(): void {
  // 1. A game without its entry document is not a game.
  if (!existsSync(join(gameDir, 'index.html'))) {
    throw new Error('game/index.html is missing: the entry has no entry page');
  }

  // 2. Screenshots: directory, count, then per-file size and magic bytes.
  if (!existsSync(shotsDir)) {
    throw new Error('screenshots/ is missing: an entry needs its renders');
  }
  const shotNames = readdirSync(shotsDir)
    .filter((n) => !n.startsWith('.'))
    .sort();
  if (shotNames.length === 0) {
    throw new Error('screenshots/ is empty: the first image is the cover');
  }
  if (shotNames.length > CAPS.shotsMax) {
    throw new Error(
      `screenshots/ holds ${shotNames.length} images, over the ${CAPS.shotsMax} cap`,
    );
  }
  for (const name of shotNames) {
    const abs = join(shotsDir, name);
    const size = statSync(abs).size;
    if (size > CAPS.shotMaxBytes) {
      throw new Error(
        `screenshots/${name} is ${size} bytes, over the ${CAPS.shotMaxBytes} cap`,
      );
    }
    if (!hasImageMagic(abs)) {
      throw new Error(
        `screenshots/${name} carries neither a JPEG nor a PNG header`,
      );
    }
  }

  // 3. The game tree: file count, total bytes, and the longest single path.
  let fileCount = 0;
  let totalBytes = 0;
  let longestPath = '';
  for (const [rel, abs] of walkFiles(gameDir)) {
    fileCount++;
    totalBytes += statSync(abs).size;
    if (rel.length > longestPath.length) longestPath = rel;
  }
  if (fileCount > CAPS.gameMaxFiles) {
    throw new Error(
      `game/ holds ${fileCount} files, over the ${CAPS.gameMaxFiles} cap`,
    );
  }
  if (totalBytes > CAPS.gameMaxBytes) {
    throw new Error(
      `game/ totals ${totalBytes} bytes, over the ${CAPS.gameMaxBytes} cap`,
    );
  }
  if (longestPath.length > CAPS.gameMaxPathBytes) {
    throw new Error(
      `game/${longestPath} has a ${longestPath.length}-byte path, over the ` +
        `${CAPS.gameMaxPathBytes} cap`,
    );
  }
}

// ---------------------------------------------------------------------------
// A genuine functional check: the entry page must actually load. It is
// dependency-free exactly as long as every module/stylesheet it references
// exists in the staged tree — a missing src= is a broken hand-in that no
// size cap would ever catch.
// ---------------------------------------------------------------------------

function assertEntryPageLoads(): void {
  const html = readFileSync(join(gameDir, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((ref) => !/^(https?:|data:|#)/.test(ref));
  for (const ref of refs) {
    const target = join(gameDir, ref);
    if (!existsSync(target)) {
      throw new Error(
        `game/index.html references "${ref}", but game/${ref} is missing: ` +
          'the entry page would not load',
      );
    }
  }
  if (refs.length === 0) {
    throw new Error('game/index.html references nothing: no module entry?');
  }
}

// ---------------------------------------------------------------------------
// Staging: copy game/ and screenshots/ into the hand-in directory.
// ---------------------------------------------------------------------------

function stageEntry(): void {
  mkdirSync(landingDir, { recursive: true });
  cpSync(gameDir, join(landingDir, 'game'), { recursive: true });
  mkdirSync(join(landingDir, 'screenshots'), { recursive: true });
  cpSync(shotsDir, join(landingDir, 'screenshots'), { recursive: true });
}

// ---------------------------------------------------------------------------
// Summary + manifest: what landed where, and the sha256 of every screenshot.
// ---------------------------------------------------------------------------

function printSummary(): void {
  // per-file sha256 of the game tree: two runs of this script must print
  // identical lines here too, not just identical dossier.json bytes
  const gameManifest: string[] = [];
  let gameFileCount = 0;
  let gameTotal = 0;
  for (const [rel, abs] of walkFiles(gameDir)) {
    gameFileCount++;
    gameTotal += statSync(abs).size;
    gameManifest.push(`  ${rel}  ${statSync(abs).size}B  sha256:${sha256OfFile(abs)}`);
  }

  const shotNames = readdirSync(shotsDir)
    .filter((n) => !n.startsWith('.'))
    .sort();
  const manifest: string[] = [];
  let shotTotal = 0;
  for (const name of shotNames) {
    const abs = join(shotsDir, name);
    const size = statSync(abs).size;
    shotTotal += size;
    manifest.push(`  ${name}  ${size} bytes  sha256:${sha256OfFile(abs)}`);
  }

  const dossierAbs = join(landingDir, 'dossier.json');
  const dossierSize = existsSync(dossierAbs) ? statSync(dossierAbs).size : 0;

  console.log(`hand-in directory: ${landingDir}`);
  console.log(`game:    ${gameFileCount} files, ${gameTotal} bytes`);
  console.log(`shots:   ${shotNames.length} files, ${shotTotal} bytes`);
  console.log(`dossier: ${dossierSize} bytes (${dossierAbs})`);
  console.log('game manifest:');
  for (const line of gameManifest) console.log(line);
  console.log('screenshot manifest:');
  for (const line of manifest) console.log(line);
  console.log(
    `manifest total: ${manifest.length} screenshot` +
      `${manifest.length === 1 ? '' : 's'}, ${shotTotal} bytes combined`,
  );
}

// ---------------------------------------------------------------------------
// Go: gate, stage, dossier, summary. Any failure aborts with one clear error.
// ---------------------------------------------------------------------------

assertEntryIsHandable();
assertEntryPageLoads();
stageEntry();
const dossier = buildDossier(landingDir, {
  text_max_bytes: CAPS.textMaxBytes,
  screenshots: { max: CAPS.shotsMax, max_bytes: CAPS.shotMaxBytes },
  game_max_files: CAPS.gameMaxFiles,
  game_max_bytes: CAPS.gameMaxBytes,
  game_path_max_bytes: CAPS.gameMaxPathBytes,
});
writeFileSync(join(landingDir, 'dossier.json'), dossier);
printSummary();
