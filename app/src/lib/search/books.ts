import type { Book, Body, Series } from '../data/types';

export type BookSearchResult = {
  book: Book;
  seriesTitle: string;
  line?: number;
  excerpt?: string;
  matchedIn: 'title' | 'body';
};

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ja-JP');
}

function findNormalizedIndex(value: string, query: string): number {
  let normalized = '';
  const sourceOffsets: number[] = [];
  let sourceOffset = 0;
  for (const character of value) {
    const part = normalize(character);
    for (let i = 0; i < part.length; i += 1) sourceOffsets.push(sourceOffset);
    normalized += part;
    sourceOffset += character.length;
  }
  const index = normalized.indexOf(query);
  return index < 0 ? -1 : sourceOffsets[index];
}

function excerptFor(line: string, query: string): string {
  const index = findNormalizedIndex(line, query);
  const start = Math.max(0, index - 48);
  const end = Math.min(line.length, start + 140);
  return `${start > 0 ? '…' : ''}${line.slice(start, end)}${end < line.length ? '…' : ''}`;
}

export function searchBooks(
  books: Book[],
  bodies: Body[],
  series: Series[],
  rawQuery: string,
): BookSearchResult[] {
  const query = normalize(rawQuery.trim());
  if (!query) return [];

  const bodiesByBook = new Map(bodies.map((body) => [body.bookId, body.content]));
  const seriesById = new Map(series.map((item) => [item.id, item.title]));
  const results: BookSearchResult[] = [];

  for (const book of books) {
    if (book.trashedAt) continue;
    const body = bodiesByBook.get(book.id) ?? '';
    const lines = body.split(/\r?\n/);
    const matchedLines = lines
      .map((line, index) => findNormalizedIndex(line, query) >= 0 ? index : -1)
      .filter((line) => line >= 0);
    const titleMatches = findNormalizedIndex(book.title, query) >= 0;
    const seriesTitle = seriesById.get(book.seriesId) ?? 'シリーズ不明';
    for (const line of matchedLines) {
      results.push({
        book,
        seriesTitle,
        matchedIn: 'body',
        line,
        excerpt: excerptFor(lines[line], query),
      });
    }
    if (matchedLines.length === 0 && titleMatches) {
      results.push({ book, seriesTitle, matchedIn: 'title' });
    }
  }

  return results;
}
