// Merge the run logs (runs/*.jsonl) into src/table.json: one cell per m × n
// board (m ≤ n) with its nimber (or only who wins, where only the win/loss
// search finished), the time each method took, and the published value.
// Refuses to write anything if two methods disagree on a board.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { paperValue, agrees, PAPER } from '../src/paper.ts';

const dir = new URL('../runs/', import.meta.url);
interface Line {
  method?: string;
  rows: number;
  cols: number;
  nimber?: number | null;
  firstWins?: boolean;
  timedOut: boolean;
  newShapes: number;
  seconds: number;
}
interface Cell {
  rows: number;
  cols: number;
  nimber: number | null;
  firstWins: boolean | null;
  paper: string | null;
  agrees: boolean | null;
  seconds: Record<string, number>;
  entries: Record<string, number>;
}
const cells = new Map<string, Cell>();
for (const f of readdirSync(dir).filter((f) => /^(family|couple)-.*\.jsonl$/.test(f)).sort()) {
  for (const raw of readFileSync(new URL(f, dir), 'utf8').split('\n').filter(Boolean)) {
    const l: Line = JSON.parse(raw);
    if (l.timedOut) continue;
    const method = l.method ?? 'mex';
    const [rows, cols] = l.rows <= l.cols ? [l.rows, l.cols] : [l.cols, l.rows];
    const key = `${rows}x${cols}`;
    const p = paperValue(rows, cols);
    const c: Cell = cells.get(key) ?? {
      rows,
      cols,
      nimber: null,
      firstWins: null,
      paper: p ? String(p.value) : null,
      agrees: null,
      seconds: {},
      entries: {},
    };
    if (typeof l.nimber === 'number') {
      if (c.nimber !== null && c.nimber !== l.nimber) throw new Error(`${key}: ${method} says *${l.nimber}, another run *${c.nimber}`);
      c.nimber = l.nimber;
    }
    const wins = typeof l.nimber === 'number' ? l.nimber !== 0 : l.firstWins!;
    if (c.firstWins !== null && c.firstWins !== wins) throw new Error(`${key}: runs disagree on who wins`);
    c.firstWins = wins;
    c.seconds[method] = l.seconds;
    c.entries[method] = l.newShapes;
    cells.set(key, c);
  }
}
for (const c of cells.values()) {
  const p = paperValue(c.rows, c.cols);
  if (!p) continue;
  if (c.nimber !== null) c.agrees = agrees(p.value, c.nimber);
  // only who wins is known: it has to match whether the published value is *0
  else if (c.firstWins !== null) c.agrees = c.firstWins === (p.value !== 0);
}
// the published cells nobody here finished, so the chart can still show them
for (const p of PAPER) {
  const key = `${p.rows}x${p.cols}`;
  if (!cells.has(key))
    cells.set(key, { rows: p.rows, cols: p.cols, nimber: null, firstWins: null, paper: String(p.value), agrees: null, seconds: {}, entries: {} });
}
const out = [...cells.values()].sort((a, b) => a.rows - b.rows || a.cols - b.cols);
const ablation = readFileSync(new URL('ablation.jsonl', dir), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));
writeFileSync(new URL('../src/table.json', import.meta.url), JSON.stringify({ cells: out, ablation }, null, 1) + '\n');
const bad = out.filter((c) => c.agrees === false);
console.log(
  `${out.filter((c) => c.nimber !== null).length} nimbers, ${out.filter((c) => c.agrees).length} agree with the paper, ${bad.length} disagree${bad.length ? ': ' + bad.map((c) => `${c.rows}x${c.cols}`).join(' ') : ''}`,
);
