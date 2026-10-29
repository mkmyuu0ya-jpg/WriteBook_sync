const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';

export type GitHubSettings = {
  owner: string;
  repo: string;
  branch: string;
  token: string;
};

export type RemoteFile = {
  path: string;
  sha: string;
  content: string;
};

type GitHubError = { message?: string };

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

function repoPath(settings: GitHubSettings, path: string): string {
  const root = `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}`;
  return path ? `${root}/${path}` : root;
}

async function request<T>(settings: GitHubSettings, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${settings.token}`,
      'X-GitHub-Api-Version': API_VERSION,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let message = `GitHub API request failed (${response.status})`;
    try {
      const body = (await response.json()) as GitHubError;
      if (body.message) message = body.message;
    } catch {
      // Keep the HTTP status when GitHub returns a non-JSON error body.
    }
    throw new GitHubApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

type RefResponse = { object: { sha: string } };
type CommitResponse = { tree: { sha: string } };
type TreeResponse = { tree: Array<{ path: string; type: string; sha: string }>; truncated: boolean };
type BlobResponse = { content: string; encoding: string };
type BlobCreated = { sha: string };
type TreeCreated = { sha: string };
type CommitCreated = { sha: string };
type GistResponse = {
  id: string;
  updated_at: string;
  files?: Record<string, { content?: string; truncated?: boolean } | null>;
};

export type FileCommit = {
  sha: string;
  message: string;
  date: string;
};

export async function verifyToken(settings: GitHubSettings): Promise<void> {
  await request<{ full_name?: string }>(settings, repoPath(settings, ''));
}

export async function readDataFiles(settings: GitHubSettings): Promise<{ head: string; files: RemoteFile[] }> {
  const ref = await request<RefResponse>(settings, repoPath(settings, `git/ref/heads/${encodeURIComponent(settings.branch)}`));
  const commit = await request<CommitResponse>(settings, repoPath(settings, `git/commits/${ref.object.sha}`));
  const tree = await request<TreeResponse>(settings, repoPath(settings, `git/trees/${commit.tree.sha}?recursive=1`));
  if (tree.truncated) throw new Error('GitHub returned a truncated repository tree; sync was stopped.');

  const entries = tree.tree.filter((entry) => entry.type === 'blob' && entry.path.startsWith('book/data/'));
  const files = await Promise.all(
    entries.map(async (entry) => {
      const blob = await request<BlobResponse>(settings, repoPath(settings, `git/blobs/${entry.sha}`));
      if (blob.encoding !== 'base64') throw new Error(`Unsupported GitHub blob encoding for ${entry.path}.`);
      return { path: entry.path, sha: entry.sha, content: decodeBase64(blob.content) };
    }),
  );
  return { head: ref.object.sha, files };
}

export async function listFileCommits(settings: GitHubSettings, path: string, limit = 10): Promise<FileCommit[]> {
  const query = new URLSearchParams({ path, per_page: String(limit) });
  const commits = await request<Array<{
    sha: string;
    commit: { message: string; author?: { date?: string }; committer?: { date?: string } };
  }>>(settings, repoPath(settings, `commits?${query.toString()}`));
  return commits.map((item) => ({
    sha: item.sha,
    message: item.commit.message,
    date: item.commit.author?.date ?? item.commit.committer?.date ?? '',
  }));
}

export async function readFileAtCommit(settings: GitHubSettings, path: string, commitSha: string): Promise<string> {
  const commit = await request<CommitResponse>(
    settings,
    repoPath(settings, `git/commits/${encodeURIComponent(commitSha)}`),
  );
  const tree = await request<TreeResponse>(
    settings,
    repoPath(settings, `git/trees/${commit.tree.sha}?recursive=1`),
  );
  if (tree.truncated) throw new Error('GitHub returned a truncated commit tree; history was stopped.');
  const entry = tree.tree.find((item) => item.path === path && item.type === 'blob');
  if (!entry) throw new Error(`この版にはファイルがありません: ${path}`);
  const blob = await request<BlobResponse>(settings, repoPath(settings, `git/blobs/${entry.sha}`));
  if (blob.encoding !== 'base64') throw new Error(`Unsupported GitHub blob encoding for ${path}.`);
  return decodeBase64(blob.content);
}

export async function publishGist(
  settings: GitHubSettings,
  title: string,
  content: string,
  gistId?: string,
): Promise<{ gistId: string; updatedAt: string }> {
  const result = await request<GistResponse>(
    settings,
    gistId ? `/gists/${encodeURIComponent(gistId)}` : '/gists',
    {
      method: gistId ? 'PATCH' : 'POST',
      body: JSON.stringify({
        ...(gistId ? {} : { description: `校正用: ${title}`, public: false }),
        files: { 'body.txt': { content } },
      }),
    },
  );
  return { gistId: result.id, updatedAt: result.updated_at };
}

export async function deleteGist(settings: GitHubSettings, gistId: string): Promise<void> {
  await request<void>(settings, `/gists/${encodeURIComponent(gistId)}`, { method: 'DELETE' });
}

export async function readPublicGist(gistId: string): Promise<{ content: string; updatedAt: string }> {
  const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION },
  });
  if (!response.ok) throw new GitHubApiError(`公開リンクを取得できませんでした (${response.status})`, response.status);
  const gist = (await response.json()) as GistResponse;
  const body = gist.files?.['body.txt'];
  if (!body || body.truncated || body.content === undefined) {
    throw new Error(body?.truncated ? '本文が大きすぎて取得できません。' : '公開リンクに本文がありません。');
  }
  return { content: body.content, updatedAt: gist.updated_at };
}

export async function writeDataFiles(
  settings: GitHubSettings,
  expectedHead: string,
  files: Array<{ path: string; content: string }>,
  message: string,
): Promise<string> {
  const head = await request<RefResponse>(settings, repoPath(settings, `git/ref/heads/${encodeURIComponent(settings.branch)}`));
  if (head.object.sha !== expectedHead) throw new GitHubApiError('The remote branch changed. Sync again to avoid overwriting newer work.', 409);

  const currentCommit = await request<CommitResponse>(settings, repoPath(settings, `git/commits/${head.object.sha}`));
  const currentTree = await request<TreeResponse>(
    settings,
    repoPath(settings, `git/trees/${currentCommit.tree.sha}?recursive=1`),
  );
  if (currentTree.truncated) throw new Error('GitHub returned a truncated repository tree; write was stopped.');
  const retainedPaths = new Set(files.map((file) => file.path));
  const createdBlobs = await Promise.all(
    files.map((file) =>
      request<BlobCreated>(settings, repoPath(settings, 'git/blobs'), {
        method: 'POST',
        body: JSON.stringify({ content: encodeBase64(file.content), encoding: 'base64' }),
      }).then((blob) => ({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha })),
    ),
  );
  const deletedFiles = currentTree.tree
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith('book/data/') && !retainedPaths.has(entry.path))
    .map((entry) => ({ path: entry.path, mode: '100644', type: 'blob', sha: null }));
  const tree = await request<TreeCreated>(settings, repoPath(settings, 'git/trees'), {
    method: 'POST',
    body: JSON.stringify({ base_tree: currentCommit.tree.sha, tree: [...createdBlobs, ...deletedFiles] }),
  });
  const commit = await request<CommitCreated>(settings, repoPath(settings, 'git/commits'), {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [head.object.sha] }),
  });

  await request<void>(settings, repoPath(settings, `git/refs/heads/${encodeURIComponent(settings.branch)}`), {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit.sha;
}
