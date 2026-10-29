import type { BookDB } from '../data/db';
import { GitHubApiError, readDataFiles, writeDataFiles, type GitHubSettings } from './github';
import { planMerge, resolveMerge, type MergePlan } from './merge';
import {
  canonicalizeFiles,
  getSyncBase,
  getSyncHead,
  parseRemoteLibrary,
  readLocalLibrary,
  replaceLocalLibrary,
  saveLocalBackup,
  serializeLibrary,
  setSyncBase,
  setSyncHead,
} from './library';

export type SyncResult =
  | { status: 'conflicts'; plan: MergePlan }
  | { status: 'complete'; pushed: boolean; pulled: boolean; head: string };

function sameFiles(
  left: Array<{ path: string; content: string }>,
  right: Array<{ path: string; content: string }>,
): boolean {
  const a = new Map(canonicalizeFiles(left).map(({ path, content }) => [path, content]));
  const b = new Map(canonicalizeFiles(right).map(({ path, content }) => [path, content]));
  if (a.size !== b.size) return false;
  for (const [path, content] of a) if (b.get(path) !== content) return false;
  return true;
}

export async function synchronizeLibrary(
  db: BookDB,
  settings: GitHubSettings,
  choices?: Record<string, 'local' | 'github'>,
  retryAfterConcurrentPush = true,
): Promise<SyncResult> {
  const baseHead = await getSyncHead(db);
  const baseFiles = await getSyncBase(db);
  if (!baseHead || !baseFiles) {
    throw new Error('同期の基準データがありません。同期設定から初回同期を行ってください。');
  }

  const [remote, local] = await Promise.all([readDataFiles(settings), readLocalLibrary(db)]);
  const localFiles = serializeLibrary(local);
  const plan = planMerge(baseFiles, localFiles, remote.files);
  if (plan.conflicts.length > 0 && !choices) return { status: 'conflicts', plan };

  const targetFiles = plan.conflicts.length > 0 ? resolveMerge(plan, choices ?? {}) : plan.files;
  const targetLibrary = parseRemoteLibrary(targetFiles.map((file) => ({ ...file, sha: '' })));
  const pushed = !sameFiles(targetFiles, remote.files);
  const pulled = !sameFiles(localFiles, remote.files);

  if (plan.conflicts.length > 0) await saveLocalBackup(db);
  let newHead = remote.head;
  if (pushed) {
    try {
      newHead = await writeDataFiles(settings, remote.head, targetFiles, 'sync: update book library');
    } catch (error) {
      if (retryAfterConcurrentPush && isRetryableSyncConflict(error)) {
        return synchronizeLibrary(db, settings, undefined, false);
      }
      throw error;
    }
  }
  await replaceLocalLibrary(db, targetLibrary);
  await setSyncBase(db, targetFiles);
  await setSyncHead(db, newHead);
  return { status: 'complete', pushed, pulled, head: newHead };
}

export function isRetryableSyncConflict(error: unknown): error is GitHubApiError {
  return error instanceof GitHubApiError && (error.status === 409 || error.status === 422);
}
