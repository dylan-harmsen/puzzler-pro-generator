export type PieceId = "P" | "B" | "C" | "Y" | "M" | "O" | "R" | "U" | "N" | "L" | "D" | "T";

export type Coord = readonly [row: number, col: number];

export interface Piece {
  id: PieceId;
  name: string;
  color: string;
  ink: string;
  shape: Coord[];
}

// The set as photographed, which is also a known-good solution of the rectangle.
export const REFERENCE_LAYOUT = [
  "PPPBBBCYYYY",
  "MMPPOBCCYRR",
  "MMOOOBUUNNR",
  "LMLODDTUUNR",
  "LLLDDTTTUNR",
];

const STYLES: Record<PieceId, { name: string; color: string; ink: string }> = {
  P: { name: "Pink", color: "#ec5ca8", ink: "#000000" },
  B: { name: "Blue", color: "#1e9be3", ink: "#000000" },
  C: { name: "Light blue", color: "#86d6f2", ink: "#000000" },
  Y: { name: "Yellow", color: "#f9b21c", ink: "#000000" },
  M: { name: "Mint", color: "#8fe6cf", ink: "#000000" },
  O: { name: "Orange", color: "#f5821f", ink: "#000000" },
  R: { name: "Red", color: "#d92614", ink: "#ffffff" },
  U: { name: "Purple", color: "#5b2a8e", ink: "#ffffff" },
  N: { name: "Navy", color: "#1f3ba6", ink: "#ffffff" },
  L: { name: "Lime", color: "#8fcc1f", ink: "#000000" },
  D: { name: "Dark red", color: "#8e0f1a", ink: "#ffffff" },
  T: { name: "Teal", color: "#0f8f95", ink: "#000000" },
};

function shapesFromLayout(layout: string[]): Map<PieceId, Coord[]> {
  const shapes = new Map<PieceId, Coord[]>();
  layout.forEach((row, r) => {
    [...row].forEach((letter, c) => {
      const id = letter as PieceId;
      if (!shapes.has(id)) shapes.set(id, []);
      shapes.get(id)!.push([r, c]);
    });
  });
  return shapes;
}

// Order is fixed: placement generation and given-piece strings both follow it.
export const PIECES: Piece[] = (Object.keys(STYLES) as PieceId[]).map((id) => ({
  id,
  ...STYLES[id],
  shape: normalise(shapesFromLayout(REFERENCE_LAYOUT).get(id)!),
}));

export const PIECE_BY_ID = new Map(PIECES.map((piece) => [piece.id, piece]));

export function normalise(shape: readonly Coord[]): Coord[] {
  const minRow = Math.min(...shape.map(([r]) => r));
  const minCol = Math.min(...shape.map(([, c]) => c));
  return shape
    .map(([r, c]): Coord => [r - minRow, c - minCol])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Every distinct rotation and flip of a shape. */
export function orientations(shape: readonly Coord[]): Coord[][] {
  const distinct = new Map<string, Coord[]>();
  let current: Coord[] = [...shape];
  for (let flip = 0; flip < 2; flip++) {
    for (let turn = 0; turn < 4; turn++) {
      const normalised = normalise(current);
      distinct.set(JSON.stringify(normalised), normalised);
      current = current.map(([r, c]): Coord => [c, -r]);
    }
    current = current.map(([r, c]): Coord => [r, -c]);
  }
  return [...distinct.values()];
}
