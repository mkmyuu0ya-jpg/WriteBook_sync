import { describe, expect, it } from 'vitest';
import { parse } from '../parser/pixiv';
import { textStatistics } from './statistics';

describe('textStatistics', () => {
  it('counts visible characters without whitespace or notation, using ruby base text only', () => {
    const blocks = parse('[chapter:第一章]\n本文 [[rb:漢字 > かんじ]]\n\n[newpage]\n「会話」');
    expect(textStatistics(blocks)).toEqual({
      characters: 11,
      lines: 5,
      paragraphs: 2,
      pages: 2,
    });
  });

  it('counts Unicode characters as code points', () => {
    expect(textStatistics(parse('A😀 B'))).toMatchObject({ characters: 3 });
  });

  it('counts formatted prose and link titles but not tag placeholders', () => {
    expect(textStatistics(parse('[b:太字][i:斜体][[emphasismark:傍点 > ﹅]][[jumpuri:表示文字 > https://example.com]][pixivimage:123]')))
      .toMatchObject({ characters: 10 });
  });

  it('reports an empty body as one line and one page', () => {
    expect(textStatistics(parse(''))).toEqual({
      characters: 0,
      lines: 1,
      paragraphs: 0,
      pages: 1,
    });
  });
});
