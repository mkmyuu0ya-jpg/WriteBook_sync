/**
 * 閲覧モードのページ計算（純粋関数）。
 * Phase 0 で PC・iPhone の両方で検証した方式：
 *  - 行送り L を整数 px に固定し、line-height を px で指定する（ルビで行幅が変わらないよう、行間に余白を取る）
 *  - 行送り L を整数 px に固定する
 *  - [newpage] は画面幅・高さの境界に合わせて余白を補う
 */

export const LINE_RATIO = 2.4;

export type Metrics = {
  /** 行送り（px） */
  L: number;
  /** 表示幅（縦書き）または表示高さ（横書き） */
  P: number;
  /** 表示領域の幅・高さ（px） */
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
    return { L, P: o.aw, vpW: o.aw, vpH: H };
  }
  return { L, P: o.ah, vpW: o.aw, vpH: o.ah };
}

/** [newpage] の位置（先頭からの距離）から、次のページ境界まで埋める空白の大きさ。 */
export function spacerSize(offset: number, P: number): number {
  const rem = ((offset % P) + P) % P;
  return rem > 1 && P - rem > 1 ? P - rem : 0;
}
