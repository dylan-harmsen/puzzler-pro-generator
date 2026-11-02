// Fills public/bank with puzzles. Existing puzzles are kept in place and new ones only added
// to the end, so links and past dailies never change. Run with: npm run generate
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { RECTANGLE } from "../src/core/board.ts";
import { LEVELS, type Bank, type Level } from "../src/core/levels.ts";
import { PIECES } from "../src/core/pieces.ts";
import {
  applySymmetry,
  canonicalPuzzle,
  decodePuzzle,
  encodePuzzle,
  placementOf,
  type Puzzle,
} from "../src/core/puzzle.ts";
import { createModel, search } from "../src/core/solver.ts";

const BANK_DIR = new URL("../public/bank/", import.meta.url);
const CACHE_FILE = new URL("../.cache/solutions.bin", import.meta.url);
const EFFORT_TRIM = 0.1;
const TUPLE = PIECES.length;

const model = createModel(RECTANGLE, PIECES);

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

function hashString(text: string): number {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** The first two placements of every search branch, used to share work across threads. */
function searchPrefixes(): [number, number][] {
  const prefixes: [number, number][] = [];
  for (const first of model.byAnchor[0].flat()) {
    const a = model.placements[first];
    const filled = new Set(a.cells);
    let cell = 0;
    while (filled.has(cell)) cell++;
    for (const second of model.byAnchor[cell].flat()) {
      const b = model.placements[second];
      if (b.piece === a.piece || b.cells.some((c) => filled.has(c))) continue;
      prefixes.push([first, second]);
    }
  }
  return prefixes;
}

function enumerateSolutions(): Promise<Int16Array> {
  const prefixes = searchPrefixes();
  const results = new Array<Int16Array>(prefixes.length);
  const workerCount = Math.max(1, cpus().length - 1);
  let next = 0;
  let finished = 0;

  return new Promise((resolve, reject) => {
    for (let w = 0; w < workerCount; w++) {
      const worker = new Worker(new URL(import.meta.url));
      const assign = () => {
        if (next < prefixes.length) {
          worker.postMessage({ index: next, prefix: prefixes[next] });
          next++;
        } else {
          void worker.terminate();
        }
      };
      worker.on("error", reject);
      worker.on("message", ({ index, data }: { index: number; data: Int16Array }) => {
        results[index] = data;
        finished++;
        if (finished % 200 === 0) console.log(`  searched ${finished}/${prefixes.length}`);
        if (finished === prefixes.length) {
          const total = results.reduce((sum, part) => sum + part.length, 0);
          const all = new Int16Array(total);
          let offset = 0;
          for (const part of results) {
            all.set(part, offset);
            offset += part.length;
          }
          resolve(all);
        }
        assign();
      });
      assign();
    }
  });
}

async function loadSolutions(): Promise<Int16Array> {
  if (existsSync(CACHE_FILE)) {
    const buffer = readFileSync(CACHE_FILE);
    console.log("Using cached solutions");
    return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
  }
  console.log("Enumerating every solution (about 5 minutes)");
  const solutions = await enumerateSolutions();
  mkdirSync(new URL("./", CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, Buffer.from(solutions.buffer));
  return solutions;
}

function puzzleFrom(tuple: ArrayLike<number>, given: number[]): Puzzle {
  const solution = new Array<string>(RECTANGLE.cells.length);
  for (let i = 0; i < TUPLE; i++) {
    const placement = model.placements[tuple[i]];
    for (const cell of placement.cells) solution[cell] = PIECES[placement.piece].id;
  }
  return { solution: solution.join(""), given: given.map((id) => PIECES[model.placements[id].piece].id) };
}

function loadBank(level: Level): Bank {
  const file = new URL(`${level.id}.json`, BANK_DIR);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Bank) : { free: [], daily: [] };
}

function saveBank(level: Level, bank: Bank): void {
  mkdirSync(BANK_DIR, { recursive: true });
  const list = (items: string[]) => items.map((item) => JSON.stringify(item)).join(",\n");
  writeFileSync(new URL(`${level.id}.json`, BANK_DIR), `{"free":[\n${list(bank.free)}\n],"daily":[\n${list(bank.daily)}\n]}\n`);
}

function seenKeys(bank: Bank): Set<string> {
  const seen = new Set<string>();
  for (const encoded of [...bank.free, ...bank.daily]) {
    seen.add(encodePuzzle(canonicalPuzzle(RECTANGLE, decodePuzzle(encoded))));
  }
  return seen;
}

/** Samples unique puzzles for one piece count, trimming the easiest and hardest. */
function samplePuzzles(
  solutions: Int16Array,
  piecesLeft: number,
  needed: number,
  seen: Set<string>,
  random: () => number,
): Puzzle[] {
  const solutionCount = solutions.length / TUPLE;
  const target = Math.ceil(needed / (1 - 2 * EFFORT_TRIM));
  const found: { puzzle: Puzzle; effort: number }[] = [];
  let trials = 0;
  while (found.length < target) {
    trials++;
    const start = Math.floor(random() * solutionCount) * TUPLE;
    const tuple = solutions.subarray(start, start + TUPLE);
    const given = shuffle([...tuple], random).slice(0, TUPLE - piecesLeft);
    const puzzle = canonicalPuzzle(RECTANGLE, puzzleFrom(tuple, given));
    const key = encodePuzzle(puzzle);
    if (seen.has(key)) continue;
    seen.add(key);
    const ids = puzzle.given.map((piece) => placementOf(model, puzzle.solution, piece));
    const { count, nodes } = search(model, ids, 2);
    if (count === 1) found.push({ puzzle, effort: nodes });
  }
  console.log(`  ${piecesLeft} left: ${found.length} unique from ${trials} tries`);
  found.sort((a, b) => a.effort - b.effort);
  const skip = Math.floor((found.length - needed) / 2);
  return found.slice(skip, skip + needed).map((entry) => entry.puzzle);
}

/** Every puzzle with two pieces given: pairs of placements found in exactly one solution. */
function allWizardPuzzles(solutions: Int16Array, seen: Set<string>): Puzzle[] {
  const size = model.placements.length;
  const pairCounts = new Uint32Array(size * size);
  const solutionCount = solutions.length / TUPLE;
  for (let s = 0; s < solutionCount; s++) {
    const base = s * TUPLE;
    for (let i = 0; i < TUPLE; i++) {
      const row = solutions[base + i] * size;
      for (let j = i + 1; j < TUPLE; j++) pairCounts[row + solutions[base + j]]++;
    }
  }
  const puzzles: Puzzle[] = [];
  for (let s = 0; s < solutionCount; s++) {
    const base = s * TUPLE;
    const tuple = solutions.subarray(base, base + TUPLE);
    for (let i = 0; i < TUPLE; i++) {
      for (let j = i + 1; j < TUPLE; j++) {
        if (pairCounts[tuple[i] * size + tuple[j]] !== 1) continue;
        const puzzle = canonicalPuzzle(RECTANGLE, puzzleFrom(tuple, [tuple[i], tuple[j]]));
        const key = encodePuzzle(puzzle);
        if (!seen.has(key)) {
          seen.add(key);
          puzzles.push(puzzle);
        }
      }
    }
  }
  return puzzles;
}

function evenSplit(total: number, parts: number): number[] {
  return Array.from({ length: parts }, (_, i) => Math.floor(total / parts) + (i < total % parts ? 1 : 0));
}

async function main(): Promise<void> {
  const solutions = await loadSolutions();
  console.log(`${solutions.length / TUPLE} solutions`);

  for (const level of LEVELS) {
    const bank = loadBank(level);
    const seen = seenKeys(bank);
    const random = mulberry32(hashString(`${level.id}:${bank.free.length}:${bank.daily.length}`));
    const dailyNeeded = Math.max(0, level.dailyTarget - bank.daily.length);
    console.log(`${level.name}: has ${bank.free.length} free, ${bank.daily.length} daily`);

    let fresh: Puzzle[];
    if (level.freeTarget === null) {
      fresh = allWizardPuzzles(solutions, seen);
    } else {
      const needed = dailyNeeded + Math.max(0, level.freeTarget - bank.free.length);
      const split = evenSplit(needed, level.piecesLeft.length);
      fresh = level.piecesLeft.flatMap((left, i) =>
        split[i] > 0 ? samplePuzzles(solutions, left, split[i], seen, random) : [],
      );
    }

    // Canonical forms are only for spotting duplicates, so show each puzzle in a random one.
    const encoded = shuffle(fresh, random).map((puzzle) => {
      const symmetry = Math.floor(random() * RECTANGLE.symmetries.length);
      return encodePuzzle(applySymmetry(RECTANGLE, puzzle, symmetry));
    });
    bank.daily.push(...encoded.slice(0, dailyNeeded));
    bank.free.push(...encoded.slice(dailyNeeded));
    saveBank(level, bank);
    console.log(`  now ${bank.free.length} free, ${bank.daily.length} daily`);
  }
}

if (isMainThread) {
  await main();
} else {
  parentPort!.on("message", ({ index, prefix }: { index: number; prefix: number[] }) => {
    const found: number[] = [];
    search(model, prefix, Infinity, (ids) => found.push(...[...ids].sort((a, b) => a - b)));
    const data = Int16Array.from(found);
    parentPort!.postMessage({ index, data }, [data.buffer]);
  });
}
