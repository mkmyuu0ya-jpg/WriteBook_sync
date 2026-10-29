import Dexie, { type EntityTable } from 'dexie';
import type { Body, Book, Progress, Series, Snapshot } from './types';

/**
 * 端末内のデータ（IndexedDB）。Phase 1 はローカルのみ。
 * Phase 2 で、GitHub の book/data のファイル（path / baseSha / dirty）と対応づける。
 */
export class BookDB extends Dexie {
  series!: EntityTable<Series, 'id'>;
  books!: EntityTable<Book, 'id'>;
  bodies!: EntityTable<Body, 'bookId'>;
  progress!: EntityTable<Progress, 'bookId'>;
  history!: EntityTable<Snapshot, 'id'>;
  meta!: EntityTable<{ key: string; value: string }, 'key'>;

  constructor(name = 'book') {
    super(name);
    this.version(1).stores({
      series: 'id, createdAt',
      books: 'id, seriesId, status, trashedAt',
      bodies: 'bookId',
      progress: 'bookId',
    });
    // v2：編集前のスナップショット
    this.version(2).stores({
      series: 'id, createdAt',
      books: 'id, seriesId, status, trashedAt',
      bodies: 'bookId',
      progress: 'bookId',
      history: '++id, bookId, savedAt',
    });
    this.version(3).stores({
      series: 'id, createdAt',
      books: 'id, seriesId, status, trashedAt',
      bodies: 'bookId',
      progress: 'bookId',
      history: '++id, bookId, savedAt',
      meta: '&key',
    });
  }
}
