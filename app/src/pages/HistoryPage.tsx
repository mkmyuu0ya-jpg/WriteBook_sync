import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Shell from '../components/Shell';
import { collapse, diffLines, diffStats } from '../lib/diff/lines';
import type { Book, Snapshot } from '../lib/data/types';
import { getGitHubSettings } from '../lib/sync/settings';
import { listFileCommits, readFileAtCommit, type FileCommit } from '../lib/sync/github';
import { db, repo } from '../stores/library';

const btn = 'rounded border border-slate-400 bg-white px-3 py-1.5 text-sm dark:border-slate-500 dark:bg-slate-800';
const REASON: Record<Snapshot['reason'], string> = { 'edit-start': '編集前', restore: '戻す前', manual: '手動' };

/** 端末内の履歴（編集前のスナップショット）から戻す。GitHub の履歴は Phase 2 で加える。 */
export default function HistoryPage() {
  const { bookId = '' } = useParams();
  const nav = useNavigate();
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [body, setBody] = useState('');
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [sel, setSel] = useState<number | undefined>();
  const [note, setNote] = useState('');
  const [githubCommits, setGithubCommits] = useState<FileCommit[]>([]);
  const [githubSelection, setGithubSelection] = useState<FileCommit | null>(null);
  const [githubBody, setGithubBody] = useState<string | null>(null);
  const [githubError, setGithubError] = useState('');
  const [githubLoading, setGithubLoading] = useState(false);

  const reload = useCallback(async () => {
    const currentBook = (await repo.getBook(bookId)) ?? null;
    setBook(currentBook);
    setBody(await repo.getBody(bookId));
    const list = await repo.listSnapshots(bookId);
    setSnaps(list);
    setSel((cur) => (cur !== undefined && list.some((x) => x.id === cur) ? cur : list[0]?.id));
    if (currentBook) {
      const settings = await getGitHubSettings(db);
      if (settings) {
        try {
          setGithubCommits(await listFileCommits(
            settings,
            `book/data/series/${currentBook.seriesId}/books/${currentBook.id}/body.txt`,
          ));
          setGithubError('');
        } catch (cause) {
          setGithubError(cause instanceof Error ? cause.message : 'GitHubの履歴を取得できませんでした。');
        }
      }
    }
  }, [bookId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const chosen = snaps.find((x) => x.id === sel);
  const chosenContent = githubSelection ? githubBody : chosen?.content;
  // 「いまの本文」から「この版」へ変えるとどうなるか（赤＝戻すと消える行、緑＝戻すと現れる行）
  const ops = useMemo(() => (chosenContent !== undefined && chosenContent !== null ? diffLines(body, chosenContent) : []), [body, chosenContent]);
  const rows = useMemo(() => collapse(ops), [ops]);
  const stats = diffStats(ops);

  if (book === undefined) return <Shell title="読み込み中">{null}</Shell>;
  if (book === null) return <Shell title="本が見つかりません" back={{ to: '/', label: '本棚' }}>{null}</Shell>;
  return (
    <Shell title="履歴" back={{ to: `/b/${bookId}`, label: book.title }}>
      <p className="text-xs opacity-70">端末内の履歴です（編集を始めるたびに、その時点の本文を最大 10 件まで残します）。</p>
      {snaps.length === 0 && <p className="mt-3 text-sm opacity-70">まだ履歴がありません。加筆修正モードで編集すると残ります。</p>}
      <ul className="mt-3 space-y-1" aria-label="履歴の一覧">
        {snaps.map((x) => (
          <li key={x.id}>
            <button
              className={`${btn} w-full text-left ${x.id === sel ? 'font-bold ring-2 ring-sky-500' : ''}`}
              onClick={() => {
                setSel(x.id);
                setGithubSelection(null);
                setGithubBody(null);
              }}
            >
              {new Date(x.savedAt).toLocaleString('ja-JP')}　{REASON[x.reason]}　{x.content.length} 字
            </button>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 font-semibold">GitHubの履歴</h2>
      <p className="text-xs opacity-70">GitHubへ同期した時点の本文です。復元後は「同期設定」から同期してください。</p>
      {githubError && <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{githubError}</p>}
      {githubCommits.length === 0 && !githubError && <p className="mt-2 text-sm opacity-70">GitHubの履歴はありません（未同期、または初回同期前の可能性があります）。</p>}
      <ul className="mt-2 space-y-1" aria-label="GitHubの履歴">
        {githubCommits.map((commit) => (
          <li key={commit.sha}>
            <button
              className={`${btn} w-full text-left ${githubSelection?.sha === commit.sha ? 'font-bold ring-2 ring-sky-500' : ''}`}
              disabled={githubLoading}
              onClick={async () => {
                setGithubLoading(true);
                setGithubError('');
                try {
                  const settings = await getGitHubSettings(db);
                  if (!settings) throw new Error('GitHubの接続設定がありません。');
                  const content = await readFileAtCommit(
                    settings,
                    `book/data/series/${book.seriesId}/books/${book.id}/body.txt`,
                    commit.sha,
                  );
                  setGithubSelection(commit);
                  setGithubBody(content);
                  setSel(undefined);
                } catch (cause) {
                  setGithubError(cause instanceof Error ? cause.message : '本文の取得に失敗しました。');
                } finally {
                  setGithubLoading(false);
                }
              }}
            >
              {new Date(commit.date).toLocaleString('ja-JP')}　{commit.sha.slice(0, 7)}　{commit.message}
            </button>
          </li>
        ))}
      </ul>

      {chosenContent !== undefined && chosenContent !== null && (
        <div className="mt-4">
          <h2 className="font-semibold">{githubSelection ? 'GitHubの版' : '端末内の版'}</h2>
          <p className="text-sm" data-testid="diff-summary">
            この版に戻すと：<span className="text-emerald-700 dark:text-emerald-300">＋{stats.add} 行</span>
            {'　'}
            <span className="text-rose-700 dark:text-rose-300">−{stats.del} 行</span>
          </p>
          <p className="text-xs opacity-70">赤は戻すと消える行、緑は戻すと現れる行です。</p>
          <div className="mt-2 max-h-80 overflow-auto rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800" data-testid="diff">
            {rows.length === 1 && rows[0].t === 'skip' && <p className="opacity-70">いまの本文と同じです。</p>}
            {rows.map((r, i) =>
              r.t === 'skip' ? (
                <div key={i} className="py-0.5 text-center text-xs opacity-60">
                  … {r.n} 行 …
                </div>
              ) : (
                <div
                  key={i}
                  className={`whitespace-pre-wrap break-all px-1 ${
                    r.t === 'add' ? 'bg-emerald-100 dark:bg-emerald-900/30' : r.t === 'del' ? 'bg-rose-100 dark:bg-rose-900/30' : 'opacity-70'
                  }`}
                >
                  {r.t === 'add' ? '＋ ' : r.t === 'del' ? '－ ' : '　 '}
                  {r.text === '' ? '（空行）' : r.text}
                </div>
              ),
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className={btn}
              onClick={async () => {
                if (!window.confirm('この版に戻します。いまの本文も履歴に残るので、あとで元に戻せます。')) return;
                if (githubSelection && githubBody !== null) {
                  await repo.addSnapshot(bookId, body, 'restore');
                  await repo.setBody(bookId, githubBody);
                  setNote('端末内の本文をGitHubの版に戻しました。GitHubにも反映するには同期してください。');
                } else if (chosen?.id !== undefined) {
                  await repo.restoreSnapshot(bookId, chosen.id);
                  setNote('戻しました。戻す前の本文も履歴に残しています。');
                }
                await reload();
              }}
            >
              この版に戻す
            </button>
            <button className={btn} onClick={() => nav(`/b/${bookId}`)}>
              本の詳細へ
            </button>
            {note && <span className="text-sm text-emerald-700 dark:text-emerald-300">{note}</span>}
          </div>
        </div>
      )}
    </Shell>
  );
}
