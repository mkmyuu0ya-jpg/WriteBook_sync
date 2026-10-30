import { pages, type Block, type Inline } from '../parser/pixiv';

export type TextStatistics = {
  characters: number;
  lines: number;
  paragraphs: number;
  pages: number;
};

function visibleCharacterCount(text: string): number {
  return Array.from(text).filter((character) => !/\s/u.test(character)).length;
}

function inlineCharacterCount(items: Inline[]): number {
  return items.reduce((count, item) => count + visibleCharacterCount(item.t === 'ruby' ? item.base : item.s), 0);
}

export function textStatistics(blocks: Block[]): TextStatistics {
  const characters = blocks.reduce((count, block) => {
    if (block.t === 'chapter') return count + visibleCharacterCount(block.title);
    if (block.t === 'para') return count + inlineCharacterCount(block.inlines);
    return count;
  }, 0);

  return {
    characters,
    lines: blocks.length,
    paragraphs: blocks.filter((block) => block.t === 'para').length,
    pages: pages(blocks).length,
  };
}
