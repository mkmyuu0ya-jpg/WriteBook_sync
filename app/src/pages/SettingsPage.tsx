import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import { getGitHubSettings, saveGitHubSettings } from '../lib/sync/settings';
import { verifyToken, type GitHubSettings } from '../lib/sync/github';
import { initializeSync, type InitialSyncChoice } from '../lib/sync/initialSync';
import { downloadLocalBackup, getSyncBase, getSyncHead, hasLocalBackup } from '../lib/sync/library';
import { getAutoSyncStatus, setAutoSyncStatus, type AutoSyncStatus } from '../lib/sync/runtime';
import { synchronizeLibrary } from '../lib/sync/synchronize';
import type { MergePlan } from '../lib/sync/merge';
import { db } from '../stores/library';

const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800';
const button = 'rounded border border-slate-400 bg-white px-3 py-1.5 text-sm dark:border-slate-500 dark:bg-slate-800';

const EMPTY: GitHubSettings = { owner: 'mkmyuu0ya-jpg', repo: 'app', branch: 'main', token: '' };

export default function SettingsPage() {
  const [settings, setSettings] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [syncHead, setSyncHeadState] = useState<string | undefined>();
  const [syncBaseReady, setSyncBaseReady] = useState(false);
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [conflictPlan, setConflictPlan] = useState<MergePlan | null>(null);
  const [conflictChoices, setConflictChoices] = useState<Record<string, 'local' | 'github'>>({});
  const [autoStatus, setAutoStatus] = useState<AutoSyncStatus | undefined>();

  useEffect(() => {
    const onStatusChange = (event: Event) => {
      setAutoStatus((event as CustomEvent<AutoSyncStatus>).detail);
    };
    window.addEventListener('book-sync-status-changed', onStatusChange);
    void getGitHubSettings(db).then(async (stored) => {
      if (stored) {
        setSettings(stored);
        setSettingsSaved(true);
      }
      setSyncHeadState(await getSyncHead(db));
      setSyncBaseReady(Boolean(await getSyncBase(db)));
      setBackupAvailable(await hasLocalBackup(db));
      setAutoStatus(await getAutoSyncStatus(db));
      setReady(true);
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : '設定を読み込めませんでした。');
      setReady(true);
    });
    return () => window.removeEventListener('book-sync-status-changed', onStatusChange);
  }, []);

  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const clean = {
        owner: settings.owner.trim(),
        repo: settings.repo.trim(),
        branch: settings.branch.trim(),
        token: settings.token.trim(),
      };
      if (!clean.owner || !clean.repo || !clean.branch || !clean.token) {
        throw new Error('Owner、Repository、Branch、PATをすべて入力してください。');
      }
      await verifyToken(clean);
      const previous = await getGitHubSettings(db);
      if (previous && `${previous.owner}/${previous.repo}@${previous.branch}` !== `${clean.owner}/${clean.repo}@${clean.branch}`) {
        await db.meta.bulkDelete(['github-sync-head', 'github-sync-base']);
        setSyncHeadState(undefined);
        setSyncBaseReady(false);
      }
      await saveGitHubSettings(db, clean);
      setSettings(clean);
      setSettingsSaved(true);
      setMessage('接続を確認し、設定をこの端末に保存しました。');
      window.dispatchEvent(new Event('book-sync-configured'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '設定を保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  async function sync(choice?: InitialSyncChoice, choices?: Record<string, 'local' | 'github'>) {
    setSyncBusy(true);
    setError('');
    setSyncMessage('');
    try {
      if (syncHead && syncBaseReady) {
        const result = await synchronizeLibrary(db, settings, choices);
        if (result.status === 'conflicts') {
          setConflictPlan(result.plan);
          setConflictChoices({});
          setSyncMessage('同じファイルがこの端末とGitHubの両方で変更されています。各競合で採用する側を選んでください。');
          const nextStatus = {
            state: 'conflicts' as const,
            message: `同期競合 ${result.plan.conflicts.length} 件。採用側を選択してください。`,
            updatedAt: new Date().toISOString(),
          };
          await setAutoSyncStatus(db, nextStatus);
          setAutoStatus(nextStatus);
        } else {
          setConflictPlan(null);
          setConflictChoices({});
          setSyncHeadState(result.head);
          setSyncBaseReady(true);
          setBackupAvailable(await hasLocalBackup(db));
          const directions = [result.pulled ? 'GitHubの変更を取得' : '', result.pushed ? 'この端末の変更を送信' : '']
            .filter(Boolean);
          setSyncMessage(directions.length ? `${directions.join('・')}しました。` : '変更はありません。最新状態です。');
          const nextStatus = { state: 'complete' as const, message: '手動同期が完了しました。', updatedAt: new Date().toISOString() };
          await setAutoSyncStatus(db, nextStatus);
          setAutoStatus(nextStatus);
        }
      } else {
        const result = await initializeSync(db, settings, choice);
        if (result.status === 'choice-required') {
          setSyncMessage('両方にデータがあります。同期元を選んでください。GitHubを選ぶと、ローカルデータのバックアップをダウンロードしてから置き換えます。');
        } else {
          setSyncHeadState(await getSyncHead(db));
          setSyncBaseReady(Boolean(await getSyncBase(db)));
          setBackupAvailable(await hasLocalBackup(db));
          setSyncMessage(result.direction === 'empty'
            ? '同期先は空で、ローカルにもデータがありません。先にシリーズと本を作成してから、初回同期を再実行してください。'
            : result.direction === 'github'
              ? 'GitHubのデータをこの端末に取り込みました。'
              : 'この端末のデータをGitHubに保存しました。');
          if (result.direction !== 'empty') window.dispatchEvent(new Event('book-sync-configured'));
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '初回同期に失敗しました。');
    } finally {
      setSyncBusy(false);
    }
  }

  function updateSettings(patch: Partial<GitHubSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
    setSettingsSaved(false);
  }

  return (
    <Shell title="同期設定" back={{ to: '/', label: '本棚' }}>
      {!ready ? <p>読み込み中…</p> : (
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <p className="text-sm">Fine-grained PATはこの端末のIndexedDBに保存されます。コードやGitHubには保存しません。対象リポジトリを限定し、有効期限を設定してください。</p>
          <label className="block text-sm">Owner<input className={input} autoComplete="off" value={settings.owner} onChange={(e) => updateSettings({ owner: e.target.value })} /></label>
          <label className="block text-sm">Repository<input className={input} autoComplete="off" value={settings.repo} onChange={(e) => updateSettings({ repo: e.target.value })} /></label>
          <label className="block text-sm">Branch<input className={input} autoComplete="off" value={settings.branch} onChange={(e) => updateSettings({ branch: e.target.value })} /></label>
          <label className="block text-sm">Fine-grained PAT<input className={input} type="password" autoComplete="new-password" value={settings.token} onChange={(e) => updateSettings({ token: e.target.value })} /></label>
          <p className="text-xs opacity-70">必要な権限：ContentsとGistsのRead and write。有効期限を設定し、対象リポジトリを限定してください。</p>
          <button className={button} disabled={busy} type="submit">{busy ? '確認中…' : '接続を確認して保存'}</button>
          {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        </form>
      )}
      {ready && settingsSaved && settings.token && (
        <section className="mt-8 space-y-3 border-t border-slate-300 pt-4 dark:border-slate-600">
          <h2 className="font-semibold">{syncHead && syncBaseReady ? 'GitHub同期' : '初回同期'}</h2>
          {autoStatus && (
            <p className={`text-sm ${autoStatus.state === 'error' || autoStatus.state === 'conflicts' ? 'text-amber-700 dark:text-amber-300' : 'opacity-70'}`} role="status">
              {autoStatus.message}（{new Date(autoStatus.updatedAt).toLocaleString('ja-JP')}）
            </p>
          )}
          {(!syncHead || !syncBaseReady) && <p className="text-sm">ローカルとGitHubの両方にデータがあるときは、選択するまでどちらも変更しません。</p>}
          {syncHead && syncBaseReady && <p className="text-xs opacity-70">最終同期 commit: {syncHead.slice(0, 7)}</p>}
          {syncHead && !syncBaseReady && <p className="text-sm text-amber-700 dark:text-amber-300">同期の基準データがありません。同期元を選び直して初期化してください。</p>}
          {backupAvailable && (
            <button className={button} onClick={() => void downloadLocalBackup(db)}>同期前のローカルバックアップをダウンロード</button>
          )}
          <button className={button} disabled={syncBusy || Boolean(syncHead && syncBaseReady && conflictPlan)} onClick={() => void sync()}>
            {syncBusy ? '同期中…' : syncHead && syncBaseReady ? '今すぐ同期' : syncHead ? '初回同期をやり直す' : '初回同期を確認'}
          </button>
          {syncMessage.includes('同期元を選んで') && (
            <div className="flex flex-wrap gap-2">
              <button className={button} disabled={syncBusy} onClick={() => void sync('github')}>GitHubのデータを使う</button>
              <button className={button} disabled={syncBusy} onClick={() => void sync('local')}>この端末のデータを使う</button>
            </div>
          )}
          {conflictPlan && (
            <div className="space-y-3 rounded border border-amber-400 p-3">
              <p className="text-sm font-semibold">競合の解決（選択した側を採用します。変更前のローカルデータはバックアップに残します）</p>
              {conflictPlan.conflicts.map((conflict) => (
                <fieldset key={conflict.path} className="space-y-1 border-b border-slate-300 pb-2 text-sm dark:border-slate-600">
                  <legend className="break-all font-mono text-xs">{conflict.path}</legend>
                  <label className="mr-4 inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name={`conflict-${conflict.path}`}
                      checked={conflictChoices[conflict.path] === 'local'}
                      onChange={() => setConflictChoices((current) => ({ ...current, [conflict.path]: 'local' }))}
                    />
                    この端末
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name={`conflict-${conflict.path}`}
                      checked={conflictChoices[conflict.path] === 'github'}
                      onChange={() => setConflictChoices((current) => ({ ...current, [conflict.path]: 'github' }))}
                    />
                    GitHub
                  </label>
                </fieldset>
              ))}
              <button
                className={button}
                disabled={syncBusy || conflictPlan.conflicts.some((conflict) => !conflictChoices[conflict.path])}
                onClick={() => void sync(undefined, conflictChoices)}
              >
                選択した内容で競合を解決して同期
              </button>
            </div>
          )}
          {syncMessage && <p role="status" className="text-sm">{syncMessage}</p>}
          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        </section>
      )}
      <p className="mt-6 text-sm"><Link className="text-sky-700 dark:text-sky-300" to="/">本棚に戻る</Link></p>
    </Shell>
  );
}
