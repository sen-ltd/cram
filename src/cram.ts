// Cram: two players take turns covering two adjacent free cells (either
// direction, both players alike); whoever cannot move loses (normal play).
//
// Cram is impartial, and a position falls apart into independent regions once
// the dominoes wall them off. So the value of a position is the XOR of the
// nimbers of its regions, and a region's nimber is the mex of the values of its
// options (Sprague–Grundy). The memo is keyed by region *shape* up to the eight
// symmetries of the square, so every board shares one table.
//
// A region is stored as the rows of its bounding box, one bitmask per row
// (bit c = column c). Single cells are dropped as soon as they are cut off:
// nobody can ever cover them.

export interface Shape {
  /** one bitmask per row of the bounding box; bit c = column c */
  rows: number[];
  /** width of the bounding box */
  w: number;
  /** where the bounding box sits in the set of cells it was cut from */
  top?: number;
  left?: number;
}

export interface Move {
  /** row and column of the first cell; the second is to the right (h) or below (v) */
  r: number;
  c: number;
  dir: 'h' | 'v';
}

export class BudgetExceeded extends Error {
  constructor() {
    super('node budget exceeded');
  }
}

export function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function cells(rows: readonly number[]): number {
  let n = 0;
  for (const x of rows) n += popcount(x);
  return n;
}

/**
 * Split a set of free cells (rows of bitmasks) into its connected regions of
 * two or more cells, each cut down to its own bounding box.
 */
export function components(rows: readonly number[]): Shape[] {
  const left = rows.slice();
  const out: Shape[] = [];
  const h = rows.length;
  for (let r0 = 0; r0 < h; r0++) {
    while (left[r0] !== 0) {
      const comp = new Array<number>(h).fill(0);
      comp[r0] = left[r0] & -left[r0];
      let lo = r0;
      let hi = r0;
      let grew = true;
      while (grew) {
        grew = false;
        for (let r = Math.max(0, lo - 1); r <= Math.min(h - 1, hi + 1); r++) {
          const x = comp[r];
          let y = x | (x << 1) | (x >>> 1);
          if (r > 0) y |= comp[r - 1];
          if (r < h - 1) y |= comp[r + 1];
          y &= left[r];
          if (y !== x) {
            // spread along the row to the end of each run in one go
            let z = y;
            for (;;) {
              const z2 = (z | (z << 1) | (z >>> 1)) & left[r];
              if (z2 === z) break;
              z = z2;
            }
            comp[r] = z;
            grew = true;
            if (r < lo) lo = r;
            if (r > hi) hi = r;
          }
        }
      }
      let all = 0;
      let n = 0;
      for (let r = lo; r <= hi; r++) {
        left[r] &= ~comp[r];
        all |= comp[r];
        n += popcount(comp[r]);
      }
      if (n < 2) continue;
      const shift = 31 - Math.clz32(all & -all);
      const w = 32 - Math.clz32(all >>> shift);
      const out1: number[] = [];
      for (let r = lo; r <= hi; r++) out1.push(comp[r] >>> shift);
      out.push({ rows: out1, w, top: lo, left: shift });
    }
  }
  return out;
}

function rev32(x: number): number {
  x = ((x >>> 1) & 0x55555555) | ((x & 0x55555555) << 1);
  x = ((x >>> 2) & 0x33333333) | ((x & 0x33333333) << 2);
  x = ((x >>> 4) & 0x0f0f0f0f) | ((x & 0x0f0f0f0f) << 4);
  x = ((x >>> 8) & 0x00ff00ff) | ((x & 0x00ff00ff) << 8);
  return ((x >>> 16) | (x << 16)) >>> 0;
}

function transpose(rows: readonly number[], w: number): number[] {
  const out = new Array<number>(w).fill(0);
  for (let r = 0; r < rows.length; r++) {
    let x = rows[r];
    while (x !== 0) {
      const b = x & -x;
      x ^= b;
      out[31 - Math.clz32(b)] |= 1 << r;
    }
  }
  return out;
}

/** Smallest of the 4 mirror images of a row list (identity, flip rows, mirror columns, both). */
function bestMirror(rows: readonly number[], w: number, best: number[] | null): number[] {
  const m = rows.map((x) => rev32(x) >>> (32 - w));
  const cands = [rows, rows.slice().reverse(), m, m.slice().reverse()];
  for (const c of cands) if (best === null || less(c, best)) best = c as number[];
  return best!;
}

