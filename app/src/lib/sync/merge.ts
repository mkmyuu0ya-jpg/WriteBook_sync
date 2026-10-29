import { canonicalizeFiles } from './library';

export type SyncConflict = {
  path: string;
  local?: string;
  remote?: string;
};

export type MergePlan = {
  files: Array<{ path: string; content: string }>;
  conflicts: SyncConflict[];
};

type Version = string | undefined;

function mergeJson(
  path: string,
  baseText: string | undefined,
  localText: string | undefined,
  remoteText: string | undefined,
): { content?: string; conflict?: SyncConflict } {
  if (localText === undefined || remoteText === undefined) {
    return { conflict: { path, local: localText, remote: remoteText } };
  }
  try {
    const base = baseText === undefined ? {} : JSON.parse(baseText) as Record<string, unknown>;
    const local = JSON.parse(localText) as Record<string, unknown>;
    const remote = JSON.parse(remoteText) as Record<string, unknown>;
    const merged: Record<string, unknown> = {};

    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const baseValue = base[key];
      const localValue = local[key];
      const remoteValue = remote[key];
      if (JSON.stringify(localValue) === JSON.stringify(remoteValue)) {
        if (localValue !== undefined) merged[key] = localValue;
      } else if (JSON.stringify(localValue) === JSON.stringify(baseValue)) {
        if (remoteValue !== undefined) merged[key] = remoteValue;
      } else if (JSON.stringify(remoteValue) === JSON.stringify(baseValue)) {
        if (localValue !== undefined) merged[key] = localValue;
      } else if ((key === 'bookOrder' || key === 'seriesOrder') && Array.isArray(localValue) && Array.isArray(remoteValue)) {
        merged[key] = [...new Set([...remoteValue, ...localValue])];
      } else {
        return { conflict: { path, local: localText, remote: remoteText } };
      }
    }

    return { content: `${JSON.stringify(merged, null, 2)}\n` };
  } catch {
    return { conflict: { path, local: localText, remote: remoteText } };
  }
}

export function planMerge(
  baseFiles: Record<string, string>,
  localFiles: Array<{ path: string; content: string }>,
  remoteFiles: Array<{ path: string; content: string }>,
): MergePlan {
  const local = new Map(canonicalizeFiles(localFiles).map(({ path, content }) => [path, content]));
  const remote = new Map(canonicalizeFiles(remoteFiles).map(({ path, content }) => [path, content]));
  const merged = new Map<string, string>();
  const conflicts: SyncConflict[] = [];

  for (const path of new Set([...Object.keys(baseFiles), ...local.keys(), ...remote.keys()])) {
    const base: Version = baseFiles[path];
    const localValue: Version = local.get(path);
    const remoteValue: Version = remote.get(path);

    if (localValue === remoteValue) {
      if (localValue !== undefined) merged.set(path, localValue);
      continue;
    }
    if (localValue === base) {
      if (remoteValue !== undefined) merged.set(path, remoteValue);
      continue;
    }
    if (remoteValue === base) {
      if (localValue !== undefined) merged.set(path, localValue);
      continue;
    }

    if (path.endsWith('.json')) {
      const result = mergeJson(path, base, localValue, remoteValue);
      if (result.conflict) conflicts.push(result.conflict);
      else if (result.content !== undefined) merged.set(path, result.content);
    } else {
      conflicts.push({ path, local: localValue, remote: remoteValue });
    }
  }

  return {
    files: [...merged].map(([path, content]) => ({ path, content })),
    conflicts,
  };
}

export function resolveMerge(
  plan: MergePlan,
  choices: Record<string, 'local' | 'github'>,
): Array<{ path: string; content: string }> {
  const files = new Map(plan.files.map(({ path, content }) => [path, content]));
  for (const conflict of plan.conflicts) {
    const choice = choices[conflict.path];
    if (!choice) throw new Error(`競合の解決方法が選択されていません: ${conflict.path}`);
    const content = choice === 'local' ? conflict.local : conflict.remote;
    if (content === undefined) files.delete(conflict.path);
    else files.set(conflict.path, content);
  }
  return [...files].map(([path, content]) => ({ path, content }));
}
