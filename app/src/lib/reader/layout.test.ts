import { describe, expect, it } from 'vitest';
import { linePitch, pageCount, pageMetrics, pageTransform, spacerSize } from './layout';

describe('layout', () => {
  it('行送りは整数 px', () => {
    expect(linePitch(20)).toBe(48);
    expect(Number.isInteger(linePitch(13))).toBe(true);
  });
  it('縦書き・ページ送り：ページ幅は行送りの整数倍、行長は文字サイズの整数倍', () => {
    const m = pageMetrics({ vert: true, paged: true, fs: 20, aw: 366, ah: 700 });
    expect(m.L).toBe(48);
    expect(m.P % m.L).toBe(0);
    expect(m.P).toBe(336);
    expect(m.vpH % 20).toBe(0);
  });
  it('縦書き・スクロール：表示幅をそのまま使う', () => {
    expect(pageMetrics({ vert: true, paged: false, fs: 20, aw: 366, ah: 700 }).P).toBe(366);
  });
  it('横書き・ページ送り：ページの高さは行送りの整数倍', () => {
    const m = pageMetrics({ vert: false, paged: true, fs: 20, aw: 366, ah: 700 });
    expect(m.P % m.L).toBe(0);
    expect(m.vpW).toBe(366);
  });
  it('表示領域が極端に小さくても、1 行ぶんは確保する', () => {
    expect(pageMetrics({ vert: true, paged: true, fs: 36, aw: 10, ah: 10 }).P).toBe(linePitch(36));
  });
  it('spacerSize：次のページ境界までの残り', () => {
    expect(spacerSize(100, 336)).toBe(236);
    expect(spacerSize(336, 336)).toBe(0);
    expect(spacerSize(0, 336)).toBe(0);
    expect(spacerSize(335.5, 336)).toBe(0);
    expect(spacerSize(-1, 336)).toBe(0);
  });
  it('pageCount', () => {
    expect(pageCount(1, 336)).toBe(1);
    expect(pageCount(672, 336)).toBe(2);
    expect(pageCount(673, 336)).toBe(3);
  });
  it('pageTransform', () => {
    expect(pageTransform(2, 336, true, true)).toBe('translateX(672px)');
    expect(pageTransform(2, 336, false, true)).toBe('translateY(-672px)');
    expect(pageTransform(2, 336, true, false)).toBe('none');
  });
});
