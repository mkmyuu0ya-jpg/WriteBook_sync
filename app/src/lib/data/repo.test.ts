import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BookDB } from './db';
import { hashText } from './hash';
import { createRepo, MAX_SNAPSHOTS, type Repo } from './repo';
import { countByStatus, modifiedAfterPost } from './status';

let repo: Repo;
let n = 0;
beforeEach(() => {
  n += 1;
  let tick = 0;
  repo = createRepo(new BookDB('test-' + n), () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString());
});

describe('repo', () => {
  it('シリーズと本を作る。タイトルが空なら仮の名前になる', async () => {
    const s = await repo.addSeries('  ');
    expect(s.title).toBe('無題のシリーズ');
    const b = await repo.addBook(s.id, '第一話', '本文');
    expect(b.status).toBe('wip');
    expect(await repo.getBody(b.id)).toBe('本文');
    expect((await repo.listBooks(s.id)).map((x) => x.id)).toEqual([b.id]);
  });
  it('本は作成順に並ぶ', async () => {
    const s = await repo.addSeries('S');
    const a = await repo.addBook(s.id, 'A');
    const b = await repo.addBook(s.id, 'B');
    expect((await repo.listBooks(s.id)).map((x) => x.id)).toEqual([a.id, b.id]);
  });
  it('本文を保存すると更新日時が変わる', async () => {
    const s = await repo.addSeries('S');
    const b = await repo.addBook(s.id, 'A', 'x');
    await repo.setBody(b.id, 'y');
    expect(await repo.getBody(b.id)).toBe('y');
    expect((await repo.getBook(b.id))!.updatedAt > b.updatedAt).toBe(true);
  });
  it('状態を変える。投稿の記録は、渡さなければ残る', async () => {
    const s = await repo.addSeries('S');
    const b = await repo.addBook(s.id, 'A');
    await repo.setStatus(b.id, 'done', { url: 'https://example.com/1', postedHash: 'h1' });
    await repo.setStatus(b.id, 'ready');
    const got = (await repo.getBook(b.id))!;
    expect(got.status).toBe('ready');
    expect(got.pixiv).toEqual({ url: 'https://example.com/1', postedHash: 'h1' });
  });
  it('公開リンクの情報を保存・解除する', async () => {
    const s = await repo.addSeries('S');
    const b = await repo.addBook(s.id, 'A');
    const publish = { gistId: 'gist-1', publishedAt: '2026-01-01', publishedHash: 'hash' };
    await repo.setPublish(b.id, publish);
    expect((await repo.getBook(b.id))?.publish).toEqual(publish);
    await repo.setPublish(b.id, undefined);
    expect((await repo.getBook(b.id))?.publish).toBeUndefined();
  });
  it('ゴミ箱：入れる→一覧から消える→戻せる', async () => {
    const s = await repo.addSeries('S');
    const b = await repo.addBook(s.id, 'A');
    await repo.trashBook(b.id);
    expect(await repo.listBooks(s.id)).toHaveLength(0);
    expect((await repo.listTrashed()).map((x) => x.id)).toEqual([b.id]);
    await repo.restoreBook(b.id);
    expect(await repo.listBooks(s.id)).toHaveLength(1);
    expect((await repo.getBook(b.id))!.trashedAt).toBeUndefined();
  });
  it('完全削除すると、本文と読書位置も消える', async () => {
    const s = await repo.addSeries('S');
    const b = await repo.addBook(s.id, 'A', 'x');
    await repo.saveProgress(b.id, 12);
    await repo.deleteForever(b.id);
    expect(await repo.getBook(b.id)).toBeUndefined();
    expect(await repo.getBody(b.id)).toBe('');
    expect(await repo.getProgress(b.id)).toBeUndefined();
  });
  it('読書位置を保存して読み出せる', async () => {
    const s = await repo.addSeries('S');
    const b = await repo.addBook(s.id, 'A');
    await repo.saveProgress(b.id, 5);
    await repo.saveProgress(b.id, 9);
    expect((await repo.getProgress(b.id))!.line).toBe(9);
  });
});

