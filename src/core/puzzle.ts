import type { Board } from "./board.ts";
import { PIECES, type PieceId } from "./pieces.ts";
import { search, type Model } from "./solver.ts";

/** One letter per board cell, plus the pieces that start on the board. */
export interface Puzzle {
  solution: string;
  given: PieceId[];
}

export function encodePuzzle(puzzle: Puzzle): string {
  return `${puzzle.solution}:${puzzle.given.join("")}`;
}

export function decodePuzzle(encoded: string): Puzzle {
  const [solution, given] = encoded.split(":");
  return { solution, given: [...given] as PieceId[] };
}

export function remainingPieces(puzzle: Puzzle): PieceId[] {
  const given = new Set(puzzle.given);
  return PIECES.map((piece) => piece.id).filter((id) => !given.has(id));
}

/** The cells a piece occupies in the solution. */
export function cellsOf(solution: string, piece: PieceId): number[] {
  const cells: number[] = [];
  for (let cell = 0; cell < solution.length; cell++) {
    if (solution[cell] === piece) cells.push(cell);
  }
  return cells;
}

const lookups = new Map<Model, Map<string, number>>();

function placementKey(piece: number, cells: readonly number[]): string {
  return `${piece}:${cells.join(",")}`;
}

/** The placement id a piece has in the solution. */
export function placementOf(model: Model, solution: string, piece: PieceId): number {
  let lookup = lookups.get(model);
  if (!lookup) {
    lookup = new Map(model.placements.map((p, id) => [placementKey(p.piece, p.cells), id]));
    lookups.set(model, lookup);
  }
  const pieceIndex = model.pieces.findIndex((p) => p.id === piece);
  const id = lookup.get(placementKey(pieceIndex, cellsOf(solution, piece)));
  if (id === undefined) throw new Error(`Piece ${piece} is not a valid shape in this solution`);
  return id;
}

/** Whether the puzzle's given pieces leave exactly one way to complete the board. */
export function countSolutions(model: Model, puzzle: Puzzle, limit = 2): number {
  return search(model, puzzle.given.map((piece) => placementOf(model, puzzle.solution, piece)), limit).count;
}

/** Whether a remaining piece sits walled off in a gap of exactly its own shape, giving it away. */
export function hasGiveawayGap(board: Board, puzzle: Puzzle): boolean {
  const given = new Set<string>(puzzle.given);
  return remainingPieces(puzzle).some((piece) =>
    cellsOf(puzzle.solution, piece).every((cell) =>
      board.neighbours[cell].every((next) => puzzle.solution[next] === piece || given.has(puzzle.solution[next])),
    ),
  );
}

export function applySymmetry(board: Board, puzzle: Puzzle, symmetry: number): Puzzle {
  const moved = new Array<string>(puzzle.solution.length);
  board.symmetries[symmetry].forEach((target, cell) => {
    moved[target] = puzzle.solution[cell];
  });
  return { solution: moved.join(""), given: puzzle.given };
}

/** The same form for a puzzle and all its rotated and mirrored copies. */
export function canonicalPuzzle(board: Board, puzzle: Puzzle): Puzzle {
  const given = PIECES.map((piece) => piece.id).filter((id) => puzzle.given.includes(id));
  let best = puzzle.solution;
  for (let symmetry = 1; symmetry < board.symmetries.length; symmetry++) {
    const { solution } = applySymmetry(board, puzzle, symmetry);
    if (solution < best) best = solution;
  }
  return { solution: best, given };
}
