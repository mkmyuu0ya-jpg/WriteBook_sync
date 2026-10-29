import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteGist, publishGist, readPublicGist, writeDataFiles, type GitHubSettings } from './github';

const settings: GitHubSettings = { owner: 'writer', repo: 'book', branch: 'main', token: 'test-token' };

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('GitHub Git Data API writes', () => {
  it('updates book data, removes stale book data, and preserves unrelated repository files', async () => {
    let treePayload: { tree: Array<{ path: string; sha: string | null; mode: string; type: string }> } | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.endsWith('/git/refs/heads/main') && init?.method === 'PATCH') return new Response(null, { status: 204 });
      if (url.endsWith('/git/ref/heads/main')) return jsonResponse({ object: { sha: 'head-1' } });
      if (url.endsWith('/git/commits/head-1')) return jsonResponse({ tree: { sha: 'tree-1' } });
      if (url.endsWith('/git/trees/tree-1?recursive=1')) {
        return jsonResponse({
          truncated: false,
          tree: [
            { path: 'book/data/old.json', type: 'blob', sha: 'old-blob' },
            { path: 'README.md', type: 'blob', sha: 'readme-blob' },
          ],
        });
      }
      if (url.endsWith('/git/blobs') && init?.method === 'POST') return jsonResponse({ sha: 'new-blob' });
      if (url.endsWith('/git/trees') && init?.method === 'POST') {
        treePayload = JSON.parse(String(init.body)) as NonNullable<typeof treePayload>;
        return jsonResponse({ sha: 'tree-2' });
      }
      if (url.endsWith('/git/commits') && init?.method === 'POST') return jsonResponse({ sha: 'commit-2' });
      throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(writeDataFiles(settings, 'head-1', [{ path: 'book/data/library.json', content: '{"schemaVersion":1}' }], 'sync'))
      .resolves.toBe('commit-2');

    expect(treePayload?.tree).toContainEqual({ path: 'book/data/library.json', mode: '100644', type: 'blob', sha: 'new-blob' });
    expect(treePayload?.tree).toContainEqual({ path: 'book/data/old.json', mode: '100644', type: 'blob', sha: null });
    expect(treePayload?.tree).not.toContainEqual(expect.objectContaining({ path: 'README.md', sha: null }));
  });

  it('stops before creating a commit if the branch advanced since it was read', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ object: { sha: 'new-head' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(writeDataFiles(settings, 'old-head', [], 'sync')).rejects.toMatchObject({
      name: 'GitHubApiError',
      status: 409,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Gist publishing', () => {
  it('creates a secret Gist, updates it, and deletes it with authentication', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return jsonResponse({ id: 'gist-1', updated_at: '2026-10-29T00:00:00Z' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(publishGist(settings, '短編', '本文')).resolves.toEqual({
      gistId: 'gist-1',
      updatedAt: '2026-10-29T00:00:00Z',
    });
    await publishGist(settings, '短編', '更新本文', 'gist-1');
    await deleteGist(settings, 'gist-1');

    const createPayload = JSON.parse(String(calls[0].init?.body)) as { public: boolean; files: Record<string, { content: string }> };
    expect(createPayload.public).toBe(false);
    expect(createPayload.files['body.txt'].content).toBe('本文');
    expect(calls[1].init?.method).toBe('PATCH');
    expect(calls[2].init?.method).toBe('DELETE');
    expect(calls.every(({ init }) => new Headers(init?.headers).get('Authorization') === `Bearer ${settings.token}`)).toBe(true);
  });

  it('reads public Gists without a token and accepts an empty body', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      id: 'gist-1',
      updated_at: '2026-10-29T00:00:00Z',
      files: { 'body.txt': { content: '' } },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(readPublicGist('gist-1')).resolves.toEqual({ content: '', updatedAt: '2026-10-29T00:00:00Z' });
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(false);
  });
});
