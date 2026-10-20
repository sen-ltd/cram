import './style.css';
import { emptyBoard, movesOf, play as playMove, type Move } from './cram';
import type { Request, Reply, Region } from './worker';
import table from './table.json';

const MAX_CELLS = 28;
const CELL = 64;
// region tints, picked in order of the region's first cell
const TINTS = ['#2f4a5c', '#4d3b5e', '#2f5a45', '#5c4a2c', '#5a2f3a', '#3a4f2a', '#2a4f55', '#55402a'];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = $<HTMLElement>('board') as unknown as SVGSVGElement;
const statusEl = $('status');
const rowsSel = $<HTMLSelectElement>('rowsSel');
const colsSel = $<HTMLSelectElement>('colsSel');
const firstSel = $<HTMLSelectElement>('firstSel');
const hintsBox = $<HTMLInputElement>('hints');

interface Played extends Move {
  byYou: boolean;
}

interface Analysis {
  regions: Region[];
  total: number;
  moves: (Move & { value: number })[];
  newShapes: number;
  tableSize: number;
  ms: number;
}

const params = new URLSearchParams(location.search);
let rows = clamp(Number(params.get('r') ?? 4), 1, 6, 4);
let cols = clamp(Number(params.get('c') ?? 5), 2, 10, 5);
if (rows * cols > MAX_CELLS) [rows, cols] = [4, 5];
let youFirst = params.get('first') !== 'cpu';
let free = emptyBoard(rows, cols);
let played: Played[] = [];
let analysis: Analysis | null = null;
let progress = 0;
let requestId = 0;
let hover: Move | null = null;
let worker = makeWorker();

function clamp(n: number, lo: number, hi: number, dflt: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
}

function makeWorker(): Worker {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (ev: MessageEvent<Reply>) => onReply(ev.data);
  return w;
}

function yourTurn(): boolean {
  return played.length % 2 === (youFirst ? 0 : 1);
}

function same(a: Move, b: Move): boolean {
  return a.r === b.r && a.c === b.c && a.dir === b.dir;
}

function newGame(moves: Move[] = []): void {
  free = emptyBoard(rows, cols);
  played = [];
  for (const m of moves) {
    if (!movesOf(free).some((x) => same(x, m))) break;
    played.push({ ...m, byYou: yourTurn() });
    free = playMove(free, m);
  }
  startAnalysis(false);
}

function startAnalysis(restart: boolean): void {
  // the worker keeps its table between positions; only restart it if a search is still running
  if (restart && analysis === null) {
    worker.terminate();
    worker = makeWorker();
  }
  requestId++;
  analysis = null;
  progress = 0;
  render();
  const req: Request = { id: requestId, free };
  worker.postMessage(req);
}

function onReply(msg: Reply): void {
  if (msg.id !== requestId) return;
  if (msg.type === 'progress') {
    progress = msg.shapes;
    renderStatus();
    return;
  }
  analysis = msg;
  render();
  if (!yourTurn() && analysis.moves.length > 0) setTimeout(computerMove, 400);
}

function computerMove(): void {
  if (yourTurn() || !analysis || analysis.moves.length === 0) return;
  const winning = analysis.moves.filter((m) => m.value === 0);
  const pool = winning.length ? winning : analysis.moves;
  play(pool[Math.floor(Math.random() * pool.length)]);
}

function play(m: Move): void {
  played.push({ r: m.r, c: m.c, dir: m.dir, byYou: yourTurn() });
  free = playMove(free, m);
  hover = null;
  syncUrl();
  startAnalysis(true);
}

function undo(): void {
  // take back to the last position where it is your turn
  if (played.length === 0) return;
  const moves: Move[] = played.slice(0, -1);
  if (moves.length > 0 && moves.length % 2 !== (youFirst ? 0 : 1)) moves.pop();
  newGame(moves);
  syncUrl();
}

