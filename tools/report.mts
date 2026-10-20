// Print the result tables (markdown) from src/table.json, for the README and
// the articles: the 3 × n row, the larger boards, 2 × n, and the three-way
// comparison of entries solved per method. (The per-family runs share one
// table per process, so their entry counts are increments; only the ablation
// counts compare methods.)
import { readFileSync } from 'node:fs';

const t = JSON.parse(readFileSync(new URL('../src/table.json', import.meta.url), 'utf8'));
type Cell = { rows: number; cols: number; nimber: number | null; firstWins: boolean | null; paper: string | null; agrees: boolean | null; seconds: Record<string, number>; entries: Record<string, number> };
const cells: Cell[] = t.cells;
const show = (c: Cell | undefined) => (!c ? '—' : c.nimber !== null ? `*${c.nimber}` : c.firstWins === null ? '—' : c.firstWins ? 'W' : '*0');
const paper = (c: Cell | undefined) => (c?.paper == null ? '' : /^\d+$/.test(c.paper) ? `*${c.paper}` : c.paper);
const get = (r: number, c: number) => cells.find((x) => x.rows === r && x.cols === c);
const fmt = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('en-US'));

console.log('### 3 × n\n');
console.log('| n | here | paper |');
console.log('|---|---|---|');
for (let n = 3; n <= 18; n++) {
  const c = get(3, n);
  console.log(`| ${n} | ${show(c)} | ${paper(c)} |`);
}
console.log('\n### m × n, m ≥ 4\n');
console.log('| board | here | paper |');
console.log('|---|---|---|');
for (const c of cells.filter((c) => c.rows >= 4)) console.log(`| ${c.rows} × ${c.cols} | ${show(c)} | ${paper(c)} |`);
console.log('\n### 2 × n\n');
// 2 × 1 is stored as 1 × 2
const two = [get(1, 2), ...cells.filter((c) => c.rows === 2)].filter((c) => c && c.nimber !== null) as Cell[];
console.log(`n = 1..${two.length}: ` + two.map((c) => c.nimber).join(' '));
console.log('\n### three methods, fresh table per board (entries solved)\n');
console.log('| board | nimber | full mex | no nimbers (whole sums) | couple search (win/loss) |');
console.log('|---|---|---|---|---|');
for (const a of t.ablation)
  console.log(`| ${a.rows} × ${a.cols} | *${a.nimber} | ${fmt(a.nimberShapes)} | ${a.plainTimedOut ? `> ${fmt(a.plainPositions)} (cut)` : fmt(a.plainPositions)} | ${fmt(a.coupleEntries)} |`);
const ok = cells.filter((c) => c.agrees === true).length;
const bad = cells.filter((c) => c.agrees === false).length;
console.log(`\nagree with the paper: ${ok}, disagree: ${bad}`);
