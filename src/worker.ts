// Web Worker: split the position into regions, take each region's nimber, and
// value every legal move as the XOR of the position it leaves. One Cram table
// lives for the whole page, so later positions mostly hit shapes already solved.
import { Cram, components, movesOf, play, type Move } from './cram';

export interface Request {
  id: number;
  /** free cells, one bitmask per row */
  free: number[];
}

export interface Region {
  /** cells as [row, col] on the board */
  cells: [number, number][];
  nimber: number;
}

export type Reply =
  | { id: number; type: 'progress'; shapes: number }
  | {
      id: number;
      type: 'done';
      regions: Region[];
      total: number;
      moves: (Move & { value: number })[];
      newShapes: number;
      tableSize: number;
      ms: number;
    };

const g = new Cram();

self.onmessage = (ev: MessageEvent<Request>) => {
  const { id, free } = ev.data;
  const t0 = performance.now();
  const before = g.nodes;
  const post = (r: Reply) => (self as unknown as Worker).postMessage(r);
  const regions: Region[] = [];
  let total = 0;
  for (const s of components(free)) {
    const nimber = g.shapeNimber(s);
    total ^= nimber;
    const cells: [number, number][] = [];
    s.rows.forEach((x, i) => {
      for (let c = 0; c < s.w; c++) if (x & (1 << c)) cells.push([i + s.top!, c + s.left!]);
    });
    regions.push({ cells, nimber });
    post({ id, type: 'progress', shapes: g.nodes - before });
  }
  const moves = movesOf(free).map((m) => ({ ...m, value: g.value(play(free, m)) }));
  post({ id, type: 'done', regions, total, moves, newShapes: g.nodes - before, tableSize: g.memo.size, ms: performance.now() - t0 });
};
