import { describe, expect, it } from 'vitest';
import { fitFontSize, linePitch, pageMetrics, spacerSize } from './layout';

describe('layout', () => {
  it('uses the configured font size when it fits, and shrinks it on a constrained screen', () => {
    expect(fitFontSize({ vert: true, fs: 20, aw: 374, ah: 700 })).toBe(20);
    expect(fitFontSize({ vert: true, fs: 36, aw: 70, ah: 320 })).toBe(29);
    expect(fitFontSize({ vert: false, fs: 36, aw: 320, ah: 60 })).toBe(25);
  });
  it('keeps the page viewport inside narrow available dimensions', () => {
    for (const vert of [true, false]) {
      const aw = 234;
      const ah = 360;
      const fs = fitFontSize({ vert, fs: 36, aw, ah });
      const metrics = pageMetrics({ vert, fs, aw, ah });
      expect(metrics.vpW).toBeLessThanOrEqual(aw);
      expect(metrics.vpH).toBeLessThanOrEqual(ah);
    }
  });
  it('行送りは整数 px', () => {
    expect(linePitch(20)).toBe(48);
    expect(Number.isInteger(linePitch(13))).toBe(true);
  });
  it('縦書きスクロール：表示幅をそのまま使い、行長は文字サイズの整数倍', () => {
    const m = pageMetrics({ vert: true, fs: 20, aw: 366, ah: 700 });
    expect(m.L).toBe(48);
    expect(m.P).toBe(366);
    expect(m.vpW).toBe(366);
    expect(m.vpH % 20).toBe(0);
  });
  it('横書きスクロール：表示高さをそのまま使う', () => {
    const m = pageMetrics({ vert: false, fs: 20, aw: 366, ah: 700 });
    expect(m.P).toBe(700);
    expect(m.vpW).toBe(366);
    expect(m.vpH).toBe(700);
  });
  it('[newpage] spacer：次の表示領域境界までの残り', () => {
    expect(spacerSize(100, 336)).toBe(236);
    expect(spacerSize(336, 336)).toBe(0);
    expect(spacerSize(0, 336)).toBe(0);
    expect(spacerSize(335.5, 336)).toBe(0);
    expect(spacerSize(-1, 336)).toBe(0);
  });
});
