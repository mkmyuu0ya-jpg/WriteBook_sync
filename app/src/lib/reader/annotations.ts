export type ProofreadingNote = {
  id: number;
  pageIndex: number;
  line: number;
  from: number;
  to: number;
  quote: string;
  comment: string;
};

export function formatProofreadingNotes(notes: ProofreadingNote[]): string {
  return notes
    .map((note, index) =>
      [
        `${index + 1}. ${note.pageIndex + 1}ページ目・本文${note.line + 1}行目`,
        `引用:「${note.quote}」`,
        `指摘: ${note.comment}`,
      ].join('\n'),
    )
    .join('\n\n');
}
