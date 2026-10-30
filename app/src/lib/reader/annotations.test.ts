import { describe, expect, it } from 'vitest';
import { formatProofreadingNotes, type ProofreadingNote } from './annotations';

describe('formatProofreadingNotes', () => {
  it('includes page, source line, quotation, and comment for each note', () => {
    const notes: ProofreadingNote[] = [
      { id: 1, pageIndex: 0, line: 2, from: 0, to: 4, quote: '引用文', comment: '表現を確認' },
      { id: 2, pageIndex: 2, line: 8, from: 5, to: 9, quote: '別の箇所', comment: '誤字かも' },
    ];

    expect(formatProofreadingNotes(notes)).toBe(
      '1. 1ページ目・本文3行目\n引用:「引用文」\n指摘: 表現を確認\n\n' +
        '2. 3ページ目・本文9行目\n引用:「別の箇所」\n指摘: 誤字かも',
    );
  });

  it('returns an empty string when there are no notes', () => {
    expect(formatProofreadingNotes([])).toBe('');
  });
});
