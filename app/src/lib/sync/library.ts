import type { BookDB } from '../data/db';
import type { Book, Series } from '../data/types';
import type { RemoteFile } from './github';

const ROOT = 'book/data/';
const HEAD_KEY = 'github-sync-head';
const BASE_KEY = 'github-sync-base';
const BACKUP_KEY = 'github-pre-sync-backup';
type RemoteBookRecord = Omit<Book, 'seriesId'>;

export type LibraryData = {
  series: Series[];
  books: Book[];
  bodies: Record<string, string>;
};

function jsonFile(path: string, value: unknown): { path: string; content: string } {
  return { path, content: `${JSON.stringify(value, null, 2)}\n` };
}

export async function readLocalLibrary(db: BookDB): Promise<LibraryData> {
  const [series, books, bodies] = await Promise.all([db.series.toArray(), db.books.toArray(), db.bodies.toArray()]);
  return {
    series,
    books,
    bodies: Object.fromEntries(bodies.map(({ bookId, content }) => [bookId, content])),
  };
}

export function serializeLibrary(data: LibraryData): Array<{ path: string; content: string }> {
  const series = [...data.series].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const files = [jsonFile(`${ROOT}library.json`, { schemaVersion: 1, seriesOrder: series.map((item) => item.id) })];

  for (const item of series) {
    const books = data.books
      .filter((book) => book.seriesId === item.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const seriesPath = `${ROOT}series/${item.id}/`;
    files.push(jsonFile(`${seriesPath}series.json`, { ...item, bookOrder: books.map((book) => book.id) }));
    for (const book of books) {
      const bookPath = `${seriesPath}books/${book.id}/`;
      const { seriesId: _seriesId, ...bookRecord } = book;
      files.push(jsonFile(`${bookPath}book.json`, bookRecord));
      files.push({ path: `${bookPath}body.txt`, content: data.bodies[book.id] ?? '' });
    }
  }
  return files;
}

function parseJson<T>(file: RemoteFile): T {
  try {
    return JSON.parse(file.content) as T;
  } catch {
    throw new Error(`JSON形式が不正です: ${file.path}`);
  }
}

function isSeries(value: unknown): value is Series & { bookOrder?: string[] } {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Series>;
  return typeof item.id === 'string' && typeof item.title === 'string' &&
    typeof item.createdAt === 'string' && typeof item.updatedAt === 'string';
}

function isBook(value: unknown): value is RemoteBookRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RemoteBookRecord>;
  return typeof item.id === 'string' && typeof item.title === 'string' &&
    (item.status === 'wip' || item.status === 'ready' || item.status === 'done') &&
    typeof item.createdAt === 'string' && typeof item.updatedAt === 'string';
}

export function parseRemoteLibrary(files: RemoteFile[]): LibraryData {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const libraryFile = byPath.get(`${ROOT}library.json`);
  if (!libraryFile) throw new Error('library.jsonがありません。GitHub上のデータ形式を確認してください。');
  const manifest = parseJson<{ schemaVersion?: number }>(libraryFile);
  if (manifest.schemaVersion !== 1) throw new Error('対応していないlibrary.jsonのスキーマです。');
  const seriesFiles = files.filter((file) => /^book\/data\/series\/[^/]+\/series\.json$/.test(file.path));
  const series: Series[] = [];
  const books: Book[] = [];
  const bodies: Record<string, string> = {};

  for (const file of seriesFiles) {
    const item = parseJson<unknown>(file);
    if (!isSeries(item)) throw new Error(`シリーズデータが不正です: ${file.path}`);
    const folderId = file.path.split('/')[3];
    if (item.id !== folderId) throw new Error(`シリーズIDとファイルパスが一致しません: ${file.path}`);
    const { bookOrder: _bookOrder, ...record } = item;
    series.push(record);
  }

  const bookFiles = files.filter((file) => /^book\/data\/series\/[^/]+\/books\/[^/]+\/book\.json$/.test(file.path));
  for (const file of bookFiles) {
    const item = parseJson<unknown>(file);
    if (!isBook(item)) throw new Error(`本のデータが不正です: ${file.path}`);
    const pathParts = file.path.split('/');
    const seriesId = pathParts[3];
    const bookId = pathParts[5];
    if (item.id !== bookId) throw new Error(`本のIDとファイルパスが一致しません: ${file.path}`);
    if (!series.some((entry) => entry.id === seriesId)) throw new Error(`本に対応するシリーズがありません: ${file.path}`);
    const bodyPath = `${file.path.slice(0, -'book.json'.length)}body.txt`;
    const body = byPath.get(bodyPath);
    if (!body) throw new Error(`本文ファイルがありません: ${bodyPath}`);
    books.push({ ...item, seriesId });
    bodies[item.id] = body.content;
  }

  return { series, books, bodies };
}

export async function replaceLocalLibrary(db: BookDB, data: LibraryData): Promise<void> {
  await db.transaction('rw', db.series, db.books, db.bodies, async () => {
    await db.series.clear();
    await db.books.clear();
    await db.bodies.clear();
    await db.series.bulkAdd(data.series);
    await db.books.bulkAdd(data.books);
    await db.bodies.bulkAdd(data.books.map((book) => ({ bookId: book.id, content: data.bodies[book.id] ?? '' })));
  });
}

export async function getSyncHead(db: BookDB): Promise<string | undefined> {
  return (await db.meta.get(HEAD_KEY))?.value;
}

export async function setSyncHead(db: BookDB, sha: string): Promise<void> {
  await db.meta.put({ key: HEAD_KEY, value: sha });
}

function canonicalContent(path: string, content: string): string {
  if (!path.endsWith('.json')) return content;
  try {
    return `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
  } catch {
    return content;
  }
}

export async function getSyncBase(db: BookDB): Promise<Record<string, string> | undefined> {
  const record = await db.meta.get(BASE_KEY);
  return record ? JSON.parse(record.value) as Record<string, string> : undefined;
}

export async function setSyncBase(
  db: BookDB,
  files: Array<{ path: string; content: string }>,
): Promise<void> {
  const base = Object.fromEntries(files.map(({ path, content }) => [path, canonicalContent(path, content)]));
  await db.meta.put({ key: BASE_KEY, value: JSON.stringify(base) });
}

export function canonicalizeFiles(files: Array<{ path: string; content: string }>): Array<{ path: string; content: string }> {
  return files.map(({ path, content }) => ({ path, content: canonicalContent(path, content) }));
}

export async function saveLocalBackup(db: BookDB): Promise<void> {
  const data = await readLocalLibrary(db);
  await db.meta.put({ key: BACKUP_KEY, value: JSON.stringify(data) });
}

export async function hasLocalBackup(db: BookDB): Promise<boolean> {
  return Boolean(await db.meta.get(BACKUP_KEY));
}

export async function downloadLocalBackup(db: BookDB): Promise<void> {
  const record = await db.meta.get(BACKUP_KEY);
  if (!record) throw new Error('同期前バックアップが見つかりません。');
  const file = new Blob([JSON.stringify(JSON.parse(record.value), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `book-local-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
