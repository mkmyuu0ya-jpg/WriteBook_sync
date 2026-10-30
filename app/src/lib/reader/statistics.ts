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
  return items.reduce((count, item) => {
    if (item.t === 'ruby') return count + visibleCharacterCount(item.base);
    if (item.t === 'text' || item.t === 'bold' || item.t === 'italic' || item.t === 'emphasis') {
      return count + visibleCharacterCount(item.s);
    }
    if (item.t === 'link') return count + visibleCharacterCount(item.title);
    return count;
  }, 0);
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
