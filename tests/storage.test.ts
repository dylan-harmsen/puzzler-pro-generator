import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSolve, lastPuzzleId, loadSession, loadSolves, saveSession } from "../src/app/storage.ts";

const SOLVES = "fifty5:solves";
const SESSIONS = "fifty5:sessions";
const LAST = "fifty5:last";

const data = new Map<string, string>();

beforeEach(() => {
  data.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  });
});

const goodSolve = { puzzleId: "wizard-0001", date: "2026-11-02T12:00:00.000Z", hints: 1, timeMs: 5000 };
const goodSession = { hints: ["P"], timer: { elapsedMs: 10, runningSince: null }, revealed: false };
const emptySession = { hints: [], timer: { elapsedMs: 0, runningSince: null }, revealed: false };

// A blank page on load came from trusting whatever was saved in the browser.
describe("saved data that isn't in the expected format", () => {
  it.each(["{not json", "null", "42", '"text"', '{"a":1}'])("ignores solves saved as %s", (saved) => {
    data.set(SOLVES, saved);
    expect(loadSolves()).toEqual([]);
  });

  it("keeps good solves and drops bad ones", () => {
    data.set(SOLVES, JSON.stringify([goodSolve, null, 7, { puzzleId: 3 }, { ...goodSolve, hints: "2" }]));
    expect(loadSolves()).toEqual([goodSolve]);
  });

  it.each(["{not json", "null", "42", "[]", '"text"'])("ignores sessions saved as %s", (saved) => {
    data.set(SESSIONS, saved);
    data.set(LAST, '"wizard-0001"');
    expect(loadSession("wizard-0001")).toEqual(emptySession);
    expect(lastPuzzleId()).toBeNull();
  });

  it.each([
    ["no fields", {}],
    ["hints that aren't a list", { ...goodSession, hints: "P" }],
    ["an unknown piece", { ...goodSession, hints: ["Z"] }],
    ["no timer", { ...goodSession, timer: null }],
    ["a timer with text in it", { ...goodSession, timer: { elapsedMs: "1", runningSince: null } }],
    ["a non-boolean revealed flag", { ...goodSession, revealed: 1 }],
  ])("starts a puzzle fresh if its session has %s", (_, session) => {
    data.set(SESSIONS, JSON.stringify({ "wizard-0001": session }));
    expect(loadSession("wizard-0001")).toEqual(emptySession);
  });

  it.each(["42", "{not json", '{"a":1}', "true"])("has nothing to continue when the last puzzle is saved as %s", (saved) => {
    data.set(SESSIONS, JSON.stringify({ "wizard-0001": goodSession }));
    data.set(LAST, saved);
    expect(lastPuzzleId()).toBeNull();
  });

  it("can still save over bad data", () => {
    data.set(SOLVES, '{"a":1}');
    data.set(SESSIONS, "null");
    addSolve(goodSolve);
    saveSession("wizard-0002", goodSession as never);
    expect(loadSolves()).toEqual([goodSolve]);
    expect(loadSession("wizard-0002")).toEqual(goodSession);
  });
});

describe("saved data in the expected format", () => {
  it("comes back unchanged", () => {
    addSolve(goodSolve);
    addSolve({ ...goodSolve, timeMs: null });
    saveSession("wizard-0001", goodSession as never);
    expect(loadSolves()).toEqual([goodSolve, { ...goodSolve, timeMs: null }]);
    expect(loadSession("wizard-0001")).toEqual(goodSession);
    expect(lastPuzzleId()).toBe("wizard-0001");
  });

  it("restores a running timer", () => {
    const running = { ...goodSession, timer: { elapsedMs: 0, runningSince: 123 } };
    saveSession("wizard-0001", running as never);
    expect(loadSession("wizard-0001")).toEqual(running);
  });
});
