import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Shell from '../components/Shell';
import StatusBadge from '../components/StatusBadge';
import { STATUS_LABEL, STATUS_ORDER, type Status } from '../lib/data/types';
import type { BookSearchResult } from '../lib/search/books';
import { repo, useLibrary } from '../stores/library';

const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800';
const btn = 'rounded border border-slate-400 bg-white px-3 py-1.5 text-sm dark:border-slate-500 dark:bg-slate-800';

export default function SeriesPage() {
  const { seriesId = '' } = useParams();
  const { series, books, ready, load } = useLibrary();
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setResults([]);
      setSearchError('');
      setSearching(false);
      return;
    }

    let active = true;
    setSearching(true);
    setResults([]);
    setSearchError('');
    const timer = window.setTimeout(() => {
      void repo.searchBooks(seriesId, value).then((matches) => {
        if (active) setResults(matches);
      }).catch((cause: unknown) => {
        console.error('Series book search failed:', cause);
        if (active) setSearchError('検索に失敗しました。ページを再読み込みして、もう一度お試しください。');
      }).finally(() => {
        if (active) setSearching(false);
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, seriesId]);

  const s = series.find((x) => x.id === seriesId);
  const mine = books.filter((b) => b.seriesId === seriesId);
  const shown = filter === 'all' ? mine : mine.filter((b) => b.status === filter);

  if (ready && !s) return <Shell title="シリーズが見つかりません" back={{ to: '/', label: '本棚' }}>{null}</Shell>;
  return (
    <Shell title={s?.title ?? ''} back={{ to: '/', label: '本棚' }}>
      <section className="mb-5 rounded-lg border border-slate-300 p-3 dark:border-slate-600" aria-labelledby="series-search-title">
        <h2 id="series-search-title" className="font-semibold">このシリーズの本文を検索</h2>
        <label className="sr-only" htmlFor="series-book-search">このシリーズ内のタイトル・本文を検索</label>
        <input
          id="series-book-search"
          className={`${input} mt-2`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="表記を検索"
          autoComplete="off"
        />
        <p className="mt-1 text-xs opacity-70">本文の一致箇所を確認して、表記ゆれを探せます。</p>
        {searching && <p className="mt-2 text-sm" role="status">検索中…</p>}
        {searchError && <p className="mt-2 text-sm text-rose-700 dark:text-rose-300" role="alert">{searchError}</p>}
        {!searching && !searchError && query.trim() && results.length === 0 && (
          <p className="mt-2 text-sm" role="status">該当する本はありません。</p>
        )}
        {results.length > 0 && (
          <ul className="mt-3 space-y-2" aria-label="シリーズ内検索結果">
            {results.map(({ book, line, excerpt }) => (
              <li key={`${book.id}-${line ?? 'title'}`} className="rounded border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="font-semibold text-sky-700 underline dark:text-sky-300" to={`/b/${book.id}`}>
                    {book.title}
                  </Link>
                  <StatusBadge status={book.status} />
                </div>
                {excerpt !== undefined && line !== undefined && (
                  <>
                    <p className="mt-2 break-words text-sm">{excerpt}</p>
                    <Link
                      className="mt-2 inline-block text-sm text-sky-700 underline dark:text-sky-300"
                      to={`/b/${book.id}/read?line=${line}`}
                    >
                      本文の{line + 1}行目を開く
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
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
