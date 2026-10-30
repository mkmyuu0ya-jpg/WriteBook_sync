/**
 * 記法ボタンの挿入（純粋関数）。pixiv の投稿ページと同じように、ボタンで記法を入れられる。
 * 戻り値の Edit は、from〜to を insert で置き換え、そのあと caret の範囲を選択する、という意味。
 */
export type Edit = { from: number; to: number; insert: string; caret: [number, number] };

/** 見出し：選択があれば `[chapter:選択]`、なければ `[chapter:]` を入れてタイトルの位置にカーソルを置く。 */
export function chapterEdit(text: string, from: number, to: number): Edit {
  const sel = text.slice(from, to);
  if (sel && !sel.includes('\n')) {
    const insert = `[chapter:${sel}]`;
    const c = from + insert.length;
    return { from, to, insert, caret: [c, c] };
  }
  const c = from + '[chapter:'.length;
  return { from, to: from, insert: '[chapter:]', caret: [c, c] };
}

/** 改ページ：`[newpage]` を 1 行として入れる（前後が行の途中なら改行を足す）。 */
export function newpageEdit(text: string, from: number, to: number): Edit {
  const before = from === 0 || text[from - 1] === '\n' ? '' : '\n';
  const after = to >= text.length || text[to] === '\n' ? '' : '\n';
  const insert = `${before}[newpage]${after}`;
  const c = from + insert.length;
  return { from, to, insert, caret: [c, c] };
}

/** ルビ：選択があれば `[[rb:選択 > ]]` にして読みの位置にカーソルを置く。なければ親文字の位置にカーソルを置く。 */
export function rubyEdit(text: string, from: number, to: number): Edit {
  const sel = text.slice(from, to);
  if (sel && !sel.includes('\n')) {
    const insert = `[[rb:${sel} > ]]`;
    const c = from + insert.length - 2;
    return { from, to, insert, caret: [c, c] };
  }
  const c = from + '[[rb:'.length;
  return { from, to: from, insert: '[[rb: > ]]', caret: [c, c] };
}

function inlineTagEdit(
  text: string,
  from: number,
  to: number,
  makeTag: (selected: string) => string,
  selectionStart: (selected: string) => number,
): Edit {
  const selected = text.slice(from, to);
  const insert = makeTag(selected);
  const start = from + selectionStart(selected);
  return {
    from,
    to,
    insert,
    caret: selected ? [start, start + selected.length] : [start, start],
  };
}

export function boldEdit(text: string, from: number, to: number): Edit {
  return inlineTagEdit(text, from, to, (selected) => `[b:${selected}]`, () => '[b:'.length);
}

export function italicEdit(text: string, from: number, to: number): Edit {
  return inlineTagEdit(text, from, to, (selected) => `[i:${selected}]`, () => '[i:'.length);
}

export function emphasisEdit(text: string, from: number, to: number): Edit {
  return inlineTagEdit(
    text,
    from,
    to,
    (selected) => `[[emphasismark:${selected} > ﹅]]`,
    () => '[[emphasismark:'.length,
  );
}

export function pixivImageEdit(_text: string, from: number, to: number): Edit {
  const insert = '[pixivimage:イラストID]';
  const start = from + '[pixivimage:'.length;
  return { from, to, insert, caret: [start, start + 'イラストID'.length] };
}

export function uploadedImageEdit(_text: string, from: number, to: number): Edit {
  const insert = '[uploadedimage:アップロード挿絵ID]';
  const start = from + '[uploadedimage:'.length;
  return { from, to, insert, caret: [start, start + 'アップロード挿絵ID'.length] };
}

export function pageLinkEdit(_text: string, from: number, to: number): Edit {
  const insert = '[jump:リンク先ページ番号]';
  const start = from + '[jump:'.length;
  return { from, to, insert, caret: [start, start + 'リンク先ページ番号'.length] };
}

export function urlLinkEdit(text: string, from: number, to: number): Edit {
  const selected = text.slice(from, to);
  const title = selected || 'リンクタイトル';
  const insert = `[[jumpuri:${title} > リンク先URL]]`;
  const start = from + `[[jumpuri:${title} > `.length;
  return { from, to, insert, caret: [start, start + 'リンク先URL'.length] };
}

/** 編集を本文に当てはめる（テストと、エディタを使わない場面用）。 */
export function applyEdit(text: string, e: Edit): string {
  return text.slice(0, e.from) + e.insert + text.slice(e.to);
}
