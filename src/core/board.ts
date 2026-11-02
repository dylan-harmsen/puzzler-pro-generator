import type { Coord } from "./pieces.ts";

export interface Board {
  id: string;
  rows: number;
  cols: number;
  /** Cell index -> coordinate. A puzzle string lists cells in this order. */
  cells: Coord[];
  /** Cell index -> indexes of the cells next to it. */
  neighbours: number[][];
  /** Each symmetry maps a cell index to the index it moves to. */
  symmetries: number[][];
}

export function rectangleBoard(id: string, rows: number, cols: number): Board {
  const index = (r: number, c: number) => r * cols + c;
  const cells: Coord[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([r, c]);

  const neighbours = cells.map(([r, c]) => {
    const near: number[] = [];
    if (r > 0) near.push(index(r - 1, c));
    if (r < rows - 1) near.push(index(r + 1, c));
    if (c > 0) near.push(index(r, c - 1));
    if (c < cols - 1) near.push(index(r, c + 1));
    return near;
  });

  const symmetries = [
    cells.map(([r, c]) => index(r, c)),
    cells.map(([r, c]) => index(r, cols - 1 - c)),
    cells.map(([r, c]) => index(rows - 1 - r, c)),
    cells.map(([r, c]) => index(rows - 1 - r, cols - 1 - c)),
  ];

  return { id, rows, cols, cells, neighbours, symmetries };
}

export const RECTANGLE = rectangleBoard("rectangle", 5, 11);
