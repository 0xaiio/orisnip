import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Storage tests run against a hand-rolled `localStorage` so they stay in the
 * node environment: the module under test only ever uses the Web Storage API.
 */

const memory = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memory.set(k, v);
  },
  removeItem: (k: string) => {
    memory.delete(k);
  },
  clear: () => memory.clear(),
  key: (i: number) => Array.from(memory.keys())[i] ?? null,
  get length() {
    return memory.size;
  },
};
(globalThis as unknown as { localStorage: typeof fakeStorage }).localStorage = fakeStorage;

const { deleteWork, getWork, loadWorks, makeWork, saveWork } = await import('./works');

describe('work storage', () => {
  beforeEach(() => {
    memory.clear();
  });

  it('starts empty', () => {
    expect(loadWorks().works).toEqual([]);
  });

  it('saves a parametric document and reads it back byte-identical', () => {
    const work = makeWork({
      title: '窗花一号',
      presetId: 'fold-xy',
      cuts: [{ a: { x: 0, y: 0.4 }, b: { x: 0.4, y: 0 }, keepSide: 1 }],
      paperColor: '#B93645',
      bgColor: '#F8F3E9',
    });
    saveWork(work);
    const loaded = getWork(work.id);
    expect(loaded).toBeDefined();
    expect(loaded?.cuts).toEqual(work.cuts);
    expect(loaded?.presetId).toBe('fold-xy');
    expect(loaded?.paperColor).toBe('#B93645');
  });

  it('updates in place instead of duplicating', () => {
    const work = makeWork({ title: 'A' });
    saveWork(work);
    saveWork({ ...work, title: 'B' });
    const store = loadWorks();
    expect(store.works).toHaveLength(1);
    expect(store.works[0].title).toBe('B');
  });

  it('prepends new works (most recent first)', () => {
    const a = makeWork({ title: 'A' });
    const b = makeWork({ title: 'B' });
    saveWork(a);
    saveWork(b);
    expect(loadWorks().works.map((w) => w.title)).toEqual(['B', 'A']);
  });

  it('deletes a work', () => {
    const work = makeWork({ title: '要删掉' });
    saveWork(work);
    deleteWork(work.id);
    expect(getWork(work.id)).toBeUndefined();
    expect(loadWorks().works).toHaveLength(0);
  });

  it('survives corrupted storage instead of throwing', () => {
    memory.set('orisnip.works.v1', '{not json');
    expect(loadWorks().works).toEqual([]);
    memory.set('orisnip.works.v1', JSON.stringify({ works: 'nope' }));
    expect(loadWorks().works).toEqual([]);
  });

  it('drops entries that are not documents', () => {
    memory.set(
      'orisnip.works.v1',
      JSON.stringify({ works: [{ id: 'x', cuts: [] }, null, { nope: 1 }], updatedAt: 1 }),
    );
    expect(loadWorks().works).toHaveLength(1);
  });

  it('ignores explicitly-undefined fields instead of erasing defaults', () => {
    // Regression: callers built `{ id: workId ?? undefined }`, which used to
    // overwrite the generated id and make the work unsaveable.
    const work = makeWork({ id: undefined, title: '新作品' });
    expect(typeof work.id).toBe('string');
    expect(work.id.length).toBeGreaterThan(3);
    saveWork(work);
    expect(loadWorks().works).toHaveLength(1);
    expect(getWork(work.id)?.title).toBe('新作品');
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => makeWork().id));
    expect(ids.size).toBe(50);
  });
});
