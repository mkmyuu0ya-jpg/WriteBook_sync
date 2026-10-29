import { ulid } from 'ulid';
import type { BookDB } from './db';
import type { Book, PixivRecord, Progress, Series, Snapshot, Status } from './types';

/** 端末内に残すスナップショットの上限（1 冊あたり） */
export const MAX_SNAPSHOTS = 10;

function notifyChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('book-data-changed'));
}

/** データ操作。DB を引数で受けるので、テストでは別の DB を渡せる。 */
export function createRepo(db: BookDB, now: () => string = () => new Date().toISOString()) {
  const self = {
    listSeries(): Promise<Series[]> {
      return db.series.orderBy('createdAt').toArray();
    },

    async addSeries(title: string): Promise<Series> {
      const t = now();
      const s: Series = { id: ulid(), title: title.trim() || '無題のシリーズ', createdAt: t, updatedAt: t };
      await db.series.add(s);
      notifyChanged();
      return s;
    },

    /** ゴミ箱の本を除いた一覧（作成順）。 */
    async listBooks(seriesId?: string): Promise<Book[]> {
      const all = seriesId ? await db.books.where('seriesId').equals(seriesId).toArray() : await db.books.toArray();
      return all.filter((b) => !b.trashedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async listTrashed(): Promise<Book[]> {
      const all = await db.books.toArray();
      return all.filter((b) => b.trashedAt).sort((a, b) => (b.trashedAt ?? '').localeCompare(a.trashedAt ?? ''));
    },

    async addBook(seriesId: string, title: string, content = ''): Promise<Book> {
      const t = now();
      const b: Book = {
        id: ulid(),
        seriesId,
        title: title.trim() || '無題の本',
        status: 'wip',
        createdAt: t,
        updatedAt: t,
      };
      await db.transaction('rw', db.books, db.bodies, async () => {
        await db.books.add(b);
        await db.bodies.add({ bookId: b.id, content });
      });
      notifyChanged();
      return b;
    },

    getBook(id: string): Promise<Book | undefined> {
      return db.books.get(id);
    },

    async getBody(bookId: string): Promise<string> {
      return (await db.bodies.get(bookId))?.content ?? '';
    },

    async setBody(bookId: string, content: string): Promise<void> {
      await db.transaction('rw', db.bodies, db.books, async () => {
        await db.bodies.put({ bookId, content });
        await db.books.update(bookId, { updatedAt: now() });
      });
      notifyChanged();
    },

    async setTitle(bookId: string, title: string): Promise<void> {
      await db.books.update(bookId, { title: title.trim() || '無題の本', updatedAt: now() });
      notifyChanged();
    },

    async setPublish(bookId: string, publish: Book['publish']): Promise<void> {
      await db.books.update(bookId, { publish, updatedAt: now() });
      notifyChanged();
    },

    /** 状態を変える。pixiv を渡したときは、投稿の記録を保存する（渡さなければ既存の記録を残す）。 */
    async setStatus(bookId: string, status: Status, pixiv?: PixivRecord): Promise<void> {
      const patch: Partial<Book> = { status, updatedAt: now() };
      if (pixiv) patch.pixiv = pixiv;
      await db.books.update(bookId, patch);
      notifyChanged();
    },

    async trashBook(id: string): Promise<void> {
      await db.books.update(id, { trashedAt: now() });
      notifyChanged();
    },

    async restoreBook(id: string): Promise<void> {
      await db.books.update(id, { trashedAt: undefined });
      notifyChanged();
    },

    /** 完全削除（本文・読書位置・スナップショットも消す）。 */
    async deleteForever(id: string): Promise<void> {
      await db.transaction('rw', db.books, db.bodies, db.progress, db.history, async () => {
        await db.books.delete(id);
        await db.bodies.delete(id);
        await db.progress.delete(id);
        await db.history.where('bookId').equals(id).delete();
      });
      notifyChanged();
    },

    /** 編集前のスナップショットを残す。直前と同じ内容なら残さない。上限を超えた古いものは消す。 */
    async addSnapshot(bookId: string, content: string, reason: Snapshot['reason'] = 'edit-start'): Promise<boolean> {
      const all = await db.history.where('bookId').equals(bookId).sortBy('savedAt');
      if (all.length > 0 && all[all.length - 1].content === content) return false;
      await db.history.add({ bookId, savedAt: now(), content, reason });
      const extra = all.length + 1 - MAX_SNAPSHOTS;
      if (extra > 0) await db.history.bulkDelete(all.slice(0, extra).map((x) => x.id as number));
      return true;
    },

    /** 新しい順。 */
    async listSnapshots(bookId: string): Promise<Snapshot[]> {
      return (await db.history.where('bookId').equals(bookId).sortBy('savedAt')).reverse();
    },

    async saveProgress(bookId: string, line: number): Promise<void> {
      const p: Progress = { bookId, line, updatedAt: now() };
      await db.progress.put(p);
    },

    async getProgress(bookId: string): Promise<Progress | undefined> {
      return db.progress.get(bookId);
    },

    /** スナップショットの内容に戻す。戻す前の本文も、スナップショットとして残す。 */
    async restoreSnapshot(bookId: string, snapshotId: number): Promise<boolean> {
      const snap = await db.history.get(snapshotId);
      if (!snap || snap.bookId !== bookId) return false;
      const current = (await db.bodies.get(bookId))?.content ?? '';
      await self.addSnapshot(bookId, current, 'restore');
      await self.setBody(bookId, snap.content);
      return true;
    },
  };
  return self;
}

export type Repo = ReturnType<typeof createRepo>;
