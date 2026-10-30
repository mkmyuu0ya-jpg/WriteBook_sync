import { describe, expect, it } from 'vitest';
import { pages, parse } from '../parser/pixiv';
import { pageIndexForLine } from './lineNavigation';

describe('pageIndexForLine', () => {
  const bookPages = pages(parse('first\n[newpage]\nsecond\nthird'));

  it('finds the page that contains the requested zero-based line', () => {
    expect(pageIndexForLine(bookPages, 0)).toBe(0);
    expect(pageIndexForLine(bookPages, 2)).toBe(1);
    expect(pageIndexForLine(bookPages, 3)).toBe(1);
  });

  it('uses the following page when the requested line is a page break', () => {
    expect(pageIndexForLine(bookPages, 1)).toBe(1);
  });

  it('defaults to the first page when no line is requested', () => {
    expect(pageIndexForLine(bookPages, undefined)).toBe(0);
  });
});
