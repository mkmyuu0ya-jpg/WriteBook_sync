import { describe, expect, it } from 'vitest';
import { applyEdit, chapterEdit, newpageEdit, rubyEdit } from './notation';

const run = (f: typeof chapterEdit, text: string, from: number, to = from) => {
  const e = f(text, from, to);
  const out = applyEdit(text, e);
  return { out, caretChar: out.slice(0, e.caret[0]) };
};

describe('見出し', () => {
  it('選択なし：タグを入れてタイトルの位置にカーソル', () => {
    const r = run(chapterEdit, 'ab', 1);
    expect(r.out).toBe('a[chapter:]b');
    expect(r.caretChar).toBe('a[chapter:');
  });
  it('選択あり：選択した文字を見出しにする', () => {
    expect(run(chapterEdit, '第一章', 0, 3).out).toBe('[chapter:第一章]');
  });
  it('複数行の選択は、見出しにしない', () => {
    expect(run(chapterEdit, 'a\nb', 0, 3).out).toBe('[chapter:]a\nb');
  });
});

describe('改ページ', () => {
  it('行頭：そのまま入れる。直後が改行ならそれを使う', () => {
    expect(run(newpageEdit, 'a\n\nb', 2).out).toBe('a\n[newpage]\nb');
  });
  it('行の途中：前後に改行を足して 1 行にする', () => {
    expect(run(newpageEdit, 'abcd', 2).out).toBe('ab\n[newpage]\ncd');
  });
  it('文末：前に改行を足す', () => {
    expect(run(newpageEdit, 'abc', 3).out).toBe('abc\n[newpage]');
  });
  it('空の本文でも入る', () => {
    expect(run(newpageEdit, '', 0).out).toBe('[newpage]');
  });
});

describe('ルビ', () => {
  it('選択あり：読みの位置にカーソル', () => {
    const r = run(rubyEdit, '夜の駅', 2, 3);
    expect(r.out).toBe('夜の[[rb:駅 > ]]');
    expect(r.caretChar).toBe('夜の[[rb:駅 > ');
  });
  it('選択なし：親文字の位置にカーソル', () => {
    const r = run(rubyEdit, 'ab', 1);
    expect(r.out).toBe('a[[rb: > ]]b');
    expect(r.caretChar).toBe('a[[rb:');
  });
  it('複数行の選択は、ルビにしない', () => {
    expect(run(rubyEdit, 'a\nb', 0, 3).out).toBe('[[rb: > ]]a\nb');
  });
});
