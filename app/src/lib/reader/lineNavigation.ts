import type { Block } from '../parser/pixiv';

export function pageIndexForLine(bookPages: Block[][], line: number | undefined): number {
  if (line === undefined) return 0;
  const index = bookPages.findIndex((page) => page.some((block) => block.line >= line));
  return index < 0 ? bookPages.length - 1 : index;
}