function syncUrl(): void {
  const q = new URLSearchParams({ r: String(rows), c: String(cols), first: youFirst ? 'you' : 'cpu' });
  if (played.length) q.set('moves', played.map((m) => `${m.r}.${m.c}${m.dir}`).join(','));
  if (!hintsBox.checked) q.set('hints', '0');
  history.replaceState(null, '', `?${q}`);
}

// ---------- rendering ----------

const NS = 'http://www.w3.org/2000/svg';
function el(tag: string, attrs: Record<string, string | number>, parent: Element = svg): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

function dominoRect(m: Move, cls: string, inset = 5): SVGElement {
  const w = m.dir === 'h' ? 2 : 1;
  const h = m.dir === 'v' ? 2 : 1;
  return el('rect', {
    x: m.c * CELL + inset,
    y: m.r * CELL + inset,
    width: w * CELL - 2 * inset,
    height: h * CELL - 2 * inset,
    rx: 10,
    class: cls,
  });
}

function regionOf(): Map<number, number> {
  const at = new Map<number, number>();
  analysis?.regions.forEach((reg, i) => reg.cells.forEach(([r, c]) => at.set(r * cols + c, i)));
  return at;
}

function render(): void {
  svg.setAttribute('viewBox', `-8 -8 ${cols * CELL + 16} ${rows * CELL + 16}`);
  svg.replaceChildren();
  el('rect', { x: -6, y: -6, width: cols * CELL + 12, height: rows * CELL + 12, rx: 12, class: 'frame' });
  const at = regionOf();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const isFree = (free[r] & (1 << c)) !== 0;
      const reg = at.get(r * cols + c);
      el('rect', {
        x: c * CELL + 2,
        y: r * CELL + 2,
        width: CELL - 4,
        height: CELL - 4,
        rx: 6,
        class: isFree ? (reg === undefined ? 'cell dead' : 'cell') : 'cell gone',
        ...(reg !== undefined ? { style: `fill:${TINTS[reg % TINTS.length]}` } : {}),
      });
    }
  played.forEach((m, i) => dominoRect(m, `domino ${m.byYou ? 'you' : 'cpu'}${i === played.length - 1 ? ' last' : ''}`));
  // each region's nimber, on its first cell
  analysis?.regions.forEach((reg) => {
    const [r, c] = reg.cells[0];
    el('text', { x: c * CELL + 9, y: r * CELL + 22, class: 'nim' }).textContent = `*${reg.nimber}`;
  });
  if (yourTurn() && hover) dominoRect(hover, 'ghost');
  if (yourTurn() && hintsBox.checked && analysis)
    for (const m of analysis.moves) {
      const cx = m.c * CELL + (m.dir === 'h' ? CELL : CELL / 2);
      const cy = m.r * CELL + (m.dir === 'v' ? CELL : CELL / 2);
      el('circle', { cx, cy, r: 8, class: `mark ${m.value === 0 ? 'win' : 'lose'}` });
    }
  renderStatus();
  renderPosition();
}

function renderStatus(): void {
  statusEl.className = '';
  if (!analysis) {
    statusEl.textContent = `Solving the regions… ${progress ? `${progress.toLocaleString('en-US')} new shapes so far` : ''}`;
    return;
  }
  if (analysis.moves.length === 0) {
    const youLost = yourTurn();
    statusEl.textContent = youLost ? 'No domino fits anywhere — you lose.' : 'The computer cannot move — you win.';
    statusEl.className = youLost ? 'bad' : 'good';
    return;
  }
  if (!yourTurn()) {
    statusEl.textContent = 'Computer is moving…';
    return;
  }
  const won = analysis.moves.filter((m) => m.value === 0).length;
  if (won > 0) {
    statusEl.textContent = `Your move. The position is *${analysis.total}, not *0: ${won} of your ${analysis.moves.length} moves bring it to *0 and keep the win.`;
    statusEl.className = 'good';
  } else {
    statusEl.textContent = `Your move. The position is *0: every one of your ${analysis.moves.length} moves loses against perfect play.`;
    statusEl.className = 'bad';
  }
}

