/**
 * 閲覧モードのページ計算（純粋関数）。
 * Phase 0 で PC・iPhone の両方で検証した方式：
 *  - 行送り L を整数 px に固定し、line-height を px で指定する（ルビで行幅が変わらないよう、行間に余白を取る）
 *  - 行送り L を整数 px に固定する
 *  - [newpage] ごとにページを分け、表示領域に収まらない本文だけをスクロールする
 */

export const LINE_RATIO = 2.4;

export type Metrics = {
  /** 行送り（px） */
  L: number;
  /** 1ページの表示領域の幅・高さ（px） */
  vpW: number;
  vpH: number;
};

export function linePitch(fontSize: number): number {
  return Math.round(fontSize * LINE_RATIO);
}

/** 画面に最低 1 行ぶん収まるよう、設定文字サイズを表示領域に合わせる。 */
export function fitFontSize(o: {
  vert: boolean;
  fs: number;
  aw: number;
  ah: number;
}): number {
  const maxFs = o.vert
    ? Math.min(o.aw / LINE_RATIO, o.ah)
    : Math.min(o.aw, o.ah / LINE_RATIO);
  return Math.max(1, Math.floor(Math.min(o.fs, maxFs)));
}

export function pageMetrics(o: {
  vert: boolean;
  fs: number;
  aw: number;
  ah: number;
}): Metrics {
  const L = linePitch(o.fs);
  if (o.vert) {
    const H = Math.floor(o.ah / o.fs) * o.fs;
    return { L, vpW: o.aw, vpH: H };
  }
  return { L, vpW: o.aw, vpH: o.ah };
}
