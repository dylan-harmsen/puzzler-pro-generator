import { describe, expect, it } from "vitest";
import { RECTANGLE, rectangleBoard } from "../src/core/board.ts";
import { dailyLevel, dailyPuzzle } from "../src/core/daily.ts";
import { bestHint, possiblePositions } from "../src/core/hints.ts";
import { formatPuzzleId, LEVELS, parsePuzzleId } from "../src/core/levels.ts";
import { orientations, PIECES, REFERENCE_LAYOUT, type Coord, type Piece } from "../src/core/pieces.ts";
import { bestTime, pickFreeIndex, solvedCount, type Solve } from "../src/core/progress.ts";
import {
  applySymmetry,
  canonicalPuzzle,
  countSolutions,
  decodePuzzle,
  encodePuzzle,
  placementOf,
  remainingPieces,
  type Puzzle,
} from "../src/core/puzzle.ts";
import { createModel, hasDeadRegion, search } from "../src/core/solver.ts";
import { elapsed, formatTime, NEW_TIMER, pauseTimer, startTimer, wasTimed } from "../src/core/timer.ts";

const model = createModel(RECTANGLE, PIECES);
const REFERENCE = REFERENCE_LAYOUT.join("");

function placementWithCells(letter: string, coords: Coord[]): number {
  const cells = coords.map(([r, c]) => r * RECTANGLE.cols + c).sort((a, b) => a - b);
  const piece = PIECES.findIndex((p) => p.id === letter);
  const id = model.placements.findIndex(
    (p) => p.piece === piece && p.cells.length === cells.length && p.cells.every((cell, i) => cell === cells[i]),
  );
  expect(id).toBeGreaterThanOrEqual(0);
  return id;
}

