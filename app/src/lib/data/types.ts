/** 本の状態：未完成／完成／完了（design.md 5 章）。 */
export type Status = 'wip' | 'ready' | 'done';

export const STATUS_ORDER: Status[] = ['wip', 'ready', 'done'];
export const STATUS_LABEL: Record<Status, string> = { wip: '未完成', ready: '完成', done: '完了' };

export type Series = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

/** pixiv に投稿したときだけ記録する（任意）。 */
export type PixivRecord = {
  url?: string;
  postedAt?: string;
  /** 投稿時点の本文ハッシュ */
  postedHash?: string;
};

export type PublishRecord = {
  gistId: string;
  publishedAt: string;
  publishedHash: string;
};

export type Book = {
  id: string;
  seriesId: string;
  title: string;
  status: Status;
  pixiv?: PixivRecord;
  publish?: PublishRecord;
  caption?: string;
  /** ゴミ箱に入れた日時（論理削除） */
  trashedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Body = { bookId: string; content: string };

/** 読書位置（先頭に見えている行番号。文字サイズが変わっても復元できる） */
export type Progress = { bookId: string; line: number; updatedAt: string };

/** 編集前のスナップショット（誤って消したときに戻すための端末内の履歴。design.md 10 章） */
export type Snapshot = {
  id?: number;
  bookId: string;
  savedAt: string;
  content: string;
  reason: 'edit-start' | 'restore' | 'manual';
};