/**
 * Key of a shape that is the same for all 8 of its symmetric copies: the
 * smallest row list among the orientations with no more rows than columns.
 */
export function canonicalKey(s: Shape): string {
  const h = s.rows.length;
  const w = s.w;
  let best: number[] | null = null;
  if (h <= w) best = bestMirror(s.rows, w, best);
  if (h >= w) best = bestMirror(transpose(s.rows, w), h, best);
  return best!.join(',');
}

function less(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return a.length < b.length;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/** Every legal move on a set of free cells. */
export function movesOf(rows: readonly number[]): Move[] {
  const out: Move[] = [];
  for (let r = 0; r < rows.length; r++) {
    let x = rows[r] & (rows[r] >>> 1);
    while (x !== 0) {
      const b = x & -x;
      x ^= b;
      out.push({ r, c: 31 - Math.clz32(b), dir: 'h' });
    }
    if (r + 1 < rows.length) {
      let y = rows[r] & rows[r + 1];
      while (y !== 0) {
        const b = y & -y;
        y ^= b;
        out.push({ r, c: 31 - Math.clz32(b), dir: 'v' });
      }
    }
  }
  return out;
}

export function play(rows: readonly number[], m: Move): number[] {
  const out = rows.slice();
  if (m.dir === 'h') out[m.r] &= ~(3 << m.c);
  else {
    out[m.r] &= ~(1 << m.c);
    out[m.r + 1] &= ~(1 << m.c);
  }
  return out;
}

/** Full board of rows × cols, all free. */
export function emptyBoard(rows: number, cols: number): number[] {
  if (cols < 1 || cols > 30 || rows < 1) throw new Error('board sides must be 1..30');
  return new Array<number>(rows).fill(2 ** cols - 1);
}

/**
 * String-keyed table split over several Maps: one Map tops out near 2^24
 * entries, and the 3 × n boards need more than that.
 */
export class ShapeTable {
  private readonly shards: Map<string, number>[] = Array.from({ length: 16 }, () => new Map());

  private shard(key: string): Map<string, number> {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return this.shards[h & 15];
  }

  get(key: string): number | undefined {
    return this.shard(key).get(key);
  }

  set(key: string, v: number): void {
    this.shard(key).set(key, v);
  }

  get size(): number {
    let n = 0;
    for (const m of this.shards) n += m.size;
    return n;
  }

  *entries(): IterableIterator<[string, number]> {
    for (const m of this.shards) yield* m.entries();
  }
}

export class Cram {
  /** canonical shape key -> nimber */
  readonly memo = new ShapeTable();
  /** nimber evaluations that missed the memo (= distinct shapes solved) */
  nodes = 0;
  /** memo lookups that hit */
  hits = 0;
  budget = Infinity;
  /** performance.now() after which the search gives up (checked every 4096 shapes) */
  deadline = Infinity;

  /** Nimber of one connected region. */
  shapeNimber(s: Shape): number {
    const n = cells(s.rows);
    if (n < 2) return 0;
    if (n <= 3) return 1; // any move leaves at most one cell
    const key = canonicalKey(s);
    const known = this.memo.get(key);
    if (known !== undefined) {
      this.hits++;
      return known;
    }
    if (++this.nodes > this.budget) throw new BudgetExceeded();
    if ((this.nodes & 4095) === 0 && performance.now() > this.deadline) throw new BudgetExceeded();
    const seen: boolean[] = [];
    for (const m of movesOf(s.rows)) seen[this.value(play(s.rows, m))] = true;
    let g = 0;
    while (seen[g]) g++;
    this.memo.set(key, g);
    return g;
  }

  /** Nimber of any set of free cells: the XOR over its regions. */
  value(rows: readonly number[]): number {
    let v = 0;
    for (const s of components(rows)) v ^= this.shapeNimber(s);
    return v;
  }

  /** Nimber of the empty rows × cols board. */
  boardNimber(rows: number, cols: number): number {
    return this.value(emptyBoard(rows, cols));
  }
}

/**
 * The control: win/loss of the whole position without nimbers. The memo key is
 * the multiset of region shapes, so a sum of regions is stored as one entry and
 * every different combination of regions is a new search.
 */
export class PlainSearch {
  readonly memo = new ShapeTable();
  nodes = 0;
  budget = Infinity;
  deadline = Infinity;

  /** true if the player to move wins on this set of free cells */
  wins(rows: readonly number[]): boolean {
    return this.winsSum(components(rows).filter((s) => cells(s.rows) >= 2));
  }

  private winsSum(parts: Shape[]): boolean {
    if (parts.length === 0) return false;
    const key = parts
      .map((s) => canonicalKey(s))
      .sort()
      .join('|');
    const known = this.memo.get(key);
    if (known !== undefined) return known === 1;
    if (++this.nodes > this.budget) throw new BudgetExceeded();
    if ((this.nodes & 4095) === 0 && performance.now() > this.deadline) throw new BudgetExceeded();
    let win = false;
    for (let i = 0; i < parts.length && !win; i++) {
      const rest = parts.slice(0, i).concat(parts.slice(i + 1));
      for (const m of movesOf(parts[i].rows)) {
        if (!this.winsSum(rest.concat(components(play(parts[i].rows, m))))) {
          win = true;
          break;
        }
      }
    }
    this.memo.set(key, win ? 1 : 0);
    return win;
  }
}

/**
 * Lemoine and Viennot's way: never run a full mex. "Is the nimber of P equal to
 * n?" is the same question as "does the player to move lose P + *n?", and that
 * is a win/loss search that stops at the first winning move. A sum of several
 * regions folds every region whose nimber is already known into the heap; if
 * two or more unknown regions remain, the smaller ones get their nimbers
 * computed (n = 0, 1, 2, ... until a losing couple turns up), and only the
 * largest one is searched as a couple.
 */
export class CoupleSearch {
  /** canonical shape key -> nimber, for the shapes whose nimber was settled */
  readonly nim = new ShapeTable();
  /** "key#n" -> 1 if the player to move wins shape + *n, 0 if they lose */
  readonly couples = new ShapeTable();
  nodes = 0;
  budget = Infinity;
  deadline = Infinity;

  nimber(s: Shape): number {
    const n = cells(s.rows);
    if (n < 2) return 0;
    if (n <= 3) return 1;
    const key = canonicalKey(s);
    const known = this.nim.get(key);
    if (known !== undefined) return known;
    for (let j = 0; ; j++) if (!this.winsCouple(s, key, j)) return j;
  }

  /** true if the player to move wins this set of free cells */
  wins(rows: readonly number[]): boolean {
    return this.winsSum(components(rows), 0);
  }

  winsSum(parts: Shape[], heap: number): boolean {
    const unknown: { s: Shape; key: string; n: number }[] = [];
    for (const s of parts) {
      const n = cells(s.rows);
      if (n < 2) continue;
      if (n <= 3) {
        heap ^= 1;
        continue;
      }
      const key = canonicalKey(s);
      const v = this.nim.get(key);
      if (v !== undefined) heap ^= v;
      else unknown.push({ s, key, n });
    }
    if (unknown.length === 0) return heap !== 0;
    unknown.sort((a, b) => a.n - b.n);
    for (let i = 0; i < unknown.length - 1; i++) heap ^= this.nimber(unknown[i].s);
    const last = unknown[unknown.length - 1];
    return this.winsCouple(last.s, last.key, heap);
  }

  private winsCouple(s: Shape, key: string, heap: number): boolean {
    const v = this.nim.get(key);
    if (v !== undefined) return v !== heap;
    const ck = key + '#' + heap;
    const known = this.couples.get(ck);
    if (known !== undefined) return known === 1;
    if (++this.nodes > this.budget) throw new BudgetExceeded();
    if ((this.nodes & 4095) === 0 && performance.now() > this.deadline) throw new BudgetExceeded();
    let win = false;
    // taking from the heap: *heap -> *m wins iff the nimber of s is m
    for (let m = 0; m < heap && !win; m++) if (!this.winsCouple(s, key, m)) win = true;
    if (!win)
      for (const mv of movesOf(s.rows))
        if (!this.winsSum(components(play(s.rows, mv)), heap)) {
          win = true;
          break;
        }
    this.couples.set(ck, win ? 1 : 0);
    if (!win) this.nim.set(key, heap);
    return win;
  }
}
