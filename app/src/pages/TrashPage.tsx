import { useCallback, useEffect, useState } from 'react';
import Shell from '../components/Shell';
import StatusBadge from '../components/StatusBadge';
import type { Book } from '../lib/data/types';
import { repo, useLibrary } from '../stores/library';

const btn = 'rounded border border-slate-400 bg-white px-3 py-1.5 text-sm dark:border-slate-500 dark:bg-slate-800';

export default function TrashPage() {
  const { series, load } = useLibrary();
  const [items, setItems] = useState<Book[] | null>(null);

  const reload = useCallback(async () => {
    setItems(await repo.listTrashed());
    await load();
  }, [load]);
  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <Shell title="ゴミ箱" back={{ to: '/', label: '本棚' }}>
      {items && items.length === 0 && <p className="text-sm opacity-70">ゴミ箱は空です。</p>}
      <ul className="space-y-2">
        {items?.map((b) => (
          <li key={b.id} className="rounded-lg border border-slate-300 bg-white p-3 dark:border-slate-600 dark:bg-slate-800">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{b.title}</span>
              <StatusBadge status={b.status} />
            </div>
            <div className="mt-1 text-xs opacity-70">
              {series.find((s) => s.id === b.seriesId)?.title ?? '（シリーズなし）'}・{b.trashedAt?.slice(0, 10)} にゴミ箱へ
            </div>
            <div className="mt-2 flex gap-2">
              <button
                className={btn}
                onClick={async () => {
                  await repo.restoreBook(b.id);
                  await reload();
                }}
              >
                戻す
              </button>
              <button
                className={`${btn} text-rose-700 dark:text-rose-300`}
                onClick={async () => {
                  if (!window.confirm(`「${b.title}」を完全に削除します。本文と履歴も消え、元に戻せません。`)) return;
                  await repo.deleteForever(b.id);
                  await reload();
                }}
              >
                完全に削除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
