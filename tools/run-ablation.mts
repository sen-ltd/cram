// The control experiment: solve each empty board three ways, each with a fresh
// table: full mex (Cram), win/loss without nimbers (PlainSearch, the memo is
// keyed by the whole sum), and win/loss by the couple search (CoupleSearch).
// Records how many distinct entries each one had to solve.
// Usage: node tools/run-ablation.mts <out.jsonl> <minutesPerBoard> <r>x<c> ...
import { appendFileSync } from 'node:fs';
import { Cram, PlainSearch, CoupleSearch, BudgetExceeded, emptyBoard } from '../src/cram.ts';

const [outFile, minutes, ...boards] = process.argv.slice(2);
for (const b of boards) {
  const [rows, cols] = b.split('x').map(Number);
  const g = new Cram();
  let t = performance.now();
  const nimber = g.boardNimber(rows, cols);
  const nimSeconds = (performance.now() - t) / 1000;
  const p = new PlainSearch();
  t = performance.now();
  p.deadline = t + Number(minutes) * 60_000;
  let plainWins: boolean | null = null;
  try {
    plainWins = p.wins(emptyBoard(rows, cols));
  } catch (e) {
    if (!(e instanceof BudgetExceeded)) throw e;
  }
  const plainSeconds = (performance.now() - t) / 1000;
  const cs = new CoupleSearch();
  t = performance.now();
  const coupleWins = cs.wins(emptyBoard(rows, cols));
  const coupleSeconds = (performance.now() - t) / 1000;
  const line = {
    rows,
    cols,
    nimber,
    nimberShapes: g.nodes,
    nimberSeconds: +nimSeconds.toFixed(2),
    plainWins,
    plainTimedOut: plainWins === null,
    plainPositions: p.nodes,
    plainSeconds: +plainSeconds.toFixed(2),
    coupleWins,
    coupleEntries: cs.nodes,
    coupleSeconds: +coupleSeconds.toFixed(2),
  };
  appendFileSync(outFile, JSON.stringify(line) + '\n');
  if (plainWins === null) break;
}
