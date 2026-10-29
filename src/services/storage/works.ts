import type { StraightCut } from '@/geometry/types';

/**
 * Studio storage.
 *
 * A work is stored as *parameters*, never as pixels: fold plan, cut lines and
 * two colours. That keeps documents tiny, editable forever, and identical when
 * reloaded — the geometry is recomputed, not restored from an image.
 */

const KEY = 'orisnip.works.v1';

export interface Work {
  id: string;
  title: string;
  presetId: string;
  cuts: StraightCut[];
  paperColor: string;
  bgColor: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkStore {
  works: Work[];
  updatedAt: number;
}

const empty = (): WorkStore => ({ works: [], updatedAt: 0 });

export function loadWorks(): WorkStore {
  if (typeof localStorage === 'undefined') return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as WorkStore;
    if (!parsed || !Array.isArray(parsed.works)) return empty();
    return {
      works: parsed.works.filter((w) => w && typeof w.id === 'string' && Array.isArray(w.cuts)),
      updatedAt: parsed.updatedAt ?? 0,
    };
  } catch {
    return empty();
  }
}

function persist(store: WorkStore): WorkStore {
  const next = { ...store, updatedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota exceeded: the in-memory list still works for this session */
  }
  return next;
}

export function saveWork(work: Work): WorkStore {
  const store = loadWorks();
  const idx = store.works.findIndex((w) => w.id === work.id);
  const next = { ...work, updatedAt: Date.now() };
  const works = idx >= 0 ? store.works.map((w, i) => (i === idx ? next : w)) : [next, ...store.works];
  return persist({ works, updatedAt: Date.now() });
}

export function deleteWork(id: string): WorkStore {
  const store = loadWorks();
  return persist({ works: store.works.filter((w) => w.id !== id), updatedAt: Date.now() });
}

export function getWork(id: string): Work | undefined {
  return loadWorks().works.find((w) => w.id === id);
}

export function newWorkId(): string {
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function makeWork(partial: Partial<Work> = {}): Work {
  const now = Date.now();
  const base: Work = {
    id: newWorkId(),
    title: '未命名作品',
    presetId: 'fold-xy',
    cuts: [],
    paperColor: '#B93645',
    bgColor: '#F8F3E9',
    createdAt: now,
    updatedAt: now,
  };
  // `{ id: undefined }` must not erase the generated id: callers build this
  // object conditionally, and an explicit undefined used to make the work
  // unsaveable (the store drops entries without a string id).
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) (base as unknown as Record<string, unknown>)[key] = value;
  }
  return base;
}
