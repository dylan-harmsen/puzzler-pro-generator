import { RECTANGLE } from "../core/board.ts";
import { dailyLevel, dailyPuzzle } from "../core/daily.ts";
import { bestHint } from "../core/hints.ts";
import { formatPuzzleId, LEVEL_BY_ID, LEVELS, parsePuzzleId, type Bank, type LevelId, type PuzzleRef } from "../core/levels.ts";
import { PIECE_BY_ID, PIECES, type PieceId } from "../core/pieces.ts";
import { bestTime, pickFreeIndex, solvedCount, solvedIds } from "../core/progress.ts";
import { decodePuzzle, remainingPieces, type Puzzle } from "../core/puzzle.ts";
import { createModel } from "../core/solver.ts";
import { elapsed, formatTime, pauseTimer, startTimer, wasTimed } from "../core/timer.ts";
import { boardElement, pieceElement } from "./render.ts";
import {
  addSolve,
  clearSession,
  lastPuzzleId,
  loadSession,
  loadSolves,
  saveSession,
  type Session,
} from "./storage.ts";

const app = document.querySelector<HTMLElement>("#app")!;
const dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
const model = createModel(RECTANGLE, PIECES);
const DISCLAIMER = "Unofficial fan-made puzzles for IQ Puzzler Pro. Not affiliated with SmartGames.";

type Child = Node | string | null | false;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children.filter((child): child is Node | string => child !== null && child !== false));
  return element;
}

function actionButton(label: string, onclick: () => void, primary = false): HTMLButtonElement {
  return el("button", { type: "button", className: primary ? "action primary" : "action", onclick }, label);
}

// --- Bank

class BankLoadError extends Error {}

const banks = new Map<LevelId, Promise<Bank>>();

