import { describe, expect, it } from 'vitest';
import { outline, pages, parse, parseInline } from './pixiv';

describe('parseInline', () => {
  it('ルビを取り出す', () => {
    expect(parseInline('夜の[[rb:駅 > えき]]には')).toEqual([
      { t: 'text', s: '夜の' },
      { t: 'ruby', base: '駅', rt: 'えき' },
      { t: 'text', s: 'には' },
    ]);
  });
  it('1 行に複数のルビがあっても取り出せる', () => {
    const r = parseInline('[[rb:誰 > だれ]]も[[rb:来 > こ]]ない');
    expect(r.filter((x) => x.t === 'ruby')).toHaveLength(2);
  });
  it('ルビの前後の空白は取り除く', () => {
    expect(parseInline('[[rb:漢字  >  かんじ ]]')).toEqual([{ t: 'ruby', base: '漢字', rt: 'かんじ' }]);
  });
  it('本文装飾・リンク・挿絵タグを解釈する', () => {
    expect(parseInline('[b:太字][i:斜体][[emphasismark:傍点 > ○]][jump:2][[jumpuri:外部 > https://example.com]][pixivimage:123-2][uploadedimage:abc]')).toEqual([
      { t: 'bold', s: '太字' },
      { t: 'italic', s: '斜体' },
      { t: 'emphasis', s: '傍点', mark: '○' },
      { t: 'jump', page: 2 },
      { t: 'link', title: '外部', url: 'https://example.com' },
      { t: 'image', source: 'pixiv', id: '123-2' },
      { t: 'image', source: 'uploaded', id: 'abc' },
    ]);
  });
  it('未対応のタグは文字のまま残す', () => {
    expect(parseInline('[unknown:123]を貼る')).toEqual([{ t: 'text', s: '[unknown:123]を貼る' }]);
  });
});

describe('parse', () => {
  it('章見出し・改ページ・空行・段落に分ける', () => {
    const b = parse('[chapter:第一章]\n本文\n\n[newpage]\n「会話」');
    expect(b.map((x) => x.t)).toEqual(['chapter', 'para', 'blank', 'newpage', 'para']);
    expect(b[0]).toMatchObject({ t: 'chapter', title: '第一章' });
  });
  it('「 で始まる行は会話として扱う', () => {
    const b = parse('「やあ」\n地の文');
    expect(b[0]).toMatchObject({ quote: true });
    expect(b[1]).toMatchObject({ quote: false });
  });
  it('CRLF でも同じ結果になる', () => {
    expect(parse('a\r\n[newpage]\r\nb').map((x) => x.t)).toEqual(['para', 'newpage', 'para']);
  });
  it('行番号を保持する', () => {
    expect(parse('a\n\nb').map((x) => x.line)).toEqual([0, 1, 2]);
  });
});

describe('pages / outline', () => {
  it('[newpage] でページを分ける', () => {
    const p = pages(parse('a\n[newpage]\nb\nc'));
    expect(p).toHaveLength(2);
    expect(p[1]).toHaveLength(2);
  });
  it('ページ境界は [newpage] の数だけ作る', () => {
    const p = pages(parse('a\n[newpage]\nb\n[newpage]\nc'));
    expect(p.map((page) => page.map((block) => block.line))).toEqual([[0], [2], [4]]);
  });
  it('末尾の [newpage] のあとに空ページを作らない', () => {
    expect(pages(parse('a\n[newpage]'))).toHaveLength(1);
  });
  it('空の本文でも 1 ページ', () => {
    expect(pages(parse(''))).toHaveLength(1);
  });
  it('見出しの一覧を作る', () => {
    expect(outline(parse('[chapter:一]\nx\n[chapter:二]'))).toEqual([
      { title: '一', line: 0 },
      { title: '二', line: 2 },
    ]);
  });
});
