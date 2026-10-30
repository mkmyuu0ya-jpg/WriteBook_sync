import { describe, expect, it } from 'vitest';
import {
  applyEdit,
  boldEdit,
  chapterEdit,
  emphasisEdit,
  italicEdit,
  newpageEdit,
  pageLinkEdit,
  pixivImageEdit,
  rubyEdit,
  uploadedImageEdit,
  urlLinkEdit,
} from './notation';

const run = (f: typeof chapterEdit, text: string, from: number, to = from) => {
  const e = f(text, from, to);
  const out = applyEdit(text, e);
  return {
    out,
    caretChar: out.slice(0, e.caret[0]),
    selected: out.slice(e.caret[0], e.caret[1]),
  };
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

  describe('本文の装飾・リンク・挿絵', () => {
    it('選択した文字に太字・斜体・傍点を付ける', () => {
      expect(run(boldEdit, '本文', 0, 2).out).toBe('[b:本文]');
      expect(run(italicEdit, '本文', 0, 2).out).toBe('[i:本文]');
      expect(run(emphasisEdit, '本文', 0, 2).out).toBe('[[emphasismark:本文 > ﹅]]');
    });

    it('選択範囲がなければ装飾位置にカーソルを置く', () => {
      expect(run(boldEdit, '', 0).caretChar).toBe('[b:');
      expect(run(italicEdit, '', 0).caretChar).toBe('[i:');
      expect(run(emphasisEdit, '', 0).caretChar).toBe('[[emphasismark:');
    });

    it('挿絵タグとページリンクの入力値位置にカーソルを置く', () => {
      expect(run(pixivImageEdit, '', 0)).toMatchObject({ caretChar: '[pixivimage:', selected: 'イラストID' });
      expect(run(uploadedImageEdit, '', 0)).toMatchObject({ caretChar: '[uploadedimage:', selected: 'アップロード挿絵ID' });
      expect(run(pageLinkEdit, '', 0)).toMatchObject({ caretChar: '[jump:', selected: 'リンク先ページ番号' });
    });

    it('URLリンクは選択文字をタイトルにしてURL入力位置へ移動する', () => {
      const r = run(urlLinkEdit, 'リンク文字', 0, 5);
      expect(r.out).toBe('[[jumpuri:リンク文字 > リンク先URL]]');
      expect(r).toMatchObject({ caretChar: '[[jumpuri:リンク文字 > ', selected: 'リンク先URL' });
    });
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
