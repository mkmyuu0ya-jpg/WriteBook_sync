import type { BookDB } from '../data/db';
import type { GitHubSettings } from './github';

const SETTINGS_KEY = 'github-settings';

export async function getGitHubSettings(db: BookDB): Promise<GitHubSettings | undefined> {
  const record = await db.meta.get(SETTINGS_KEY);
  if (!record) return undefined;
  return JSON.parse(record.value) as GitHubSettings;
}

export async function saveGitHubSettings(db: BookDB, settings: GitHubSettings): Promise<void> {
  await db.meta.put({ key: SETTINGS_KEY, value: JSON.stringify(settings) });
}

export async function clearGitHubSettings(db: BookDB): Promise<void> {
  await db.meta.delete(SETTINGS_KEY);
}
