import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ReaderSettings = {
  /** true: 縦書き / false: 横書き */
  vert: boolean;
  /** true: ページ送り / false: スクロール */
  paged: boolean;
  /** 文字サイズ（px） */
  fs: number;
};

type Store = ReaderSettings & { update: (p: Partial<ReaderSettings>) => void };

export const useReaderSettings = create<Store>()(
  persist(
    (set) => ({
      vert: true,
      paged: true,
      fs: 20,
      update: (p) => set(p),
    }),
    { name: 'book.reader' },
  ),
);
