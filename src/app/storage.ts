import type { PieceId } from "../core/pieces.ts";
import type { Solve } from "../core/progress.ts";
import { NEW_TIMER, type TimerState } from "../core/timer.ts";

export interface Session {
  hints: PieceId[];
  timer: TimerState;
  revealed: boolean;
}

const SOLVES_KEY = "fifty5:solves";
const SESSIONS_KEY = "fifty5:sessions";
const LAST_KEY = "fifty5:last";

// Storage can throw or come back empty in a private window, so nothing here may fail.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Progress just won't survive a reload.
  }
}

export function loadSolves(): Solve[] {
  return read<Solve[]>(SOLVES_KEY, []);
}

export function addSolve(solve: Solve): void {
  write(SOLVES_KEY, [...loadSolves(), solve]);
}

function loadSessions(): Record<string, Session> {
  return read<Record<string, Session>>(SESSIONS_KEY, {});
}

export function loadSession(puzzleId: string): Session {
  return loadSessions()[puzzleId] ?? { hints: [], timer: NEW_TIMER, revealed: false };
}

export function saveSession(puzzleId: string, session: Session): void {
  write(SESSIONS_KEY, { ...loadSessions(), [puzzleId]: session });
  write(LAST_KEY, puzzleId);
}

export function clearSession(puzzleId: string): void {
  const sessions = loadSessions();
  delete sessions[puzzleId];
  write(SESSIONS_KEY, sessions);
  if (lastPuzzleId() === puzzleId) write(LAST_KEY, null);
}

export function lastPuzzleId(): string | null {
  const id = read<string | null>(LAST_KEY, null);
  return id !== null && loadSessions()[id] ? id : null;
}
