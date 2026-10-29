import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Shell from '../components/Shell';
import StatusBadge from '../components/StatusBadge';
import { STATUS_LABEL, STATUS_ORDER, type Status } from '../lib/data/types';
import { repo, useLibrary } from '../stores/library';

const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800';
const btn = 'rounded border border-slate-400 bg-white px-3 py-1.5 text-sm dark:border-slate-500 dark:bg-slate-800';

export default function SeriesPage() {
  const { seriesId = '' } = useParams();
  const { series, books, ready, load } = useLibrary();
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  useEffect(() => {
    void load();
  }, [load]);

  const s = series.find((x) => x.id === seriesId);
  const mine = books.filter((b) => b.seriesId === seriesId);
  const shown = filter === 'all' ? mine : mine.filter((b) => b.status === filter);

  if (ready && !s) return <Shell title="シリーズが見つかりません" back={{ to: '/', label: '本棚' }}>{null}</Shell>;
  return (
    <Shell title={s?.title ?? ''} back={{ to: '/', label: '本棚' }}>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="絞り込み">
        {(['all', ...STATUS_ORDER] as const).map((f) => (
          <button
            key={f}
            className={`${btn} ${filter === f ? 'font-bold ring-2 ring-sky-500' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'すべて' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>
      {ready && shown.length === 0 && <p className="text-sm opacity-70">該当する本がありません。</p>}
      <ul className="space-y-2">
        {shown.map((b) => (
          <li key={b.id}>
            <Link to={`/b/${b.id}`} className="flex items-center justify-between rounded-lg border border-slate-300 bg-white p-3 dark:border-slate-600 dark:bg-slate-800">
              <span className="font-semibold">{b.title}</span>
              <StatusBadge status={b.status} />
            </Link>
          </li>
        ))}
      </ul>
      <form
        className="mt-6 space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await repo.addBook(seriesId, title, body);
          setTitle('');
          setBody('');
          await load();
        }}
      >
        <label className="block text-sm">本を追加（本文は貼り付けでよい）</label>
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="本のタイトル" />
        <textarea className={`${input} h-40 font-mono text-base`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="本文（pixiv 記法のまま貼り付けられます）" />
        <button className={btn} type="submit">
          追加
        </button>
      </form>
    </Shell>
  );
}
