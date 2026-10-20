import { describe, it, expect } from 'vitest';
import {
  Cram,
  CoupleSearch,
  PlainSearch,
  canonicalKey,
  components,
  emptyBoard,
  movesOf,
  play,
  type Shape,
} from './cram';
import { PAPER, agrees, paperValue } from './paper';
import table from './table.json';

/** Grundy value by the definition, on a plain cell list: no splitting, no symmetry, no shortcuts. */
function bruteGrundy(cells: Set<string>, memo = new Map<string, number>()): number {
  const key = [...cells].sort().join(' ');
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const seen = new Set<number>();
  for (const k of cells) {
    const [r, c] = k.split(',').map(Number);
    for (const n of [`${r},${c + 1}`, `${r + 1},${c}`])
      if (cells.has(n)) {
        const rest = new Set(cells);
        rest.delete(k);
        rest.delete(n);
        seen.add(bruteGrundy(rest, memo));
      }
  }
  let g = 0;
  while (seen.has(g)) g++;
  memo.set(key, g);
  return g;
}

function cellSet(rows: number[]): Set<string> {
  const s = new Set<string>();
  rows.forEach((x, r) => {
    for (let c = 0; c < 31; c++) if (x & (1 << c)) s.add(`${r},${c}`);
  });
  return s;
}

function shape(rows: number[]): Shape {
  return { rows, w: 32 - Math.clz32(rows.reduce((a, b) => a | b, 0)) };
}

/** Dawson's Kayles, octal 0.07: Grundy values of a row of n pins, n = 0, 1, 2, ... (period 34 from n = 52). */
function dawson(n: number): number {
  const g = [0];
  for (let k = 1; k <= n; k++) {
    const seen = new Set<number>();
    // remove two adjacent pins from a row of k: left part i, right part k - 2 - i
    for (let i = 0; i + 2 <= k; i++) seen.add(g[i] ^ g[k - 2 - i]);
    let v = 0;
    while (seen.has(v)) v++;
    g.push(v);
  }
  return g[n];
}

describe('regions and shapes', () => {
  it('splits a board into its connected regions and drops single cells', () => {
    // 0b0111 / 0b0000 / 0b1101: one row of 3, one pair, one single cell
    const parts = components([0b0111, 0b0000, 0b1101]);
    expect(parts.map((p) => p.rows.reduce((n, x) => n + x.toString(2).replace(/0/g, '').length, 0)).sort()).toEqual([2, 3]);
  });

  it('gives all eight symmetric copies of a shape one key, and different shapes different keys', () => {
    const L = shape([0b111, 0b001]);
    const copies = [
      [0b111, 0b001],
      [0b111, 0b100],
      [0b001, 0b111],
      [0b100, 0b111],
      [0b11, 0b01, 0b01],
      [0b11, 0b10, 0b10],
      [0b01, 0b01, 0b11],
      [0b10, 0b10, 0b11],
    ];
    for (const c of copies) expect(canonicalKey(shape(c))).toBe(canonicalKey(L));
    expect(canonicalKey(shape([0b111, 0b010]))).not.toBe(canonicalKey(L));
    expect(canonicalKey(shape([0b1111]))).not.toBe(canonicalKey(L));
  });

  it('lists every domino placement once', () => {
    // m × n board: m(n-1) horizontal + (m-1)n vertical
    expect(movesOf(emptyBoard(3, 4))).toHaveLength(3 * 3 + 2 * 4);
    expect(play(emptyBoard(2, 2), { r: 0, c: 0, dir: 'v' })).toEqual([0b10, 0b10]);
  });
});

