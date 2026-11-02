/** Stored as timestamps so time keeps passing while the page is closed or asleep. */
export interface TimerState {
  elapsedMs: number;
  runningSince: number | null;
}

export const NEW_TIMER: TimerState = { elapsedMs: 0, runningSince: null };

export function startTimer(timer: TimerState, now: number): TimerState {
  return timer.runningSince === null ? { ...timer, runningSince: now } : timer;
}

export function pauseTimer(timer: TimerState, now: number): TimerState {
  return timer.runningSince === null ? timer : { elapsedMs: elapsed(timer, now), runningSince: null };
}

export function elapsed(timer: TimerState, now: number): number {
  return timer.elapsedMs + (timer.runningSince === null ? 0 : Math.max(0, now - timer.runningSince));
}

export function wasTimed(timer: TimerState): boolean {
  return timer.runningSince !== null || timer.elapsedMs > 0;
}

export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