function luminance(hex: string): number {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

describe("pieces", () => {
  it("are the 12 pieces of the set, covering all 55 cells", () => {
    expect(PIECES).toHaveLength(12);
    const sizes = PIECES.map((p) => p.shape.length).sort();
    expect(sizes).toEqual([3, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5]);
    expect(sizes.reduce((a, b) => a + b)).toBe(55);
  });

  it("have every rotation and flip, without repeats", () => {
    const counts = Object.fromEntries(PIECES.map((p) => [p.id, orientations(p.shape).length]));
    expect(counts).toEqual({ P: 8, B: 4, C: 4, Y: 8, M: 8, O: 8, R: 8, U: 4, N: 8, L: 4, D: 4, T: 4 });
  });

  it("have letters readable on their colours", () => {
    for (const { color, ink } of PIECES) {
      const [dark, light] = [luminance(color), luminance(ink)].sort((a, b) => a - b);
      expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("solver", () => {
  it("generates all placements on the rectangle", () => {
    expect(model.placements).toHaveLength(2140);
  });

  it("accepts the photographed layout as a solution", () => {
    const given = PIECES.map((p) => placementOf(model, REFERENCE, p.id));
    expect(search(model, given).count).toBe(1);
  });

  it("finds the piece when only one is missing", () => {
    const given = PIECES.slice(1).map((p) => placementOf(model, REFERENCE, p.id));
    const solutions: number[][] = [];
    const result = search(model, given, Infinity, (ids) => solutions.push([...ids]));
    expect(result.count).toBe(1);
    expect(solutions[0]).toContain(placementOf(model, REFERENCE, PIECES[0].id));
  });

  it("honours the limit", () => {
    expect(search(model, [], 3).count).toBe(3);
  });

  it("rejects overlapping and repeated givens", () => {
    const pink = placementOf(model, REFERENCE, "P");
    expect(search(model, [pink, pink]).count).toBe(0);
  });

  it("agrees with the exact count on a known two-piece puzzle", () => {
    const pink = placementWithCells("P", [[0, 0], [0, 1], [0, 2], [1, 2], [1, 3]]);
    const yellow = placementWithCells("Y", [[1, 8], [2, 8], [2, 9], [3, 8], [4, 8]]);
    expect(search(model, [pink, yellow]).count).toBe(1);
  });

  it("spots regions no piece combination could fill", () => {
    expect(hasDeadRegion(model, 0, 0)).toBe(false);
    // Cell 0 cut off by cells 1 and 11, leaving a region of size 1.
    expect(hasDeadRegion(model, (1 << 1) | (1 << 11), 0)).toBe(true);
  });

  it("works on other boards from data alone", () => {
    const domino: Piece = { id: "P", name: "A", color: "#000000", ink: "#ffffff", shape: [[0, 0], [0, 1]] };
    const square: Piece = { id: "B", name: "B", color: "#000000", ink: "#ffffff", shape: [[0, 0], [0, 1], [1, 0], [1, 1]] };
    const small = createModel(rectangleBoard("small", 2, 3), [domino, square]);
    expect(search(small, []).count).toBe(2);
  });
});

describe("puzzles", () => {
  const puzzle: Puzzle = { solution: REFERENCE, given: ["P", "Y"] };

  it("round-trip through the bank format", () => {
    expect(decodePuzzle(encodePuzzle(puzzle))).toEqual(puzzle);
  });

  it("list the pieces left to place", () => {
    expect(remainingPieces(puzzle)).toHaveLength(10);
    expect(remainingPieces(puzzle)).not.toContain("P");
  });

  it("share a canonical form with their rotated and mirrored copies", () => {
    const canonical = canonicalPuzzle(RECTANGLE, puzzle);
    for (let symmetry = 0; symmetry < 4; symmetry++) {
      expect(canonicalPuzzle(RECTANGLE, applySymmetry(RECTANGLE, puzzle, symmetry))).toEqual(canonical);
    }
  });

  it("stay valid solutions under every symmetry", () => {
    for (let symmetry = 0; symmetry < 4; symmetry++) {
      const moved = applySymmetry(RECTANGLE, puzzle, symmetry);
      expect(countSolutions(model, { solution: moved.solution, given: PIECES.map((p) => p.id) })).toBe(1);
    }
  });
});

describe("hints", () => {
  const puzzle: Puzzle = { solution: REFERENCE, given: PIECES.slice(0, 8).map((p) => p.id) };

  it("pick the piece with the fewest possible positions", () => {
    const left = remainingPieces(puzzle);
    const best = bestHint(model, puzzle, [])!;
    const fewest = Math.min(...left.map((piece) => possiblePositions(model, puzzle, [], piece)));
    expect(possiblePositions(model, puzzle, [], best)).toBe(fewest);
  });

  it("skip revealed pieces and finish when none remain", () => {
    const left = remainingPieces(puzzle);
    const first = bestHint(model, puzzle, [])!;
    expect(bestHint(model, puzzle, [first])).not.toBe(first);
    expect(bestHint(model, puzzle, left)).toBeNull();
  });

  it("always leave the true position possible", () => {
    for (const piece of remainingPieces(puzzle)) {
      expect(possiblePositions(model, puzzle, [], piece)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("daily puzzle", () => {
  const sizes = () => 100;
  const on = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

  it("follows the weekly schedule", () => {
    const week = [2, 3, 4, 5, 6, 7, 8].map((d) => dailyLevel(on(2026, 11, d)));
    expect(week).toEqual(["starter", "junior", "expert", "master", "wizard", "expert", "master"]);
  });

  it("stays the same all day and changes at midnight", () => {
    expect(dailyPuzzle(on(2026, 11, 4, 0), sizes)).toEqual(dailyPuzzle(on(2026, 11, 4, 23), sizes));
    expect(dailyPuzzle(on(2026, 11, 4, 23), sizes)).not.toEqual(dailyPuzzle(on(2026, 11, 5, 0), sizes));
  });

  it("moves to the next puzzle of a level each time it comes up", () => {
    const expertDays = [[11, 4], [11, 7], [11, 11], [11, 14]];
    expect(expertDays.map(([m, d]) => dailyPuzzle(on(2026, m, d), sizes).index)).toEqual([0, 1, 2, 3]);
  });

  it("never repeats within 10 years, given the reserved pool sizes", () => {
    const seen = new Set<string>();
    const pool = (level: string) => (level === "expert" || level === "master" ? 1040 : 520);
    for (let day = 0; day < 3640; day++) {
      const ref = dailyPuzzle(new Date(2026, 10, 2 + day, 12), pool);
      seen.add(formatPuzzleId(ref));
    }
    expect(seen.size).toBe(3640);
  });

  it("stays in range before the start date and after the pool wraps", () => {
    expect(dailyPuzzle(on(2020, 1, 1), sizes).index).toBeGreaterThanOrEqual(0);
    expect(dailyPuzzle(on(2099, 1, 1), sizes).index).toBeLessThan(100);
  });
});

describe("puzzle ids", () => {
  it("round-trip for free and daily puzzles", () => {
    expect(formatPuzzleId({ level: "wizard", pool: "free", index: 123 })).toBe("wizard-0123");
    expect(formatPuzzleId({ level: "wizard", pool: "daily", index: 12 })).toBe("wizard-d0012");
    expect(parsePuzzleId("wizard-0123")).toEqual({ level: "wizard", pool: "free", index: 123 });
    expect(parsePuzzleId("wizard-d0012")).toEqual({ level: "wizard", pool: "daily", index: 12 });
  });

  it("reject anything else", () => {
    for (const id of ["", "wizard", "wizard-12", "nope-0001", "wizard-x0001"]) {
      expect(parsePuzzleId(id)).toBeNull();
    }
  });
});

describe("timer", () => {
  it("keeps counting from timestamps until paused", () => {
    const running = startTimer(NEW_TIMER, 1000);
    expect(elapsed(running, 61_000)).toBe(60_000);
    const paused = pauseTimer(running, 61_000);
    expect(elapsed(paused, 999_999)).toBe(60_000);
    expect(elapsed(startTimer(paused, 100_000), 105_000)).toBe(65_000);
  });

  it("knows whether a solve was timed", () => {
    expect(wasTimed(NEW_TIMER)).toBe(false);
    expect(wasTimed(startTimer(NEW_TIMER, 1))).toBe(true);
    expect(wasTimed(pauseTimer(startTimer(NEW_TIMER, 1), 5))).toBe(true);
  });

  it("formats times", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65_000)).toBe("1:05");
    expect(formatTime(3_725_000)).toBe("1:02:05");
  });
});

describe("progress", () => {
  const solve = (puzzleId: string, hints: number, timeMs: number | null): Solve => ({
    puzzleId,
    date: "2026-11-02T12:00:00.000Z",
    hints,
    timeMs,
  });

  it("counts only no-hint, timed solves towards best time", () => {
    const solves = [
      solve("wizard-0001", 3, 1000),
      solve("wizard-0002", 0, null),
      solve("wizard-0003", 0, 5000),
      solve("wizard-d0004", 0, 4000),
      solve("master-0001", 0, 100),
    ];
    expect(bestTime(solves, "wizard")).toBe(4000);
    expect(bestTime(solves, "junior")).toBeNull();
  });

  it("counts each solved free-play puzzle once", () => {
    const solves = [solve("wizard-0001", 0, null), solve("wizard-0001", 1, null), solve("wizard-d0001", 0, null)];
    expect(solvedCount(solves, "wizard")).toBe(1);
  });

  it("skips solved puzzles when picking", () => {
    const solved = new Set(["starter-0000", "starter-0002"]);
    for (const roll of [0, 0.5, 0.99]) {
      expect(pickFreeIndex("starter", 3, solved, null, () => roll)).toBe(1);
    }
  });

  it("starts the level again once everything is solved", () => {
    const solved = new Set(["starter-0000", "starter-0001"]);
    expect([0, 1]).toContain(pickFreeIndex("starter", 2, solved, null, () => 0.5));
  });

  it("avoids repeating the current puzzle when it can", () => {
    expect(pickFreeIndex("starter", 2, new Set(), 0, () => 0)).toBe(1);
    expect(pickFreeIndex("starter", 1, new Set(), 0, () => 0)).toBe(0);
  });
});

describe("levels", () => {
  it("match the agreed brackets", () => {
    expect(LEVELS.map((level) => level.piecesLeft)).toEqual([[3, 4], [5, 6], [7, 8], [9], [10]]);
  });
});