describe('nimbers', () => {
  it('match the bare definition (no splitting, no symmetry) on every board up to 12 cells', () => {
    const g = new Cram();
    for (let r = 1; r <= 4; r++)
      for (let c = 1; r * c <= 12; c++) expect(g.boardNimber(r, c), `${r}x${c}`).toBe(bruteGrundy(cellSet(emptyBoard(r, c))));
  });

  it('match the bare definition on 300 random shapes of up to 14 cells', () => {
    const g = new Cram();
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
    for (let t = 0; t < 300; t++) {
      const rows = Array.from({ length: 4 }, () => Math.floor(rand() * 16));
      if (cellSet(rows).size > 14) continue;
      expect(g.value(rows)).toBe(bruteGrundy(cellSet(rows)));
    }
  });

  it('1 × n Cram is Dawson\'s Kayles (octal 0.07), n = 1..30', () => {
    const g = new Cram();
    // a row of n cells is Dawson's Kayles on n pins
    for (let n = 1; n <= 30; n++) expect(g.boardNimber(1, n), `1x${n}`).toBe(dawson(n));
  });

  it('even × even boards are *0 and even × odd boards are not (the symmetry strategy)', () => {
    const g = new Cram();
    for (const [r, c] of [[2, 2], [2, 4], [2, 6], [2, 8], [4, 4], [4, 6], [2, 3], [2, 5], [2, 7], [4, 3], [4, 5], [6, 3]] as const) {
      const v = g.boardNimber(r, c);
      if (c % 2 === 0) expect(v, `${r}x${c}`).toBe(0);
      else expect(v, `${r}x${c}`).not.toBe(0);
    }
  });

  it('2 × n is *0 for even n and *1 for odd n, n = 1..16 (observed, not proved)', () => {
    const g = new Cram();
    for (let n = 1; n <= 16; n++) expect(g.boardNimber(2, n), `2x${n}`).toBe(n % 2);
  });

  it('a move wins exactly when it leaves a position worth *0', () => {
    // 4 × 7 after four moves: regions *5, *2, *0 (the screenshot); the winning moves turn the *5 region into *2
    const g = new Cram();
    let free = emptyBoard(4, 7);
    for (const m of [
      { r: 2, c: 4, dir: 'v' },
      { r: 1, c: 5, dir: 'h' },
      { r: 0, c: 3, dir: 'v' },
      { r: 0, c: 1, dir: 'v' },
    ] as const)
      free = play(free, m);
    expect(components(free).map((s) => g.shapeNimber(s)).sort()).toEqual([0, 2, 5]);
    expect(g.value(free)).toBe(7);
    const winning = movesOf(free).filter((m) => g.value(play(free, m)) === 0);
    expect(movesOf(free)).toHaveLength(21);
    expect(winning).toHaveLength(2);
    for (const m of winning) expect(new PlainSearch().wins(play(free, m))).toBe(false);
  });

  it('the couple search and the plain win/loss search agree with the full mex', () => {
    for (const [r, c] of [[3, 3], [3, 5], [3, 6], [4, 4], [4, 5], [3, 7], [2, 9]] as const) {
      const v = new Cram().boardNimber(r, c);
      expect(new CoupleSearch().nimber(shape(emptyBoard(r, c))), `${r}x${c}`).toBe(v);
      expect(new CoupleSearch().wins(emptyBoard(r, c))).toBe(v !== 0);
      expect(new PlainSearch().wins(emptyBoard(r, c))).toBe(v !== 0);
    }
  });

  it('reproduces the published values that fit in a test: 3 × 3 … 3 × 8, 4 × 4, 4 × 5, 5 × 5', () => {
    const g = new Cram();
    for (const [r, c] of [[3, 3], [3, 4], [3, 5], [3, 6], [3, 7], [3, 8], [4, 4], [4, 5], [5, 5]] as const)
      expect(g.boardNimber(r, c), `${r}x${c}`).toBe(paperValue(r, c)!.value);
  });
});

describe('the published table and the computed chart', () => {
  it('transcribes the paper: 16 values on 3 × n, 17 on the larger boards (7 × 9 is blank)', () => {
    expect(PAPER.filter((p) => p.rows === 3)).toHaveLength(16);
    expect(PAPER.filter((p) => p.rows > 3)).toHaveLength(17);
    // the symmetry strategy: every even × even entry is 0
    for (const p of PAPER) if (p.rows % 2 === 0 && p.cols % 2 === 0) expect(p.value).toBe(0);
  });

  it('every board computed here that is in the paper agrees with it', () => {
    const cells = table.cells.filter((c) => c.paper !== null && (c.nimber !== null || c.firstWins !== null));
    expect(cells.length).toBeGreaterThanOrEqual(17);
    for (const c of cells) expect(c.agrees, `${c.rows}x${c.cols}`).toBe(true);
    for (const c of table.cells) if (c.nimber !== null && c.paper !== null) {
      const p = paperValue(c.rows, c.cols)!;
      expect(agrees(p.value, c.nimber)).toBe(true);
    }
  });

  it('every computed board obeys the symmetry strategy', () => {
    for (const c of table.cells) {
      if (c.nimber === null || c.rows < 2) continue;
      if (c.rows % 2 === 0 && c.cols % 2 === 0) expect(c.nimber, `${c.rows}x${c.cols}`).toBe(0);
      if ((c.rows + c.cols) % 2 === 1) expect(c.nimber, `${c.rows}x${c.cols}`).not.toBe(0);
    }
  });
});
