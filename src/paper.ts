// Published Cram results, transcribed from the TeX source of Lemoine and
// Viennot, "Nimbers are inevitable" (arXiv:1011.5841, 2010), section 6.
// A number n is the nimber *n; 'W' is "first player wins" (nimber not 0, exact
// value not computed); '>3' is "nimber greater than *3". Their "*" marks the
// values already in Martin Schneider's 2009 thesis; their parentheses mark the
// values that follow from the symmetry strategy without computation.

export type PaperValue = number | 'W' | '>3';

export interface PaperCell {
  rows: number;
  cols: number;
  value: PaperValue;
  /** already in Schneider (2009) */
  schneider: boolean;
  /** given by the symmetry strategy (even × even boards, and the outcome of even × odd ones) */
  symmetry: boolean;
}

const three = [0, 1, 1, 4, 1, 3, 1, 2, 0, 1, 2, 3, 1, 4, 0, 1];

export const PAPER: PaperCell[] = [
  ...three.map((value, i) => ({ rows: 3, cols: i + 3, value, schneider: i + 3 <= 9, symmetry: false })),
  { rows: 4, cols: 4, value: 0, schneider: false, symmetry: true },
  { rows: 4, cols: 5, value: 2, schneider: true, symmetry: false },
  { rows: 4, cols: 6, value: 0, schneider: false, symmetry: true },
  { rows: 4, cols: 7, value: 3, schneider: false, symmetry: false },
  { rows: 4, cols: 8, value: 0, schneider: false, symmetry: true },
  { rows: 4, cols: 9, value: 1, schneider: false, symmetry: false },
  { rows: 5, cols: 5, value: 0, schneider: true, symmetry: false },
  { rows: 5, cols: 6, value: 2, schneider: false, symmetry: false },
  { rows: 5, cols: 7, value: 1, schneider: true, symmetry: false },
  { rows: 5, cols: 8, value: 1, schneider: false, symmetry: false },
  { rows: 5, cols: 9, value: 'W', schneider: false, symmetry: false },
  { rows: 6, cols: 6, value: 0, schneider: false, symmetry: true },
  { rows: 6, cols: 7, value: '>3', schneider: false, symmetry: false },
  { rows: 6, cols: 8, value: 0, schneider: false, symmetry: true },
  { rows: 6, cols: 9, value: 'W', schneider: false, symmetry: true },
  { rows: 7, cols: 7, value: 'W', schneider: false, symmetry: false },
  { rows: 7, cols: 8, value: 'W', schneider: false, symmetry: true },
];

export function paperValue(rows: number, cols: number): PaperCell | undefined {
  const [r, c] = rows <= cols ? [rows, cols] : [cols, rows];
  return PAPER.find((p) => p.rows === r && p.cols === c);
}

/** Does a computed nimber agree with a published entry? */
export function agrees(p: PaperValue, nimber: number): boolean {
  if (typeof p === 'number') return p === nimber;
  if (p === 'W') return nimber !== 0;
  return nimber > 3;
}
