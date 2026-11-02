export type LevelId = "starter" | "junior" | "expert" | "master" | "wizard";

export interface Level {
  id: LevelId;
  name: string;
  /** How many pieces the player has to place. */
  piecesLeft: number[];
  /** Puzzles for free play; null means every puzzle not reserved for daily. */
  freeTarget: number | null;
  dailyTarget: number;
}

export const LEVELS: Level[] = [
  { id: "starter", name: "Starter", piecesLeft: [3, 4], freeTarget: 3000, dailyTarget: 520 },
  { id: "junior", name: "Junior", piecesLeft: [5, 6], freeTarget: 3000, dailyTarget: 520 },
  { id: "expert", name: "Expert", piecesLeft: [7, 8], freeTarget: 3000, dailyTarget: 1040 },
  { id: "master", name: "Master", piecesLeft: [9], freeTarget: 3000, dailyTarget: 1040 },
  { id: "wizard", name: "Wizard", piecesLeft: [10], freeTarget: null, dailyTarget: 520 },
];

export const LEVEL_BY_ID = new Map(LEVELS.map((level) => [level.id, level]));

export interface PuzzleRef {
  level: LevelId;
  pool: "free" | "daily";
  index: number;
}

export interface Bank {
  free: string[];
  daily: string[];
}

export function formatPuzzleId({ level, pool, index }: PuzzleRef): string {
  return `${level}-${pool === "daily" ? "d" : ""}${String(index).padStart(4, "0")}`;
}

export function parsePuzzleId(id: string): PuzzleRef | null {
  const match = /^([a-z]+)-(d?)(\d{4,})$/.exec(id);
  if (!match || !LEVEL_BY_ID.has(match[1] as LevelId)) return null;
  return { level: match[1] as LevelId, pool: match[2] ? "daily" : "free", index: Number(match[3]) };
}
