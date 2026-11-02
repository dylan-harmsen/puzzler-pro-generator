import { formatPuzzleId, parsePuzzleId, type LevelId } from "./levels.ts";

export interface Solve {
  puzzleId: string;
  /** ISO timestamp. */
  date: string;
  hints: number;
  /** Null when the solve wasn't timed or was saved without its time. */
  timeMs: number | null;
}

/** Best times count only solves with no hints. */
export function bestTime(solves: readonly Solve[], level: LevelId): number | null {
  let best: number | null = null;
  for (const solve of solves) {
    if (solve.hints > 0 || solve.timeMs === null) continue;
    if (parsePuzzleId(solve.puzzleId)?.level !== level) continue;
    if (best === null || solve.timeMs < best) best = solve.timeMs;
  }
  return best;
}

export function solvedIds(solves: readonly Solve[]): Set<string> {
  return new Set(solves.map((solve) => solve.puzzleId));
}

/** Free-play puzzles of a level that have been solved at least once. */
export function solvedCount(solves: readonly Solve[], level: LevelId): number {
  let count = 0;
  for (const id of solvedIds(solves)) {
    const ref = parsePuzzleId(id);
    if (ref?.level === level && ref.pool === "free") count++;
  }
  return count;
}

/** A random unsolved free-play puzzle; once all are solved, any puzzle in the level. */
export function pickFreeIndex(
  level: LevelId,
  poolSize: number,
  solved: ReadonlySet<string>,
  avoidIndex: number | null,
  random: () => number,
): number {
  const candidates: number[] = [];
  for (let index = 0; index < poolSize; index++) {
    if (!solved.has(formatPuzzleId({ level, pool: "free", index }))) candidates.push(index);
  }
  const pool = candidates.length > 0 ? candidates : Array.from({ length: poolSize }, (_, index) => index);
  const choices = pool.length > 1 ? pool.filter((index) => index !== avoidIndex) : pool;
  return choices[Math.floor(random() * choices.length)];
}
