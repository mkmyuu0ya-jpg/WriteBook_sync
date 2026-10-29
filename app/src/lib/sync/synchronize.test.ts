import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookDB } from '../data/db';
import { readLocalLibrary, serializeLibrary, setSyncBase, setSyncHead } from './library';

const github = vi.hoisted(() => ({
  readDataFiles: vi.fn(),
  writeDataFiles: vi.fn(),
}));

vi.mock('./github', () => ({
  ...github,
  GitHubApiError: class GitHubApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
}));

import { synchronizeLibrary } from './synchronize';

const settings = { owner: 'writer', repo: 'book', branch: 'main', token: 'token' };
const series = { id: 'series-1', title: '短編集', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const book = { id: 'book-1', seriesId: series.id, title: '第一話', status: 'wip' as const, createdAt: '2026-01-01', updatedAt: '2026-01-01' };

function data(body: string) {
  return { series: [series], books: [book], bodies: { [book.id]: body } };
}

function remote(files: Array<{ path: string; content: string }>) {
  return files.map((file) => ({ ...file, sha: `sha-${file.path}` }));
}

async function setup(baseBody: string, localBody: string, remoteBody: string) {
  const db = new BookDB(`sync-run-${crypto.randomUUID()}`);
  const baseFiles = serializeLibrary(data(baseBody));
  const localFiles = serializeLibrary(data(localBody));
  await db.series.add(series);
  await db.books.add(book);
  await db.bodies.add({ bookId: book.id, content: localBody });
  await setSyncBase(db, baseFiles);
  await setSyncHead(db, 'base-head');
  github.readDataFiles.mockResolvedValue({ head: 'remote-head', files: remote(serializeLibrary(data(remoteBody))) });
  return { db, localFiles };
}

beforeEach(() => {
  github.readDataFiles.mockReset();
  github.writeDataFiles.mockReset();
  github.writeDataFiles.mockResolvedValue('new-head');
});

describe('synchronizeLibrary', () => {
  it('pulls remote-only edits into IndexedDB without creating a commit', async () => {
    const { db } = await setup('before', 'before', 'from GitHub');
    try {
      const result = await synchronizeLibrary(db, settings);
      expect(result).toMatchObject({ status: 'complete', pushed: false, pulled: true, head: 'remote-head' });
      expect(await db.bodies.get('book-1')).toMatchObject({ content: 'from GitHub' });
      expect(github.writeDataFiles).not.toHaveBeenCalled();
    } finally {
      await db.delete();
    }
  });

  it('pushes local-only edits as a single commit', async () => {
    const { db, localFiles } = await setup('before', 'from this device', 'before');
    try {
      const result = await synchronizeLibrary(db, settings);
      expect(result).toMatchObject({ status: 'complete', pushed: true, pulled: true, head: 'new-head' });
      expect(github.writeDataFiles).toHaveBeenCalledWith(
        settings,
        'remote-head',
        expect.arrayContaining([expect.objectContaining({ path: expect.stringMatching(/body\.txt$/), content: 'from this device' })]),
        'sync: update book library',
      );
      expect(await readLocalLibrary(db)).toMatchObject({ bodies: { 'book-1': 'from this device' } });
      expect(localFiles.length).toBeGreaterThan(0);
    } finally {
      await db.delete();
    }
  });

  it('does not overwrite either body when both sides changed until a choice is made', async () => {
    const { db } = await setup('before', 'local edit', 'remote edit');
    try {
      const result = await synchronizeLibrary(db, settings);
      expect(result.status).toBe('conflicts');
      if (result.status === 'conflicts') {
        expect(result.plan.conflicts.map((item) => item.path)).toContain('book/data/series/series-1/books/book-1/body.txt');
      }
      expect(await db.bodies.get('book-1')).toMatchObject({ content: 'local edit' });
      expect(github.writeDataFiles).not.toHaveBeenCalled();
    } finally {
      await db.delete();
    }
  });
});
