/**
 * 閲覧モードのページ計算（純粋関数）。
 * Phase 0 で PC・iPhone の両方で検証した方式：
 *  - 行送り L を整数 px に固定し、line-height を px で指定する（ルビで行幅が変わらないよう、行間に余白を取る）
 *  - ページ幅 P を L の整数倍にする
 *  - ページ送りは scrollLeft ではなく transform で行う
 */

export const LINE_RATIO = 2.4;

export type Metrics = {
  /** 行送り（px） */
  L: number;
  /** 1 ページぶんの送り量（px）。ページ送りでない場合は表示幅（高さ） */
  P: number;
  /** 表示領域の幅・高さ（px） */
  vpW: number;
  vpH: number;
};

export function linePitch(fontSize: number): number {
  return Math.round(fontSize * LINE_RATIO);
}

export function pageMetrics(o: {
  vert: boolean;
  paged: boolean;
  fs: number;
  aw: number;
  ah: number;
}): Metrics {
  const L = linePitch(o.fs);
  if (o.vert) {
    const H = Math.max(L, Math.floor(o.ah / o.fs) * o.fs);
    const P = o.paged ? Math.max(L, Math.floor(o.aw / L) * L) : o.aw;
    return { L, P, vpW: P, vpH: H };
  }
  const P = o.paged ? Math.max(L, Math.floor(o.ah / L) * L) : o.ah;
  return { L, P, vpW: o.aw, vpH: P };
}

/** [newpage] の位置（先頭からの距離）から、次のページ境界まで埋める空白の大きさ。 */
export function spacerSize(offset: number, P: number): number {
  const rem = ((offset % P) + P) % P;
  return rem > 1 && P - rem > 1 ? P - rem : 0;
}

/** 全体の長さ（幅または高さ）からページ数を求める。 */
export function pageCount(total: number, P: number): number {
  return Math.max(1, Math.ceil(total / P - 0.001));
}

export function pageTransform(page: number, P: number, vert: boolean, paged: boolean): string {
  if (!paged) return 'none';
  return vert ? `translateX(${page * P}px)` : `translateY(${-page * P}px)`;
}
