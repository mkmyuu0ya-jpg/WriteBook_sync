import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import { countByStatus } from '../lib/data/status';
import { repo, useLibrary } from '../stores/library';

const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800';
const btn = 'rounded border border-slate-400 bg-white px-3 py-1.5 text-sm dark:border-slate-500 dark:bg-slate-800';

export default function Home() {
  const { series, books, ready, load } = useLibrary();
  const [title, setTitle] = useState('');
  const [trashed, setTrashed] = useState(0);
  useEffect(() => {
    void load();
    void repo.listTrashed().then((t) => setTrashed(t.length));
  }, [load]);

  return (
    <Shell title="本棚">
      {ready && series.length === 0 && <p className="text-sm opacity-70">まだシリーズがありません。下から追加してください。</p>}
      <ul className="space-y-2">
        {series.map((s) => {
          const mine = books.filter((b) => b.seriesId === s.id);
          const c = countByStatus(mine);
          return (
            <li key={s.id}>
              <Link to={`/s/${s.id}`} className="block rounded-lg border border-slate-300 bg-white p-3 dark:border-slate-600 dark:bg-slate-800">
                <div className="font-semibold">{s.title}</div>
                <div className="mt-1 text-xs opacity-70">
                  {mine.length} 冊（未完成 {c.wip}・完成 {c.ready}・完了 {c.done}）
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-6 space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await repo.addSeries(title);
          setTitle('');
          await load();
        }}
      >
        <label className="block text-sm">シリーズを追加</label>
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="シリーズ名" />
        <button className={btn} type="submit">
          追加
        </button>
      </form>
      <div className="mt-8 text-sm">
        <div className="flex gap-4">
          <Link to="/trash" className="text-sky-700 dark:text-sky-300">
            ゴミ箱{trashed > 0 ? `（${trashed}）` : ''}
          </Link>
          <Link to="/settings" className="text-sky-700 dark:text-sky-300">同期設定</Link>
        </div>
      </div>
    </Shell>
  );
}
