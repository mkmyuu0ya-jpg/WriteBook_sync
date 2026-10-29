import { describe, expect, it } from 'vitest';
import { planMerge, resolveMerge } from './merge';

describe('sync merge plan', () => {
  it('pulls remote-only changes and preserves local-only changes', () => {
    const plan = planMerge(
      { 'book/data/a.txt': 'base-a', 'book/data/b.txt': 'base-b' },
      [
        { path: 'book/data/a.txt', content: 'local-a' },
        { path: 'book/data/b.txt', content: 'base-b' },
      ],
      [
        { path: 'book/data/a.txt', content: 'base-a' },
        { path: 'book/data/b.txt', content: 'remote-b' },
      ],
    );

    expect(plan.conflicts).toEqual([]);
    expect(Object.fromEntries(plan.files.map(({ path, content }) => [path, content]))).toEqual({
      'book/data/a.txt': 'local-a',
      'book/data/b.txt': 'remote-b',
    });
  });

  it('merges independent JSON field changes', () => {
    const plan = planMerge(
      { 'book/data/book.json': '{"title":"A","status":"wip"}' },
      [{ path: 'book/data/book.json', content: '{"title":"B","status":"wip"}' }],
      [{ path: 'book/data/book.json', content: '{"title":"A","status":"done"}' }],
    );

    expect(plan.conflicts).toEqual([]);
    expect(JSON.parse(plan.files[0].content)).toEqual({ title: 'B', status: 'done' });
  });

  it('requires a choice for simultaneous body changes and resolves to the selected side', () => {
    const plan = planMerge(
      { 'book/data/body.txt': 'before' },
      [{ path: 'book/data/body.txt', content: 'local' }],
      [{ path: 'book/data/body.txt', content: 'github' }],
    );

    expect(plan.conflicts).toHaveLength(1);
    expect(resolveMerge(plan, { 'book/data/body.txt': 'github' })).toEqual([
      { path: 'book/data/body.txt', content: 'github' },
    ]);
  });

  it('preserves independent series additions in ordering files', () => {
    const plan = planMerge(
      { 'book/data/library.json': '{"schemaVersion":1,"seriesOrder":["s0"]}' },
      [{ path: 'book/data/library.json', content: '{"schemaVersion":1,"seriesOrder":["s0","local"]}' }],
      [{ path: 'book/data/library.json', content: '{"schemaVersion":1,"seriesOrder":["s0","remote"]}' }],
    );

    expect(plan.conflicts).toEqual([]);
    expect(JSON.parse(plan.files[0].content).seriesOrder).toEqual(['s0', 'remote', 'local']);
  });
});
