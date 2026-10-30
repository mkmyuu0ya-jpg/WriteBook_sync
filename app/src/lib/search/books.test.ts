import { describe, expect, it } from 'vitest';
import type { Book, Body, Series } from '../data/types';
import { searchBooks } from './books';

const series: Series[] = [
  { id: 's1', title: '連載', createdAt: '', updatedAt: '' },
];
const books: Book[] = [
  { id: 'b1', seriesId: 's1', title: '夜明け', status: 'wip', createdAt: '', updatedAt: '' },
  { id: 'b2', seriesId: 's1', title: '海辺', status: 'ready', createdAt: '', updatedAt: '' },
  { id: 'b3', seriesId: 's1', title: '削除済み', status: 'wip', trashedAt: '2026-01-01', createdAt: '', updatedAt: '' },
  { id: 'b4', seriesId: 's1', title: '題名だけ', status: 'wip', createdAt: '', updatedAt: '' },
];
const bodies: Body[] = [
  { bookId: 'b1', content: '静かな夜\n夜明けの町\n夜明けを待つ' },
  { bookId: 'b2', content: '海辺で待つ\n星を探す' },
  { bookId: 'b3', content: '海辺の記録' },
];

describe('searchBooks', () => {
  it('finds title and body matches with line information and series context', () => {
    expect(searchBooks(books, bodies, series, '夜明け')).toEqual([
      {
        book: books[0],
        seriesTitle: '連載',
        matchedIn: 'body',
        line: 1,
        excerpt: '夜明けの町',
      },
      {
        book: books[0],
        seriesTitle: '連載',
        matchedIn: 'body',
        line: 2,
        excerpt: '夜明けを待つ',
      },
    ]);
    expect(searchBooks(books, bodies, series, '海辺')[0]).toMatchObject({
      book: books[1],
      matchedIn: 'body',
      line: 0,
    });
  });

  it('matches title-only results and excludes trashed books', () => {
    expect(searchBooks(books, bodies, series, '題名だけ')).toMatchObject([
      { book: books[3], matchedIn: 'title' },
    ]);
    expect(searchBooks(books, bodies, series, '削除済み')).toHaveLength(0);
  });

  it('normalizes width and case and returns no results for a blank query', () => {
    expect(searchBooks(books, bodies, series, '   ')).toEqual([]);
    expect(searchBooks(
      [{ ...books[0], title: 'ＡＢＣ' }],
      [],
      series,
      'abc',
    )).toHaveLength(1);
  });
});
