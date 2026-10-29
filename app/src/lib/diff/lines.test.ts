import { describe, expect, it } from 'vitest';
import { collapse, diffLines, diffStats } from './lines';

const show = (a: string, b: string) => diffLines(a, b).map((o) => (o.t === 'eq' ? ' ' : o.t === 'add' ? '+' : '-') + o.text);

describe('diffLines', () => {
  it('同じなら全部 eq', () => {
    expect(show('a\nb', 'a\nb')).toEqual([' a', ' b']);
  });
  it('行の追加と削除', () => {
    expect(show('a\nb\nc', 'a\nx\nc')).toEqual([' a', '-b', '+x', ' c']);
    expect(show('a\nc', 'a\nb\nc')).toEqual([' a', '+b', ' c']);
    expect(show('a\nb\nc', 'a\nc')).toEqual([' a', '-b', ' c']);
  });
  it('空の本文との比較', () => {
    expect(diffStats(diffLines('', 'a\nb'))).toEqual({ add: 2, del: 1 }); // '' は 1 行の空行
  });
  it('離れた 2 か所の変更', () => {
    const a = ['1', '2', '3', '4', '5', '6'].join('\n');
    const b = ['1', 'x', '3', '4', '5', 'y'].join('\n');
    expect(diffStats(diffLines(a, b))).toEqual({ add: 2, del: 2 });
  });
  it('差分を適用すると b に戻る', () => {
    const a = 'あ\nい\nう\nえ\nお';
    const b = 'あ\nう\nか\nえ\nき\nお';
    const rebuilt = diffLines(a, b).filter((o) => o.t !== 'del').map((o) => o.text).join('\n');
    expect(rebuilt).toBe(b);
    const original = diffLines(a, b).filter((o) => o.t !== 'add').map((o) => o.text).join('\n');
    expect(original).toBe(a);
  });
  it('変更が大きすぎるときは、全部を消える・現れるにする', () => {
    const a = Array.from({ length: 2500 }, (_, i) => 'a' + i).join('\n');
    const b = Array.from({ length: 2500 }, (_, i) => 'b' + i).join('\n');
    expect(diffStats(diffLines(a, b))).toEqual({ add: 2500, del: 2500 });
  });
});

describe('collapse', () => {
  it('変更の前後だけを残し、あとは行数にまとめる', () => {
    const a = Array.from({ length: 20 }, (_, i) => 'L' + i).join('\n');
    const b = a.replace('L10', 'X');
    const rows = collapse(diffLines(a, b), 2);
    expect(rows[0]).toEqual({ t: 'skip', n: 8 });
    expect(rows.filter((r) => r.t === 'add' || r.t === 'del')).toHaveLength(2);
    expect(rows[rows.length - 1]).toEqual({ t: 'skip', n: 7 });
  });
  it('変更がなければ、まとめて 1 つ', () => {
    expect(collapse(diffLines('a\nb', 'a\nb'))).toEqual([{ t: 'skip', n: 2 }]);
  });
});
