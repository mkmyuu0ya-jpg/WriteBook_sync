import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import BookPage from './pages/BookPage';
import HistoryPage from './pages/HistoryPage';
import Home from './pages/Home';
import ReadPage from './pages/ReadPage';
import PublicReadPage from './pages/PublicReadPage';
import SeriesPage from './pages/SeriesPage';
import SettingsPage from './pages/SettingsPage';
import TrashPage from './pages/TrashPage';
import { synchronizeLibrary } from './lib/sync/synchronize';
import { getGitHubSettings } from './lib/sync/settings';
import { setAutoSyncStatus } from './lib/sync/runtime';
import { db } from './stores/library';

// エディタ（CodeMirror）は大きいので、加筆修正モードを開くときに読み込む
const EditPage = lazy(() => import('./pages/EditPage'));
let automaticSyncRunning = false;

function SyncMonitor() {
  useEffect(() => {
    let timer: number | undefined;
    let hiddenTimer: number | undefined;
    let running = false;
    let rerun = false;

    const sync = async () => {
      if (running) {
        rerun = true;
        return;
      }
      if (automaticSyncRunning) return;
      running = true;
      automaticSyncRunning = true;
      try {
        const [settings, head] = await Promise.all([getGitHubSettings(db), db.meta.get('github-sync-head')]);
        if (!settings || !head) return;
        const result = await synchronizeLibrary(db, settings);
        const status = result.status === 'conflicts'
          ? {
              state: 'conflicts' as const,
              message: `同期競合 ${result.plan.conflicts.length} 件。同期設定画面で採用側を選んでください。`,
            }
          : {
              state: 'complete' as const,
              message: result.pushed || result.pulled ? '変更を自動同期しました。' : '自動同期済み（変更なし）。',
            };
        const savedStatus = { ...status, updatedAt: new Date().toISOString() };
        await setAutoSyncStatus(db, savedStatus);
        window.dispatchEvent(new CustomEvent('book-sync-status-changed', { detail: savedStatus }));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : '自動同期に失敗しました。';
        try {
          const savedStatus = { state: 'error' as const, message, updatedAt: new Date().toISOString() };
          await setAutoSyncStatus(db, savedStatus);
          window.dispatchEvent(new CustomEvent('book-sync-status-changed', { detail: savedStatus }));
        } catch (statusError) {
          console.error('Could not save automatic sync error status:', statusError);
        }
      } finally {
        running = false;
        automaticSyncRunning = false;
        if (rerun) {
          rerun = false;
          window.clearTimeout(timer);
          timer = window.setTimeout(() => void sync(), 1000);
        }
      }
    };

    const scheduleIdleSync = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void sync(), 5 * 60 * 1000);
    };
    const onVisibilityChange = () => {
      window.clearTimeout(hiddenTimer);
      if (document.visibilityState === 'hidden') {
        hiddenTimer = window.setTimeout(() => void sync(), 1500);
      }
    };
    const onConfigured = () => void sync();
    const onSyncNow = () => void sync();
    window.addEventListener('book-data-changed', scheduleIdleSync);
    window.addEventListener('book-sync-configured', onConfigured);
    window.addEventListener('book-sync-now', onSyncNow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    void sync();

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(hiddenTimer);
      window.removeEventListener('book-data-changed', scheduleIdleSync);
      window.removeEventListener('book-sync-configured', onConfigured);
      window.removeEventListener('book-sync-now', onSyncNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <SyncMonitor />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/s/:seriesId" element={<SeriesPage />} />
        <Route path="/b/:bookId" element={<BookPage />} />
        <Route path="/b/:bookId/read" element={<ReadPage />} />
        <Route
          path="/b/:bookId/edit"
          element={
            <Suspense fallback={null}>
              <EditPage />
            </Suspense>
          }
        />
        <Route path="/b/:bookId/history" element={<HistoryPage />} />
        <Route path="/trash" element={<TrashPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/p/:gistId" element={<PublicReadPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
