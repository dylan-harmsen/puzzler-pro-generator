import { PIECE_BY_ID, type PieceId } from "../core/pieces.ts";
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
function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Progress just won't survive a reload.
  }
}

// Saved data is outside the code's control, so it's checked rather than trusted.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSolve(value: unknown): value is Solve {
  return (
    isRecord(value) &&
    typeof value.puzzleId === "string" &&
    typeof value.date === "string" &&
    typeof value.hints === "number" &&
    (value.timeMs === null || typeof value.timeMs === "number")
  );
}

function isTimer(value: unknown): value is TimerState {
  return (
    isRecord(value) &&
    typeof value.elapsedMs === "number" &&
    (value.runningSince === null || typeof value.runningSince === "number")
  );
}

function isSession(value: unknown): value is Session {
  return (
    isRecord(value) &&
    Array.isArray(value.hints) &&
    value.hints.every((hint) => PIECE_BY_ID.has(hint)) &&
    isTimer(value.timer) &&
    typeof value.revealed === "boolean"
  );
}

export function loadSolves(): Solve[] {
  const solves = read(SOLVES_KEY);
  return Array.isArray(solves) ? solves.filter(isSolve) : [];
}

export function addSolve(solve: Solve): void {
  write(SOLVES_KEY, [...loadSolves(), solve]);
}

function loadSessions(): Record<string, unknown> {
  const sessions = read(SESSIONS_KEY);
  return isRecord(sessions) ? sessions : {};
}

export function loadSession(puzzleId: string): Session {
  const session = loadSessions()[puzzleId];
  return isSession(session) ? session : { hints: [], timer: NEW_TIMER, revealed: false };
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
  const id = read(LAST_KEY);
  return typeof id === "string" && isSession(loadSessions()[id]) ? id : null;
}