describe('snapshots', () => {
  it('スナップショットを残し、新しい順に読める。同じ内容は重ねない', async () => {
    const s = await repo.addSeries('S');
    const b = await repo.addBook(s.id, 'A');
    expect(await repo.addSnapshot(b.id, 'v1')).toBe(true);
    expect(await repo.addSnapshot(b.id, 'v1')).toBe(false);
    expect(await repo.addSnapshot(b.id, 'v2')).toBe(true);
    expect((await repo.listSnapshots(b.id)).map((x) => x.content)).toEqual(['v2', 'v1']);
  });
  it('上限を超えたら、古いものから消える', async () => {
    const s = await repo.addSeries('S');
    const b = await repo.addBook(s.id, 'A');
    for (let i = 1; i <= MAX_SNAPSHOTS + 3; i++) await repo.addSnapshot(b.id, 'v' + i);
    const list = await repo.listSnapshots(b.id);
    expect(list).toHaveLength(MAX_SNAPSHOTS);
    expect(list[0].content).toBe('v' + (MAX_SNAPSHOTS + 3));
    expect(list[list.length - 1].content).toBe('v4');
  });
  it('別の本のスナップショットとは混ざらず、完全削除で消える', async () => {
    const s = await repo.addSeries('S');
    const a = await repo.addBook(s.id, 'A');
    const b = await repo.addBook(s.id, 'B');
    await repo.addSnapshot(a.id, 'a1');
    await repo.addSnapshot(b.id, 'b1');
    await repo.deleteForever(a.id);
    expect(await repo.listSnapshots(a.id)).toHaveLength(0);
    expect(await repo.listSnapshots(b.id)).toHaveLength(1);
  });
});

describe('restoreSnapshot', () => {
  it('スナップショットに戻し、戻す前の本文も残す', async () => {
    const s = await repo.addSeries('S');
    const b = await repo.addBook(s.id, 'A', 'old');
    await repo.addSnapshot(b.id, 'old');
    await repo.setBody(b.id, 'new');
    const snap = (await repo.listSnapshots(b.id))[0];
    expect(await repo.restoreSnapshot(b.id, snap.id as number)).toBe(true);
    expect(await repo.getBody(b.id)).toBe('old');
    const list = await repo.listSnapshots(b.id);
    expect(list.map((x) => x.content)).toEqual(['new', 'old']);
    expect(list[0].reason).toBe('restore');
  });
  it('別の本のスナップショットには戻せない', async () => {
    const s = await repo.addSeries('S');
    const a = await repo.addBook(s.id, 'A', 'a');
    const b = await repo.addBook(s.id, 'B', 'b');
    await repo.addSnapshot(a.id, 'a-old');
    const snap = (await repo.listSnapshots(a.id))[0];
    expect(await repo.restoreSnapshot(b.id, snap.id as number)).toBe(false);
    expect(await repo.getBody(b.id)).toBe('b');
  });
});

describe('status / hash', () => {
  it('同じ文字列は同じハッシュ、違えば違うハッシュ', async () => {
    expect(await hashText('あ')).toBe(await hashText('あ'));
    expect(await hashText('あ')).not.toBe(await hashText('い'));
    expect(await hashText('')).toHaveLength(64);
  });
  it('投稿後に修正あり：記録がなければ出さない', async () => {
    const s = await repo.addSeries('S');
    const b = await repo.addBook(s.id, 'A');
    expect(modifiedAfterPost(b, 'x')).toBe(false);
    const posted = { ...b, pixiv: { postedHash: 'h1' } };
    expect(modifiedAfterPost(posted, 'h1')).toBe(false);
    expect(modifiedAfterPost(posted, 'h2')).toBe(true);
  });
  it('状態ごとの冊数', async () => {
    const s = await repo.addSeries('S');
    const a = await repo.addBook(s.id, 'A');
    const b = await repo.addBook(s.id, 'B');
    await repo.setStatus(b.id, 'done');
    expect(countByStatus(await repo.listBooks(s.id))).toEqual({ wip: 1, ready: 0, done: 1 });
    expect(a.status).toBe('wip');
  });
});
