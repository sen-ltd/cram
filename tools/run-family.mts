// Solve a list of empty boards in order with one shared shape table, appending
// one JSON line per board to an output file as soon as it is done (so a killed
// run keeps what it has). Stops at the wall-clock limit.
// Usage: node tools/run-family.mts <out.jsonl> <minutes> <method> <r>x<c> [<r>x<c> ...]
// method: mex (full mex, every option of every shape), couple (nimber by the
// couple search), couple-wins (win/loss only, by the couple search).
import { appendFileSync } from 'node:fs';
import { Cram, CoupleSearch, BudgetExceeded, emptyBoard } from '../src/cram.ts';

const [outFile, minutes, method, ...boards] = process.argv.slice(2);
const mex = new Cram();
const cs = new CoupleSearch();
const t0 = performance.now();
mex.deadline = cs.deadline = t0 + Number(minutes) * 60_000;
const g = method === 'mex' ? mex : cs;
const solve = (rows: number, cols: number): number | boolean =>
  method === 'mex'
    ? mex.boardNimber(rows, cols)
    : method === 'couple'
      ? cs.nimber({ rows: emptyBoard(rows, cols), w: cols })
      : cs.wins(emptyBoard(rows, cols));
for (const b of boards) {
  const [rows, cols] = b.split('x').map(Number);
  const tb = performance.now();
  const before = g.nodes;
  let nimber: number | boolean | null = null;
  try {
    nimber = solve(rows, cols);
  } catch (e) {
    if (!(e instanceof BudgetExceeded)) throw e;
  }
  const line = {
    method,
    rows,
    cols,
    ...(typeof nimber === 'boolean' ? { firstWins: nimber } : { nimber }),
    timedOut: nimber === null,
    newShapes: g.nodes - before,
    tableSize: method === 'mex' ? mex.memo.size : cs.couples.size,
    seconds: +((performance.now() - tb) / 1000).toFixed(2),
  };
  appendFileSync(outFile, JSON.stringify(line) + '\n');
  if (nimber === null) break;
}
