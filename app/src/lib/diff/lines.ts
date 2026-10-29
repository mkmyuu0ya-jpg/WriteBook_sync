/** 行単位の差分（履歴から戻すときの確認に使う）。 */
export type DiffOp = { t: 'eq' | 'add' | 'del'; text: string };
export type Row = DiffOp | { t: 'skip'; n: number };

/** 差分の計算が重くなりすぎないよう、変更部分の行数の積がこれを超えたら、全部「消える・現れる」として扱う。 */
const MAX_CELLS = 4_000_000;

function lcsDiff(A: string[], B: string[]): DiffOp[] {
  const n = A.length;
  const m = B.length;
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const out: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ t: 'eq', text: A[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      out.push({ t: 'del', text: A[i++] });
    } else {
      out.push({ t: 'add', text: B[j++] });
    }
  }
  while (i < n) out.push({ t: 'del', text: A[i++] });
  while (j < m) out.push({ t: 'add', text: B[j++] });
  return out;
}

/** a から b への差分。del は a にだけある行、add は b にだけある行。 */
export function diffLines(a: string, b: string): DiffOp[] {
  const A = a.split('\n');
  const B = b.split('\n');
  let s = 0;
  while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length;
  let eb = B.length;
  while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) {
    ea--;
    eb--;
  }
  const head: DiffOp[] = A.slice(0, s).map((text) => ({ t: 'eq', text }));
  const tail: DiffOp[] = A.slice(ea).map((text) => ({ t: 'eq', text }));
  const MA = A.slice(s, ea);
  const MB = B.slice(s, eb);
  const mid: DiffOp[] =
    MA.length * MB.length > MAX_CELLS
      ? [...MA.map((text): DiffOp => ({ t: 'del', text })), ...MB.map((text): DiffOp => ({ t: 'add', text }))]
      : lcsDiff(MA, MB);
  return [...head, ...mid, ...tail];
}

export function diffStats(ops: DiffOp[]): { add: number; del: number } {
  let add = 0;
  let del = 0;
  for (const o of ops) {
    if (o.t === 'add') add++;
    else if (o.t === 'del') del++;
  }
  return { add, del };
}

/** 変更の前後 ctx 行だけを残し、それ以外の変わらない行は「n 行」にまとめる。 */
export function collapse(ops: DiffOp[], ctx = 2): Row[] {
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((o, i) => {
    if (o.t === 'eq') return;
    for (let k = Math.max(0, i - ctx); k <= Math.min(ops.length - 1, i + ctx); k++) keep[k] = true;
  });
  const rows: Row[] = [];
  let skipped = 0;
  ops.forEach((o, i) => {
    if (keep[i]) {
      if (skipped > 0) rows.push({ t: 'skip', n: skipped });
      skipped = 0;
      rows.push(o);
    } else {
      skipped++;
    }
  });
  if (skipped > 0) rows.push({ t: 'skip', n: skipped });
  return rows;
}
