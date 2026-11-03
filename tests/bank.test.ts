import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECTANGLE } from "../src/core/board.ts";
import { LEVELS, type Bank } from "../src/core/levels.ts";
import { PIECES } from "../src/core/pieces.ts";
import {
  canonicalPuzzle,
  countSolutions,
  decodePuzzle,
  encodePuzzle,
  hasGiveawayGap,
  remainingPieces,
} from "../src/core/puzzle.ts";
import { createModel } from "../src/core/solver.ts";

const model = createModel(RECTANGLE, PIECES);
const WIZARD_TOTAL = 4382;

function load(id: string): Bank {
  return JSON.parse(readFileSync(new URL(`../public/bank/${id}.json`, import.meta.url), "utf8")) as Bank;
}

// Proving uniqueness across the whole bank takes a few minutes.
describe.each(LEVELS)("$name bank", (level) => {
  const bank = load(level.id);
  const all = [...bank.free, ...bank.daily];

  it("has the agreed number of puzzles", () => {
    expect(bank.daily).toHaveLength(level.dailyTarget);
    if (level.freeTarget === null) expect(all).toHaveLength(WIZARD_TOTAL);
    else expect(bank.free).toHaveLength(level.freeTarget);
  });

  it("uses only the level's piece counts, split evenly", () => {
    const counts = new Map(level.piecesLeft.map((left) => [left, 0]));
    for (const encoded of all) {
      const left = remainingPieces(decodePuzzle(encoded)).length;
      expect(counts.has(left)).toBe(true);
      counts.set(left, counts.get(left)! + 1);
    }
    const values = [...counts.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it("has no rotated or mirrored duplicates", () => {
    const keys = new Set(all.map((encoded) => encodePuzzle(canonicalPuzzle(RECTANGLE, decodePuzzle(encoded)))));
    expect(keys.size).toBe(all.length);
  });

  it("has no piece given away by a gap of its own shape", () => {
    expect(all.filter((encoded) => hasGiveawayGap(RECTANGLE, decodePuzzle(encoded)))).toEqual([]);
  });

  it("has exactly one solution for every puzzle", { timeout: 1_800_000 }, () => {
    const bad = all.filter((encoded) => countSolutions(model, decodePuzzle(encoded)) !== 1);
    expect(bad).toEqual([]);
  });
});