function renderPosition(): void {
  if (!analysis) {
    $('position').innerHTML = '<p class="fine">…</p>';
    return;
  }
  const a = analysis;
  const regs = a.regions
    .map(
      (reg, i) =>
        `<span class="chip" style="background:${TINTS[i % TINTS.length]}">${reg.cells.length} cells · *${reg.nimber}</span>`,
    )
    .join(' ');
  const xor = a.regions.length ? a.regions.map((r) => `*${r.nimber}`).join(' ⊕ ') + ` = *${a.total}` : '*0 (nothing left)';
  const won = a.moves.filter((m) => m.value === 0).length;
  $('position').innerHTML = `
    <dl>
      <dt>board</dt><dd>${rows} × ${cols}${chartLabel(rows, cols)}</dd>
      <dt>to move</dt><dd>${yourTurn() ? 'you' : 'computer'}</dd>
      <dt>regions</dt><dd>${regs || '—'}</dd>
      <dt>value</dt><dd>${xor}</dd>
      <dt>verdict</dt><dd>${a.total === 0 ? '<span class="lose-t">side to move loses</span>' : '<span class="win-t">side to move wins</span>'}</dd>
      <dt>moves</dt><dd><span class="win-t">${won} to *0</span> · <span class="lose-t">${a.moves.length - won} not</span></dd>
      <dt>work</dt><dd>${a.newShapes.toLocaleString('en-US')} new shapes, ${Math.round(a.ms)} ms (table: ${a.tableSize.toLocaleString('en-US')})</dd>
    </dl>
    <p class="fine">Cells that can no longer be covered (no free neighbour) are dropped and shown dark. Each tinted region is an
    independent game; its label is its nimber, and the whole position is worth the XOR.</p>`;
}

interface Cell {
  rows: number;
  cols: number;
  nimber: number | null;
  firstWins: boolean | null;
  paper: string | null;
  agrees: boolean | null;
}

function cellOf(r: number, c: number): Cell | undefined {
  const [a, b] = r <= c ? [r, c] : [c, r];
  return (table.cells as Cell[]).find((x) => x.rows === a && x.cols === b);
}

function chartLabel(r: number, c: number): string {
  const cell = cellOf(r, c);
  if (!cell || cell.nimber === null) return '';
  return ` <span class="fine">(empty board: *${cell.nimber})</span>`;
}

