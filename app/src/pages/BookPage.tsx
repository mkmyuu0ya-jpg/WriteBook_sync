import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Shell from '../components/Shell';
import StatusBadge from '../components/StatusBadge';
import { hashText } from '../lib/data/hash';
import { modifiedAfterPost } from '../lib/data/status';
import { STATUS_LABEL, STATUS_ORDER, type Book, type Status } from '../lib/data/types';
import { outline, parse } from '../lib/parser/pixiv';
import { textStatistics } from '../lib/reader/statistics';
import { getGitHubSettings } from '../lib/sync/settings';
import { deleteGist, publishGist } from '../lib/sync/github';
import { db, repo } from '../stores/library';

const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800';
const btn = 'rounded border border-slate-400 bg-white px-3 py-1.5 text-sm dark:border-slate-500 dark:bg-slate-800';

export default function BookPage() {
  const { bookId = '' } = useParams();
  const nav = useNavigate();
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [body, setBody] = useState('');
  const [hash, setHash] = useState('');
  const [resume, setResume] = useState<number | undefined>();
  const [donePanel, setDonePanel] = useState(false);
  const [url, setUrl] = useState('');
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishMessage, setPublishMessage] = useState('');
  const [publishError, setPublishError] = useState('');

  const reload = useCallback(async () => {
    const b = (await repo.getBook(bookId)) ?? null;
    setBook(b);
    const text = await repo.getBody(bookId);
    setBody(text);
    setHash(await hashText(text));
    setResume((await repo.getProgress(bookId))?.line);
  }, [bookId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const blocks = useMemo(() => parse(body), [body]);
  const chapters = useMemo(() => outline(blocks), [blocks]);
  const statistics = useMemo(() => textStatistics(blocks), [blocks]);

  if (book === undefined) return <Shell title="読み込み中">{null}</Shell>;
  if (book === null || book.trashedAt) return <Shell title="本が見つかりません" back={{ to: '/', label: '本棚' }}>{null}</Shell>;

  async function choose(s: Status) {
    if (s === 'done' && book!.status !== 'done') {
      setDonePanel(true);
      return;
    }
    await repo.setStatus(bookId, s);
    await reload();
  }
  async function finishDone(record: boolean) {
    const pixiv = record ? { url: url.trim() || undefined, postedAt: new Date().toISOString(), postedHash: hash } : undefined;
    await repo.setStatus(bookId, 'done', pixiv);
    setDonePanel(false);
    setUrl('');
    await reload();
  }

  async function publish(update: boolean) {
    setPublishBusy(true);
    setPublishError('');
    setPublishMessage('');
    try {
      const currentBook = await repo.getBook(bookId);
      if (!currentBook) throw new Error('本が見つかりません。');
      const settings = await getGitHubSettings(db);
      if (!settings) throw new Error('先に同期設定でGitHub接続を設定してください。');
      const result = await publishGist(settings, currentBook.title, body, update ? currentBook.publish?.gistId : undefined);
      await repo.setPublish(bookId, {
        gistId: result.gistId,
        publishedAt: result.updatedAt,
        publishedHash: hash,
      });
      await reload();
      setPublishMessage('公開リンクを更新しました。閲覧側への反映には最大1分ほどかかる場合があります。');
    } catch (cause) {
      setPublishError(cause instanceof Error ? cause.message : '公開リンクを更新できませんでした。');
    } finally {
      setPublishBusy(false);
    }
  }

  async function stopPublishing() {
    setPublishBusy(true);
    setPublishError('');
    setPublishMessage('');
    try {
      const currentBook = await repo.getBook(bookId);
      if (!currentBook?.publish) throw new Error('公開リンクが見つかりません。');
      if (!window.confirm('公開リンクを停止しますか？ URLを知っている人が読めなくなるまで最大1分ほどかかる場合があります。')) return;
      const settings = await getGitHubSettings(db);
      if (!settings) throw new Error('GitHub接続設定が見つかりません。');
      await deleteGist(settings, currentBook.publish.gistId);
      await repo.setPublish(bookId, undefined);
      await reload();
      setPublishMessage('公開を停止しました。閲覧側への反映には最大1分ほどかかる場合があります。');
    } catch (cause) {
      setPublishError(cause instanceof Error ? cause.message : '公開を停止できませんでした。');
    } finally {
      setPublishBusy(false);
    }
  }

  return (
    <Shell title={book.title} back={{ to: `/s/${book.seriesId}`, label: 'シリーズ' }}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={book.status} />
        {modifiedAfterPost(book, hash) && (
          <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-900 dark:bg-rose-900/40 dark:text-rose-200">投稿後に修正あり</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="状態">
        {STATUS_ORDER.map((s) => (
          <button key={s} className={`${btn} ${book.status === s ? 'font-bold ring-2 ring-sky-500' : ''}`} onClick={() => choose(s)}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {donePanel && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-600 dark:bg-slate-800">
          <p>pixiv に投稿した場合は、記録しておけます（任意）。</p>
          <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="投稿の URL（なくてもよい）" />
          <div className="flex flex-wrap gap-2">
            <button className={btn} onClick={() => finishDone(true)}>
              投稿を記録して完了にする
            </button>
            <button className={btn} onClick={() => finishDone(false)}>
              記録せずに完了にする
            </button>
            <button className={btn} onClick={() => setDonePanel(false)}>
              やめる
            </button>
          </div>
        </div>
      )}
      {book.pixiv && (
        <p className="mt-3 text-xs opacity-70">
          pixiv の記録：{book.pixiv.postedAt?.slice(0, 10)} {book.pixiv.url}
        </p>
      )}

      <section className="mt-5 rounded-lg border border-slate-300 p-3 dark:border-slate-600" aria-labelledby="book-statistics-title">
        <h2 id="book-statistics-title" className="font-semibold">本文の統計</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="opacity-70">文字数</dt>
            <dd className="font-semibold">{statistics.characters.toLocaleString('ja-JP')} 字</dd>
          </div>
          <div>
            <dt className="opacity-70">行数</dt>
            <dd className="font-semibold">{statistics.lines.toLocaleString('ja-JP')} 行</dd>
          </div>
          <div>
            <dt className="opacity-70">段落数</dt>
            <dd className="font-semibold">{statistics.paragraphs.toLocaleString('ja-JP')} 段落</dd>
          </div>
          <div>
            <dt className="opacity-70">ページ数</dt>
            <dd className="font-semibold">{statistics.pages.toLocaleString('ja-JP')} ページ</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs opacity-70">文字数は空白・改行・記法を除き、ルビは本文側だけを数えます。</p>
      </section>

      <section className="mt-5 space-y-2 rounded-lg border border-slate-300 p-3 dark:border-slate-600">
        <h2 className="font-semibold">校正用公開リンク</h2>
        <p className="text-xs opacity-70">限定公開ですが、URLを知っている人は誰でも読めます。校正が終わったら公開を停止してください。</p>
        {book.publish ? (
          <>
            <p className="break-all text-sm">
              <a className="text-sky-700 underline dark:text-sky-300" href={`${window.location.origin}${window.location.pathname}#/p/${book.publish.gistId}`}>
                {`${window.location.origin}${window.location.pathname}#/p/${book.publish.gistId}`}
              </a>
            </p>
            {book.publish.publishedHash !== hash && <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">未反映の変更があります。</p>}
            <div className="flex flex-wrap gap-2">
              <button className={btn} disabled={publishBusy} onClick={() => void publish(true)}>公開内容を更新</button>
              <button className={btn} disabled={publishBusy} onClick={() => void stopPublishing()}>公開を停止</button>
            </div>
          </>
        ) : (
          <button className={btn} disabled={publishBusy} onClick={() => void publish(false)}>この本文で公開リンクを作る</button>
        )}
        {publishBusy && <p role="status" className="text-sm">GitHubに接続中…</p>}
        {publishMessage && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{publishMessage}</p>}
        {publishError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{publishError}</p>}
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link className={btn} to={`/b/${bookId}/read`}>
          最初から読む
        </Link>
        {resume !== undefined && (
          <Link className={btn} to={`/b/${bookId}/read?line=${resume}`}>
            続きから読む
          </Link>
        )}
        <Link className={btn} to={`/b/${bookId}/edit`}>
          加筆修正
        </Link>
        <Link className={btn} to={`/b/${bookId}/history`}>
          履歴
        </Link>
      </div>

      <h2 className="mt-6 text-sm font-semibold">目次</h2>
      {chapters.length === 0 ? (
        <p className="mt-1 text-sm opacity-70">見出し（[chapter:…]）がありません。</p>
      ) : (
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
          {chapters.map((c) => (
            <li key={c.line}>
              <Link className="text-sky-700 dark:text-sky-300" to={`/b/${bookId}/read?line=${c.line}`}>
                {c.title || '（無題）'}
              </Link>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-8">
        <button
          className={`${btn} text-rose-700 dark:text-rose-300`}
          onClick={async () => {
            await repo.trashBook(bookId);
            nav(`/s/${book.seriesId}`);
          }}
        >
          ゴミ箱に入れる
        </button>
      </div>
    </Shell>
  );
}
