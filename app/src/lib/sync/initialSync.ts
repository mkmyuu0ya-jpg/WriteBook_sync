import type { BookDB } from '../data/db';
import { readDataFiles, writeDataFiles, type GitHubSettings } from './github';
import { canonicalizeFiles, downloadLocalBackup, parseRemoteLibrary, readLocalLibrary, replaceLocalLibrary, saveLocalBackup, serializeLibrary, setSyncBase, setSyncHead } from './library';

export type InitialSyncChoice = 'local' | 'github';
export type InitialSyncResult = { status: 'choice-required' } | { status: 'complete'; direction: 'local' | 'github' | 'empty' };

export async function initializeSync(
  db: BookDB,
  settings: GitHubSettings,
  choice?: InitialSyncChoice,
): Promise<InitialSyncResult> {
  const [remote, local] = await Promise.all([readDataFiles(settings), readLocalLibrary(db)]);
  const hasLocal = local.series.length > 0 || local.books.length > 0;
  const hasRemote = remote.files.length > 0;

  if (hasLocal && hasRemote && !choice) return { status: 'choice-required' };

  if (choice === 'github' || (!hasLocal && hasRemote)) {
    const remoteLibrary = parseRemoteLibrary(remote.files);
    if (hasLocal) {
      await saveLocalBackup(db);
      await downloadLocalBackup(db);
    }
    await replaceLocalLibrary(db, remoteLibrary);
    await setSyncBase(db, remote.files);
    await setSyncHead(db, remote.head);
    return { status: 'complete', direction: 'github' };
  }

  if (choice === 'local' || (hasLocal && !hasRemote)) {
    const files = serializeLibrary(local);
    const head = await writeDataFiles(settings, remote.head, files, 'sync: initialize book library');
    await setSyncBase(db, canonicalizeFiles(files));
    await setSyncHead(db, head);
    return { status: 'complete', direction: 'local' };
  }

  return { status: 'complete', direction: 'empty' };
}
