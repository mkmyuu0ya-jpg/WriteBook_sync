import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ReaderSettings = {
  /** true: 縦書き / false: 横書き */
  vert: boolean;
  /** 文字サイズ（px） */
  fs: number;
};

type Store = ReaderSettings & { update: (p: Partial<ReaderSettings>) => void };

export const useReaderSettings = create<Store>()(
  persist(
    (set) => ({
      vert: true,
      fs: 20,
      update: (p) => set(p),
    }),
    {
      name: 'book.reader',
      partialize: ({ vert, fs }) => ({ vert, fs }),
      merge: (persistedState, currentState) => {
        const stored = persistedState && typeof persistedState === 'object' ? persistedState : {};
        return {
          ...currentState,
          vert: 'vert' in stored && typeof stored.vert === 'boolean' ? stored.vert : currentState.vert,
          fs: 'fs' in stored && typeof stored.fs === 'number' ? stored.fs : currentState.fs,
        };
      },
    },
  ),
);
