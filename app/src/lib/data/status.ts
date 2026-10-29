import type { Book, Status } from './types';
import { STATUS_ORDER } from './types';

/** 投稿の記録があり、いまの本文が投稿時と違うなら true（「投稿後に修正あり」）。 */
export function modifiedAfterPost(book: Book, currentHash: string): boolean {
  const posted = book.pixiv?.postedHash;
  return !!posted && posted !== currentHash;
}

/** 状態ごとの冊数。 */
export function countByStatus(books: Book[]): Record<Status, number> {
  const out: Record<Status, number> = { wip: 0, ready: 0, done: 0 };
  for (const b of books) out[b.status] += 1;
  return out;
}

export function isStatus(v: string): v is Status {
  return (STATUS_ORDER as string[]).includes(v);
}
