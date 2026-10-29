import { create } from 'zustand';
import { BookDB } from '../lib/data/db';
import { createRepo } from '../lib/data/repo';
import type { Book, Series } from '../lib/data/types';

/** アプリ全体で使うデータ操作（端末内の IndexedDB）。 */
export const db = new BookDB();
export const repo = createRepo(db);

type State = {
  ready: boolean;
  series: Series[];
  /** ゴミ箱を除く、すべての本 */
  books: Book[];
  load: () => Promise<void>;
};

export const useLibrary = create<State>((set) => ({
  ready: false,
  series: [],
  books: [],
  load: async () => {
    const [series, books] = await Promise.all([repo.listSeries(), repo.listBooks()]);
    set({ series, books, ready: true });
  },
}));
