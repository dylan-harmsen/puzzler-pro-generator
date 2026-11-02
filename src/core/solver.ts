import type { Board } from "./board.ts";
import { orientations, type Piece } from "./pieces.ts";

export interface Placement {
  piece: number;
  cells: number[];
  lo: number;
  hi: number;
}

export interface Model {
  board: Board;
  pieces: Piece[];
  placements: Placement[];
  /** First cell of a placement -> piece index -> placement ids. */
  byAnchor: number[][][];
  /** Region size -> whether some combination of the pieces could fill it. */
  fillable: boolean[];
}

export interface SearchResult {
  count: number;
  /** Placements tried, used as the measure of solver effort. */
  nodes: number;
}

const WORD_BITS = 30;
const MAX_CELLS = WORD_BITS * 2;

function isFilled(lo: number, hi: number, cell: number): number {
  return cell < WORD_BITS ? (lo >>> cell) & 1 : (hi >>> (cell - WORD_BITS)) & 1;
}

export function createModel(board: Board, pieces: Piece[]): Model {
  if (board.cells.length > MAX_CELLS) throw new Error(`Boards are limited to ${MAX_CELLS} cells`);

  const cellAt = new Map(board.cells.map(([r, c], index) => [`${r},${c}`, index]));
  const placements: Placement[] = [];
  const byAnchor = board.cells.map(() => pieces.map((): number[] => []));

  pieces.forEach((piece, pieceIndex) => {
    for (const orientation of orientations(piece.shape)) {
      for (const [originRow, originCol] of board.cells) {
        const cells = orientation.map(([r, c]) => cellAt.get(`${originRow + r},${originCol + c}`));
        if (cells.some((cell) => cell === undefined)) continue;
        const sorted = (cells as number[]).sort((a, b) => a - b);
        let lo = 0;
        let hi = 0;
        for (const cell of sorted) {
          if (cell < WORD_BITS) lo |= 1 << cell;
          else hi |= 1 << (cell - WORD_BITS);
        }
        byAnchor[sorted[0]][pieceIndex].push(placements.length);
        placements.push({ piece: pieceIndex, cells: sorted, lo, hi });
      }
    }
  });

  const fillable = new Array<boolean>(board.cells.length + 1).fill(false);
  fillable[0] = true;
  for (const piece of pieces) {
    for (let size = board.cells.length; size >= piece.shape.length; size--) {
      if (fillable[size - piece.shape.length]) fillable[size] = true;
    }
  }

  return { board, pieces, placements, byAnchor, fillable };
}

const regionMarks = new Map<Model, { marks: Uint32Array; stack: Int32Array; stamp: number }>();

/** True when some empty region could never be filled, whichever pieces remain. */
export function hasDeadRegion(model: Model, lo: number, hi: number): boolean {
  const { neighbours, cells } = model.board;
  let scratch = regionMarks.get(model);
  if (!scratch) {
    scratch = { marks: new Uint32Array(cells.length), stack: new Int32Array(cells.length), stamp: 0 };
    regionMarks.set(model, scratch);
  }
  const { marks, stack } = scratch;
  const stamp = ++scratch.stamp;

  for (let start = 0; start < cells.length; start++) {
    if (isFilled(lo, hi, start) || marks[start] === stamp) continue;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    marks[start] = stamp;
    while (top > 0) {
      const cell = stack[--top];
      size++;
      for (const next of neighbours[cell]) {
        if (marks[next] !== stamp && !isFilled(lo, hi, next)) {
          marks[next] = stamp;
          stack[top++] = next;
        }
      }
    }
    if (!model.fillable[size]) return true;
  }
  return false;
}

/**
 * Finds up to `limit` ways to complete the board from the given placements.
 * `onSolution` receives the given and added placement ids; copy it to keep it.
 */
export function search(
  model: Model,
  given: readonly number[],
  limit = Infinity,
  onSolution?: (placementIds: readonly number[]) => void,
): SearchResult {
  const { placements, byAnchor, pieces, board } = model;
  const total = board.cells.length;
  const stack = [...given];
  let startLo = 0;
  let startHi = 0;
  let startUsed = 0;
  for (const id of given) {
    const placement = placements[id];
    if ((placement.lo & startLo) || (placement.hi & startHi) || startUsed & (1 << placement.piece)) {
      return { count: 0, nodes: 0 };
    }
    startLo |= placement.lo;
    startHi |= placement.hi;
    startUsed |= 1 << placement.piece;
  }

  let count = 0;
  let nodes = 0;

  const walk = (lo: number, hi: number, used: number, from: number): void => {
    let cell = from;
    while (cell < total && isFilled(lo, hi, cell)) cell++;
    if (cell === total) {
      count++;
      onSolution?.(stack);
      return;
    }
    const lists = byAnchor[cell];
    for (let piece = 0; piece < pieces.length; piece++) {
      if (used & (1 << piece)) continue;
      for (const id of lists[piece]) {
        const placement = placements[id];
        if ((placement.lo & lo) || (placement.hi & hi)) continue;
        nodes++;
        const nextLo = lo | placement.lo;
        const nextHi = hi | placement.hi;
        if (hasDeadRegion(model, nextLo, nextHi)) continue;
        stack.push(id);
        walk(nextLo, nextHi, used | (1 << piece), cell + 1);
        stack.pop();
        if (count >= limit) return;
      }
    }
  };

  if (!hasDeadRegion(model, startLo, startHi)) walk(startLo, startHi, startUsed, 0);
  return { count, nodes };
}
