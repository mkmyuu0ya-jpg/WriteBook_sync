import type { BookDB } from '../data/db';

const STATUS_KEY = 'github-auto-sync-status';

export type AutoSyncStatus = {
  state: 'complete' | 'conflicts' | 'error';
  message: string;
  updatedAt: string;
};

export async function getAutoSyncStatus(db: BookDB): Promise<AutoSyncStatus | undefined> {
  const record = await db.meta.get(STATUS_KEY);
  if (!record) return undefined;
  return JSON.parse(record.value) as AutoSyncStatus;
}

export async function setAutoSyncStatus(db: BookDB, status: AutoSyncStatus): Promise<void> {
  await db.meta.put({ key: STATUS_KEY, value: JSON.stringify(status) });
}
