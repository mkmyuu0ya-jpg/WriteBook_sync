/**
 * pixiv 小説記法のパーサ（Phase 1）。
 * 対応：章見出し、改ページ、ルビ、太字、斜体、傍点、挿絵、リンク。
 * 未対応のタグは、本文の文字のまま残す。
 */

export type Inline =
  | { t: 'text'; s: string }
  | { t: 'ruby'; base: string; rt: string }
  | { t: 'bold' | 'italic'; s: string }
  | { t: 'emphasis'; s: string; mark: string }
  | { t: 'link'; title: string; url: string }
  | { t: 'jump'; page: number }
  | { t: 'image'; source: 'pixiv' | 'uploaded'; id: string };

export type Block =
  | { t: 'chapter'; title: string; line: number }
  | { t: 'newpage'; line: number }
  | { t: 'blank'; line: number }
  | { t: 'para'; inlines: Inline[]; quote: boolean; line: number };

const INLINE_TAG = /\[\[rb:\s*(.*?)\s*>\s*(.*?)\]\]|\[\[emphasismark:\s*(.*?)\s*>\s*(.*?)\]\]|\[\[jumpuri:\s*(.*?)\s*>\s*(.*?)\]\]|\[b:([^\]\n]*)\]|\[i:([^\]\n]*)\]|\[jump:(\d+)\]|\[(pixivimage|uploadedimage):([^\]\n]*)\]/g;
const CHAPTER = /^\[chapter:(.*)\]$/;

/** 1 行の本文を、文字とルビに分ける。 */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE_TAG)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: 'text', s: s.slice(last, i) });
    if (m[1] !== undefined) out.push({ t: 'ruby', base: m[1].trim(), rt: m[2].trim() });
    else if (m[3] !== undefined) out.push({ t: 'emphasis', s: m[3].trim(), mark: m[4].trim() });
    else if (m[5] !== undefined) out.push({ t: 'link', title: m[5].trim(), url: m[6].trim() });
    else if (m[7] !== undefined) out.push({ t: 'bold', s: m[7] });
    else if (m[8] !== undefined) out.push({ t: 'italic', s: m[8] });
    else if (m[9] !== undefined) out.push({ t: 'jump', page: Number(m[9]) });
    else if (m[10] !== undefined) {
      out.push({ t: 'image', source: m[10] === 'pixivimage' ? 'pixiv' : 'uploaded', id: m[11] });
    }
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
