import type { Board } from "../core/board.ts";
import { normalise, PIECE_BY_ID, type Coord, type Piece, type PieceId } from "../core/pieces.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
// Drawing units per cell. Whole-number sizes keep text rendering reliable across browsers.
const UNIT = 20;
const BALL_RADIUS = 8.8;
const LINK_WIDTH = 8.4;
const TRAY_ROWS = 3;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

function drawBall(root: SVGElement, piece: Piece, x: number, y: number, ring: boolean): void {
  root.append(svg("circle", { cx: x, cy: y, r: BALL_RADIUS, fill: piece.color }));
  if (ring) root.append(svg("circle", { cx: x, cy: y, r: BALL_RADIUS - 0.7, class: "reveal-ring" }));
  const letter = svg("text", { x, y, fill: piece.ink, class: "ball-letter" });
  letter.textContent = piece.id;
  root.append(letter);
}

function drawLink(root: SVGElement, piece: Piece, x1: number, y1: number, x2: number, y2: number): void {
  root.append(svg("line", { x1, y1, x2, y2, stroke: piece.color, "stroke-width": LINK_WIDTH }));
}

/** Draws the board with the shown pieces in place; revealed pieces get a ring. */
export function boardElement(
  board: Board,
  solution: string,
  shown: ReadonlySet<PieceId>,
  rings: ReadonlySet<PieceId>,
): SVGSVGElement {
  const root = svg("svg", {
    class: "board",
    viewBox: `0 0 ${board.cols * UNIT} ${board.rows * UNIT}`,
    role: "img",
    "aria-label": `Board with ${shown.size} pieces in place: ${[...shown].map((id) => PIECE_BY_ID.get(id)!.name).join(", ")}`,
  });
  const centre = (cell: number) => [(board.cells[cell][1] + 0.5) * UNIT, (board.cells[cell][0] + 0.5) * UNIT];

  board.cells.forEach((_, cell) => {
    if (shown.has(solution[cell] as PieceId)) return;
    const [x, y] = centre(cell);
    root.append(svg("circle", { cx: x, cy: y, r: BALL_RADIUS, class: "empty-cell" }));
  });

  // Links go underneath the balls so each piece reads as one joined shape.
  board.cells.forEach((_, cell) => {
    const id = solution[cell] as PieceId;
    if (!shown.has(id)) return;
    for (const next of board.neighbours[cell]) {
      if (next > cell && solution[next] === id) {
        const [x1, y1] = centre(cell);
        const [x2, y2] = centre(next);
        drawLink(root, PIECE_BY_ID.get(id)!, x1, y1, x2, y2);
      }
    }
  });

  board.cells.forEach((_, cell) => {
    const id = solution[cell] as PieceId;
    if (!shown.has(id)) return;
    const [x, y] = centre(cell);
    drawBall(root, PIECE_BY_ID.get(id)!, x, y, rings.has(id));
  });

  return root;
}

/** Draws one piece on its own for the tray, turned to lie wider than tall. */
export function pieceElement(piece: Piece): SVGSVGElement {
  const tall = Math.max(...piece.shape.map(([r]) => r)) > Math.max(...piece.shape.map(([, c]) => c));
  const cells = normalise(tall ? piece.shape.map(([r, c]): Coord => [c, r]) : piece.shape);
  const rows = Math.max(...cells.map(([r]) => r)) + 1;
  const cols = Math.max(...cells.map(([, c]) => c)) + 1;
  // Every tray entry uses the same height, so a ball is the same size in all of them.
  const root = svg("svg", { viewBox: `0 0 ${cols * UNIT} ${TRAY_ROWS * UNIT}`, role: "presentation" });
  const top = (TRAY_ROWS - rows) / 2;
  const at = (n: number) => (n + 0.5) * UNIT;
  const has = (r: number, c: number) => cells.some(([a, b]) => a === r && b === c);
  for (const [r, c] of cells) {
    if (has(r, c + 1)) drawLink(root, piece, at(c), at(top + r), at(c + 1), at(top + r));
    if (has(r + 1, c)) drawLink(root, piece, at(c), at(top + r), at(c), at(top + r + 1));
  }
  for (const [r, c] of cells) drawBall(root, piece, at(c), at(top + r), false);
  return root;
}
