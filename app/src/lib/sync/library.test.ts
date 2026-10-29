import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BookDB } from '../data/db';
import { hasLocalBackup, parseRemoteLibrary, readLocalLibrary, replaceLocalLibrary, saveLocalBackup, serializeLibrary } from './library';

describe('sync library format', () => {
  it('preserves Japanese text and maps local records to the repository data layout', async () => {
    const db = new BookDB(`sync-${crypto.randomUUID()}`);
    try {
      const series = { id: 'series-1', title: '短編集', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
      const book = { id: 'book-1', seriesId: series.id, title: '第一話', status: 'wip' as const, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
      await db.series.add(series);
      await db.books.add(book);
      await db.bodies.add({ bookId: book.id, content: '本文\n[[rb:漢字 > かんじ]]' });

      const initial = await readLocalLibrary(db);
      const files = serializeLibrary(initial).map((file) => ({ ...file, sha: 'sha' }));
      const parsed = parseRemoteLibrary(files);

      expect(parsed).toEqual(initial);
      expect(files.map((file) => file.path)).toContain('book/data/series/series-1/books/book-1/body.txt');
    } finally {
      await db.delete();
    }
  });

  it('replaces library records transactionally without clearing local history', async () => {
    const db = new BookDB(`sync-${crypto.randomUUID()}`);
    try {
      const oldSeries = { id: 'old-series', title: '旧', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
      await db.series.add(oldSeries);
      await db.history.add({ bookId: 'old-book', savedAt: '2026-01-01', content: 'backup', reason: 'edit-start' });
      await saveLocalBackup(db);
      await replaceLocalLibrary(db, { series: [], books: [], bodies: {} });

      expect(await db.series.count()).toBe(0);
      expect(await db.history.count()).toBe(1);
      expect(await hasLocalBackup(db)).toBe(true);
    } finally {
      await db.delete();
    }
  });

  it('rejects invalid book data instead of silently importing it', () => {
    expect(() => parseRemoteLibrary([
      { path: 'book/data/library.json', sha: 'sha', content: '{"schemaVersion":1,"seriesOrder":["series-1"]}' },
      { path: 'book/data/series/series-1/series.json', sha: 'sha', content: '{"id":"series-1","title":"S","createdAt":"2026-01-01","updatedAt":"2026-01-01"}' },
      { path: 'book/data/series/series-1/books/book-1/book.json', sha: 'sha', content: '{"id":"book-1"}' },
    ])).toThrow('本のデータが不正です');
  });
});
