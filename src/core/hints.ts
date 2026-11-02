import type { PieceId } from "./pieces.ts";
import { placementOf, remainingPieces, type Puzzle } from "./puzzle.ts";
import { hasDeadRegion, type Model } from "./solver.ts";

/** How many spots a piece could still go, given what is known to be on the board. */
export function possiblePositions(model: Model, puzzle: Puzzle, revealed: readonly PieceId[], piece: PieceId): number {
  let lo = 0;
  let hi = 0;
  for (const known of [...puzzle.given, ...revealed]) {
    const placement = model.placements[placementOf(model, puzzle.solution, known)];
    lo |= placement.lo;
    hi |= placement.hi;
  }
  const pieceIndex = model.pieces.findIndex((p) => p.id === piece);
  let positions = 0;
  for (const placement of model.placements) {
    if (placement.piece !== pieceIndex) continue;
    if ((placement.lo & lo) || (placement.hi & hi)) continue;
    if (!hasDeadRegion(model, lo | placement.lo, hi | placement.hi)) positions++;
  }
  return positions;
}

/** The unrevealed piece with the fewest possible positions, or null when none remain. */
export function bestHint(model: Model, puzzle: Puzzle, revealed: readonly PieceId[]): PieceId | null {
  let best: PieceId | null = null;
  let fewest = Infinity;
  for (const piece of remainingPieces(puzzle)) {
    if (revealed.includes(piece)) continue;
    const positions = possiblePositions(model, puzzle, revealed, piece);
    if (positions < fewest) {
      fewest = positions;
      best = piece;
    }
  }
  return best;
}
