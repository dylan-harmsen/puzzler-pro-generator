import type { LevelId, PuzzleRef } from "./levels.ts";

// Monday first, so a week's position lines up with the days since the epoch.
const WEEK: LevelId[] = ["starter", "junior", "expert", "master", "wizard", "expert", "master"];

// A Monday. Changing it would change every daily puzzle.
const EPOCH_UTC = Date.UTC(2026, 10, 2);
const DAY_MS = 86_400_000;

/** The daily puzzle for a local calendar date, given each level's daily pool size. */
export function dailyPuzzle(date: Date, poolSize: (level: LevelId) => number): PuzzleRef {
  // Using UTC on the local date's fields keeps every day 24 hours long across clock changes.
  const days = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - EPOCH_UTC) / DAY_MS,
  );
  const week = Math.floor(days / 7);
  const dayOfWeek = days - week * 7;
  const level = WEEK[dayOfWeek];
  const slotsPerWeek = WEEK.filter((l) => l === level).length;
  const slotInWeek = WEEK.slice(0, dayOfWeek).filter((l) => l === level).length;
  const size = poolSize(level);
  const index = (((week * slotsPerWeek + slotInWeek) % size) + size) % size;
  return { level, pool: "daily", index };
}

export function dailyLevel(date: Date): LevelId {
  return dailyPuzzle(date, () => 1).level;
}