function loadBank(level: LevelId): Promise<Bank> {
  let bank = banks.get(level);
  if (!bank) {
    bank = fetch(`${import.meta.env.BASE_URL}bank/${level}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Bank>;
      })
      .catch((error: unknown) => {
        throw new BankLoadError(`Could not load ${level} puzzles: ${String(error)}`);
      });
    bank.catch(() => banks.delete(level));
    banks.set(level, bank);
  }
  return bank;
}

// The daily pool size only matters for the level on today's schedule.
async function todaysPuzzle(): Promise<PuzzleRef> {
  const now = new Date();
  const bank = await loadBank(dailyLevel(now));
  return dailyPuzzle(now, () => bank.daily.length);
}

async function goToNewPuzzle(level: LevelId, avoid: number | null = null): Promise<void> {
  const bank = await loadBank(level);
  const index = pickFreeIndex(level, bank.free.length, solvedIds(loadSolves()), avoid, Math.random);
  const id = formatPuzzleId({ level, pool: "free", index });
  // A skipped puzzle can come back, but not with its solution already showing.
  if (loadSession(id).revealed) clearSession(id);
  location.hash = id;
}

// --- Views

/** Stops the running view's timers and wake lock; set by whichever view starts them. */
let cleanupView: () => void = () => {};
let renderToken = 0;

function show(...children: Child[]): void {
  app.replaceChildren(...children.filter((child): child is Node | string => child !== null && child !== false));
}

function showError(message: string): void {
  show(
    el("h1", {}, "fifty5"),
    el("p", { className: "notice" }, message),
    el("p", {}, el("a", { href: "#" }, "Back to the start")),
  );
}

function footer(): HTMLElement {
  return el("footer", {}, DISCLAIMER);
}

async function renderHome(token: number): Promise<void> {
  const solves = loadSolves();
  const solved = solvedIds(solves);
  const level = LEVEL_BY_ID.get(dailyLevel(new Date()))!;
  const levelList = LEVELS.map((entry) => {
    const best = bestTime(solves, entry.id);
    const count = solvedCount(solves, entry.id);
    const pieces = entry.piecesLeft.join("–");
    return el(
      "button",
      { type: "button", className: "card", onclick: () => void goToNewPuzzle(entry.id).catch(() => showBankError()) },
      el("span", {}, el("strong", {}, entry.name), el("span", { className: "muted small" }, `${pieces} pieces to place`)),
      el("span", { className: "meta" }, `${count} solved`, best === null ? null : el("br"), best === null ? null : `best ${formatTime(best)}`),
    );
  });

  const last = lastPuzzleId();
  const dailyCard = el(
    "a",
    { className: "card primary", href: "#today" },
    el("span", {}, el("strong", {}, "Puzzle of the day"), el("span", { className: "muted small" }, level.name)),
    el("span", { className: "meta", id: "daily-status" }),
  );

  show(
    el("h1", {}, "fifty5"),
    el("p", { className: "tagline" }, DISCLAIMER),
    el("h2", {}, "Today"),
    dailyCard,
    last ? el("a", { className: "card", href: `#${last}` }, el("strong", {}, "Continue"), el("span", { className: "meta" }, describePuzzle(last))) : null,
    el("h2", {}, "New puzzle"),
    ...levelList,
    el("p", { className: "small" }, el("a", { href: "#history" }, "Your solves")),
    footer(),
  );

  try {
    const today = await todaysPuzzle();
    if (token !== renderToken) return;
    if (solved.has(formatPuzzleId(today))) dailyCard.querySelector("#daily-status")!.textContent = "Solved today";
  } catch {
    // The card still opens the puzzle, which reports the failure itself.
  }
}

function describePuzzle(id: string): string {
  const ref = parsePuzzleId(id);
  if (!ref) return id;
  const name = LEVEL_BY_ID.get(ref.level)!.name;
  return ref.pool === "daily" ? `Daily ${name} #${ref.index}` : `${name} #${ref.index}`;
}

function showBankError(): void {
  showError("The puzzles couldn't be loaded. Check your connection and try again.");
}

function renderHistory(): void {
  const solves = loadSolves();
  const rows = [...solves].reverse().map((solve) =>
    el(
      "div",
      { className: "history-row" },
      el(
        "span",
        {},
        el("a", { href: `#${solve.puzzleId}` }, describePuzzle(solve.puzzleId)),
        el("br"),
        el("span", { className: "muted small" }, new Date(solve.date).toLocaleDateString()),
      ),
      el(
        "span",
        { className: "meta" },
        solve.timeMs === null ? "Not timed" : formatTime(solve.timeMs),
        el("br"),
        el("span", { className: "muted small" }, solve.hints === 1 ? "1 hint" : `${solve.hints} hints`),
      ),
    ),
  );
  const bests = LEVELS.map((level) => {
    const best = bestTime(solves, level.id);
    return el("div", { className: "history-row" }, el("span", {}, level.name), el("span", {}, best === null ? "–" : formatTime(best)));
  });
  show(
    el("div", { className: "topbar" }, el("a", { href: "#" }, "← fifty5"), el("h1", {}, "Your solves")),
    el("h2", {}, "Best times without hints"),
    ...bests,
    el("h2", {}, "History"),
    rows.length > 0 ? el("div", {}, ...rows) : el("p", { className: "muted" }, "Solved puzzles will show up here."),
    el("p", { className: "muted small" }, "Saved only in this browser."),
    footer(),
  );
}

function renderPuzzle(id: string, ref: PuzzleRef, puzzle: Puzzle): void {
  const level = LEVEL_BY_ID.get(ref.level)!;
  const left = remainingPieces(puzzle);
  let session: Session = loadSession(id);
  let ticker: number | undefined;
  let wakeLock: WakeLockSentinel | null = null;

  const update = (change: Partial<Session>) => {
    session = { ...session, ...change };
    saveSession(id, session);
    draw();
  };

  const keepAwake = async () => {
    if (session.timer.runningSince === null || wakeLock || document.visibilityState !== "visible") return;
    try {
      const lock = await navigator.wakeLock?.request("screen");
      if (lock) {
        wakeLock = lock;
        lock.addEventListener("release", () => {
          if (wakeLock === lock) wakeLock = null;
        });
      }
    } catch {
      // Not supported or refused; the timer still works.
    }
  };

  const syncTimer = () => {
    window.clearInterval(ticker);
    if (session.timer.runningSince !== null) {
      ticker = window.setInterval(() => {
        const display = app.querySelector("#time");
        if (display) display.textContent = formatTime(elapsed(session.timer, Date.now()));
      }, 250);
      void keepAwake();
    } else {
      void wakeLock?.release();
      wakeLock = null;
    }
  };

  const onVisible = () => void keepAwake();
  document.addEventListener("visibilitychange", onVisible);
  cleanupView = () => {
    window.clearInterval(ticker);
    void wakeLock?.release();
    document.removeEventListener("visibilitychange", onVisible);
    // Leaving a puzzle inside the site pauses it; locking the phone doesn't reach this.
    const stored = loadSession(id);
    if (stored.timer.runningSince !== null) saveSession(id, { ...stored, timer: pauseTimer(stored.timer, Date.now()) });
  };

  const openHint = () => {
    const best = bestHint(model, puzzle, session.hints);
    const reveal = (piece: PieceId) => {
      dialog.close();
      update({ hints: [...session.hints, piece] });
    };
    const unrevealed = left.filter((piece) => !session.hints.includes(piece));
    openDialog(
      el("h2", {}, "Reveal one piece"),
      el("p", { className: "muted" }, "It stays on the board and counts as one hint."),
      el("div", { className: "actions" }, best ? actionButton("Pick for me", () => reveal(best), true) : null),
      el("h2", {}, "Or choose one"),
      el(
        "div",
        { className: "tray" },
        ...unrevealed.map((piece) => {
          const def = PIECE_BY_ID.get(piece)!;
          return el("button", { type: "button", className: "tray-piece", onclick: () => reveal(piece) }, pieceElement(def), def.name);
        }),
      ),
      el("div", { className: "actions" }, actionButton("Cancel", () => dialog.close())),
    );
  };

  const openReveal = () => {
    openDialog(
      el("h2", {}, "Reveal the whole solution?"),
      el("p", {}, "This puzzle won't be saved as a solve."),
      el(
        "div",
        { className: "actions" },
        actionButton("Keep trying", () => dialog.close()),
        actionButton(
          "Reveal solution",
          () => {
            dialog.close();
            update({ revealed: true, timer: pauseTimer(session.timer, Date.now()) });
          },
          true,
        ),
      ),
    );
  };

  const openSolved = () => {
    // The clock stops when Solved is tapped; "Keep solving" picks it back up.
    const wasRunning = session.timer.runningSince !== null;
    const timed = wasTimed(session.timer);
    update({ timer: pauseTimer(session.timer, Date.now()) });
    const time = session.timer.elapsedMs;
    const save = (timeMs: number | null) => {
      dialog.close();
      addSolve({ puzzleId: id, date: new Date().toISOString(), hints: session.hints.length, timeMs });
      clearSession(id);
      renderSaved(timeMs);
    };
    const keepSolving = () => {
      if (dialog.open) dialog.close();
      if (wasRunning) update({ timer: startTimer(session.timer, Date.now()) });
    };
    const hintText = session.hints.length === 1 ? "1 hint used" : `${session.hints.length} hints used`;
    openDialog(
      el("h2", {}, "Solved?"),
      el("p", {}, timed ? `${formatTime(time)} · ${hintText}` : hintText),
      el(
        "div",
        { className: "actions" },
        actionButton("Keep solving", keepSolving),
        timed ? actionButton("Save without time", () => save(null)) : null,
        actionButton("Save solve", () => save(timed ? time : null), true),
      ),
    );
    dialog.oncancel = keepSolving;
  };

  const renderSaved = (timeMs: number | null) => {
    window.clearInterval(ticker);
    void wakeLock?.release();
    const hintText = session.hints.length === 1 ? "1 hint" : `${session.hints.length} hints`;
    show(
      topBar(),
      boardElement(RECTANGLE, puzzle.solution, new Set(PIECES.map((p) => p.id)), new Set()),
      el(
        "p",
        { className: "notice" },
        el("strong", {}, "Saved. "),
        timeMs === null ? `Not timed, ${hintText}.` : `${formatTime(timeMs)}, ${hintText}.`,
      ),
      nextActions(),
    );
  };

  const share = async () => {
    const url = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `fifty5: ${describePuzzle(id)}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        const button = app.querySelector<HTMLButtonElement>("#share");
        if (button) button.textContent = "Link copied";
      }
    } catch {
      // Cancelled, or the clipboard is unavailable; the address bar still has the link.
    }
  };

  const topBar = () =>
    el(
      "div",
      { className: "topbar" },
      el("a", { href: "#" }, "← fifty5"),
      el("h1", {}, describePuzzle(id)),
      el("button", { type: "button", className: "action", id: "share", onclick: () => void share() }, "Share"),
    );

  const nextActions = () =>
    el(
      "div",
      { className: "actions" },
      actionButton(`New ${level.name} puzzle`, () => void goToNewPuzzle(ref.level, ref.pool === "free" ? ref.index : null).catch(showBankError), true),
      el("a", { href: "#", className: "card inline" }, "All levels"),
    );

  const draw = () => {
    const shown = new Set<PieceId>(session.revealed ? PIECES.map((p) => p.id) : [...puzzle.given, ...session.hints]);
    const rings = new Set<PieceId>(session.revealed ? left : session.hints);
    const hintButton = actionButton("Hint", openHint);
    hintButton.disabled = left.every((piece) => session.hints.includes(piece));
    const timed = wasTimed(session.timer);
    const running = session.timer.runningSince !== null;
    const alreadySolved = solvedIds(loadSolves()).has(id);

    const timerRow = session.revealed
      ? null
      : el(
          "div",
          { className: "timer-row" },
          timed
            ? el("span", { className: "time", id: "time" }, formatTime(elapsed(session.timer, Date.now())))
            : el("span", { className: "timer-label" }, "Timer is optional"),
          actionButton(
            running ? "Pause" : timed ? "Resume" : "Start timer",
            () =>
              update({
                timer: running ? pauseTimer(session.timer, Date.now()) : startTimer(session.timer, Date.now()),
              }),
          ),
        );

    show(
      topBar(),
      el(
        "p",
        { className: "muted small" },
        `${level.name}: place ${left.length} pieces.`,
        session.hints.length > 0 ? ` ${session.hints.length === 1 ? "1 hint" : `${session.hints.length} hints`} used.` : "",
        alreadySolved ? " You've solved this one before." : "",
      ),
      boardElement(RECTANGLE, puzzle.solution, shown, rings),
      timerRow,
      el("h2", {}, session.revealed ? "Solution" : "Pieces to place"),
      el(
        "div",
        { className: "tray" },
        ...left.map((piece) => {
          const def = PIECE_BY_ID.get(piece)!;
          const placed = session.revealed || session.hints.includes(piece);
          return el("div", { className: placed ? "tray-piece placed" : "tray-piece" }, pieceElement(def), placed ? `${def.name} (shown)` : def.name);
        }),
      ),
      session.revealed
        ? el("p", { className: "notice" }, "Solution revealed, so this puzzle wasn't saved as a solve.")
        : el(
            "div",
            { className: "actions" },
            actionButton("Solved", openSolved, true),
            hintButton,
            actionButton("Reveal solution", openReveal),
          ),
      session.revealed
        ? el(
            "div",
            { className: "actions" },
            actionButton("Start over", () => {
              clearSession(id);
              session = loadSession(id);
              draw();
            }),
          )
        : null,
      nextActions(),
      footer(),
    );

    syncTimer();
  };

  saveSession(id, session);
  draw();
}

function openDialog(...children: Child[]): void {
  dialog.replaceChildren(...children.filter((child): child is Node | string => child !== null && child !== false));
  dialog.oncancel = null;
  dialog.showModal();
}

// --- Routing

async function route(): Promise<void> {
  const token = ++renderToken;
  cleanupView();
  cleanupView = () => {};
  if (dialog.open) dialog.close();

  const hash = location.hash.slice(1);

  try {
    if (hash === "") return await renderHome(token);
    if (hash === "history") return renderHistory();
    if (hash === "today") {
      const today = await todaysPuzzle();
      if (token === renderToken) location.replace(`#${formatPuzzleId(today)}`);
      return;
    }
    const ref = parsePuzzleId(hash);
    const encoded = ref ? (await loadBank(ref.level))[ref.pool][ref.index] : undefined;
    if (token !== renderToken) return;
    if (!ref || encoded === undefined) {
      showError("That puzzle doesn't exist.");
      return;
    }
    renderPuzzle(hash, ref, decodePuzzle(encoded));
  } catch (error) {
    if (token !== renderToken) return;
    if (error instanceof BankLoadError) showBankError();
    else showError(`Something went wrong opening this page. ${String(error)}`);
  }
}

window.addEventListener("hashchange", () => void route().then(() => window.scrollTo(0, 0)));
void route();
