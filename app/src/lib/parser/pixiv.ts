/**
 * pixiv 小説記法のパーサ（Phase 1）。
 * 対応：章見出し [chapter:]、改ページ [newpage]、ルビ [[rb:漢字 > ふりがな]]。
 * 未対応のタグは、本文の文字のまま残す（#75 で対応を追加）。
 */

export type Inline =
  | { t: 'text'; s: string }
  | { t: 'ruby'; base: string; rt: string };

export type Block =
  | { t: 'chapter'; title: string; line: number }
  | { t: 'newpage'; line: number }
  | { t: 'blank'; line: number }
  | { t: 'para'; inlines: Inline[]; quote: boolean; line: number };

const RUBY = /\[\[rb:(.+?)\s*>\s*(.+?)\]\]/g;
const CHAPTER = /^\[chapter:(.*)\]$/;

/** 1 行の本文を、文字とルビに分ける。 */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(RUBY)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: 'text', s: s.slice(last, i) });
    out.push({ t: 'ruby', base: m[1].trim(), rt: m[2].trim() });
    last = i + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', s: s.slice(last) });
  return out;
}

/** 本文全体を、行ごとのブロックに分ける（line は 0 始まりの行番号）。 */
export function parse(src: string): Block[] {
  return src.split(/\r?\n/).map((raw, line): Block => {
    const t = raw.trim();
    if (t === '') return { t: 'blank', line };
    if (t === '[newpage]') return { t: 'newpage', line };
    const c = CHAPTER.exec(t);
    if (c) return { t: 'chapter', title: c[1].trim(), line };
    return { t: 'para', inlines: parseInline(raw), quote: raw.startsWith('「'), line };
  });
}

/** [newpage] で区切ったページの一覧。末尾の空ページは作らない。 */
export function pages(blocks: Block[]): Block[][] {
  const out: Block[][] = [[]];
  for (const b of blocks) {
    if (b.t === 'newpage') out.push([]);
    else out[out.length - 1].push(b);
  }
  while (out.length > 1 && out[out.length - 1].length === 0) out.pop();
  return out;
}

/** 目次（[chapter:] の見出しの一覧）。 */
export function outline(blocks: Block[]): { title: string; line: number }[] {
  return blocks.flatMap((b) => (b.t === 'chapter' ? [{ title: b.title, line: b.line }] : []));
}