function renderChart(): void {
  const maxR = 7;
  const maxC = 18;
  let html = '<table class="chart"><tr><th>m\\n</th>';
  for (let c = 1; c <= maxC; c++) html += `<th>${c}</th>`;
  html += '</tr>';
  for (let r = 1; r <= maxR; r++) {
    html += `<tr><th>${r}</th>`;
    for (let c = 1; c <= maxC; c++) {
      if (c < r) {
        html += '<td class="out"></td>';
        continue;
      }
      const cell = cellOf(r, c);
      const pick = r * c <= MAX_CELLS && c <= 10 && r <= 6 ? ` data-r="${r}" data-c="${c}"` : '';
      const here = r === Math.min(rows, cols) && c === Math.max(rows, cols) ? ' here' : '';
      if (!cell || (cell.nimber === null && cell.firstWins === null)) {
        html += `<td class="open${pick ? ' pick' : ''}${here}" title="${r}×${c}: not computed here${cell?.paper != null ? ` — paper: ${cell.paper}` : ''}"${pick}>·</td>`;
        continue;
      }
      const shown = cell.nimber !== null ? String(cell.nimber) : cell.firstWins ? 'W' : '0';
      const paper = cell.paper != null ? ` — Lemoine–Viennot: ${cell.paper}${cell.agrees ? ' ✓' : ' ✗'}` : '';
      const cls = cell.nimber === 0 || cell.firstWins === false ? 'zero' : 'nz';
      html += `<td class="${cls}${cell.paper != null ? ' paper' : ''}${pick ? ' pick' : ''}${here}" title="${r}×${c}: *${shown}${paper}"${pick}>${shown}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  const withPaper = (table.cells as Cell[]).filter((c) => c.paper != null && c.agrees !== null);
  const ok = withPaper.filter((c) => c.agrees);
  html += `<p class="fine">Nimber of the empty m × n board (0 = second player wins). Underlined cells are in Lemoine and Viennot's 2010
    tables: ${ok.length} of ${withPaper.length} computed here agree. Click a board (≤ ${MAX_CELLS} cells) to play it.</p>`;
  $('chart').innerHTML = html;
}

// ---------- input ----------

function moveAt(ev: MouseEvent): Move | null {
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX;
  pt.y = ev.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
  const c = Math.floor(p.x / CELL);
  const r = Math.floor(p.y / CELL);
  if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
  const legal = movesOf(free);
  const fx = p.x / CELL - c - 0.5;
  const fy = p.y / CELL - r - 0.5;
  // the domino reaches toward the edge of the cell nearest the pointer, then the others
  const towards: [number, Move][] = [
    [fx, { r, c, dir: 'h' }],
    [-fx, { r, c: c - 1, dir: 'h' }],
    [fy, { r, c, dir: 'v' }],
    [-fy, { r: r - 1, c, dir: 'v' }],
  ];
  towards.sort((a, b) => b[0] - a[0]);
  for (const [, m] of towards) if (legal.some((x) => same(x, m))) return m;
  return null;
}

svg.addEventListener('mousemove', (ev) => {
  if (!yourTurn()) return;
  const m = moveAt(ev);
  if (!(m && hover && same(m, hover)) && (m || hover)) {
    hover = m;
    render();
  }
});
svg.addEventListener('mouseleave', () => {
  hover = null;
  render();
});
svg.addEventListener('click', (ev) => {
  if (!yourTurn() || !analysis) return;
  const m = moveAt(ev);
  if (m) play(m);
});

function fillSelect(sel: HTMLSelectElement, lo: number, hi: number, value: number): void {
  sel.innerHTML = '';
  for (let k = lo; k <= hi; k++) sel.add(new Option(String(k), String(k), false, k === value));
}

function fillSizes(): void {
  fillSelect(rowsSel, 1, 6, rows);
  fillSelect(colsSel, 2, 10, cols);
}

function applySize(r: number, c: number): void {
  if (r * c > MAX_CELLS) {
    statusEl.textContent = `${r} × ${c} has ${r * c} cells; the in-page solver is limited to ${MAX_CELLS}.`;
    fillSizes();
    return;
  }
  rows = r;
  cols = c;
  fillSizes();
  renderChart();
  newGame();
  syncUrl();
}

rowsSel.addEventListener('change', () => applySize(Number(rowsSel.value), cols));
colsSel.addEventListener('change', () => applySize(rows, Number(colsSel.value)));
firstSel.addEventListener('change', () => {
  youFirst = firstSel.value === 'you';
  newGame();
  syncUrl();
});
hintsBox.addEventListener('change', () => {
  render();
  syncUrl();
});
$('newgame').addEventListener('click', () => {
  newGame();
  syncUrl();
});
$('undo').addEventListener('click', undo);
$('chart').addEventListener('click', (ev) => {
  const td = (ev.target as HTMLElement).closest('td.pick') as HTMLElement | null;
  if (td) applySize(Number(td.dataset.r), Number(td.dataset.c));
});

fillSizes();
firstSel.value = youFirst ? 'you' : 'cpu';
hintsBox.checked = params.get('hints') !== '0';
renderChart();
const initial: Move[] = (params.get('moves') ?? '')
  .split(',')
  .map((s) => /^(\d+)\.(\d+)([hv])$/.exec(s))
  .filter((m): m is RegExpExecArray => m !== null)
  .map((m) => ({ r: Number(m[1]), c: Number(m[2]), dir: m[3] as 'h' | 'v' }));
newGame(initial);
