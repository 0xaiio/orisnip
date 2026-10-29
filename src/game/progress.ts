import { useCallback, useEffect, useState } from 'react';

/**
 * Local progress. No account, no network: the only thing the app remembers is
 * which levels you finished and how cleanly.
 */

const KEY = 'orisnip.progress.v1';

export interface LevelProgress {
  bestIoU: number;
  attempts: number;
  completedAt: number;
}

export interface Progress {
  levels: Record<string, LevelProgress>;
  /** Total cuts made, used for the "your studio" statistics. */
  cuts: number;
  updatedAt: number;
}

const empty = (): Progress => ({ levels: {}, cuts: 0, updatedAt: 0 });

export function loadProgress(): Progress {
  if (typeof localStorage === 'undefined') return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Progress;
    if (!parsed || typeof parsed !== 'object' || !parsed.levels) return empty();
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

export function saveProgress(progress: Progress): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...progress, updatedAt: Date.now() }));
  } catch {
    /* storage full or blocked: progress is a convenience, not a requirement */
  }
}

export function recordAttempt(levelId: string, iou: number, passed: boolean): Progress {
  const p = loadProgress();
  const prev = p.levels[levelId] ?? { bestIoU: 0, attempts: 0, completedAt: 0 };
  p.levels[levelId] = {
    bestIoU: Math.max(prev.bestIoU, iou),
    attempts: prev.attempts + 1,
    completedAt: passed ? Date.now() : prev.completedAt,
  };
  p.cuts += 1;
  saveProgress(p);
  return p;
}

export function resetProgress(): Progress {
  const p = empty();
  saveProgress(p);
  return p;
}

export function useProgress(): [Progress, (p: Progress) => void] {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  useEffect(() => {
    setProgress(loadProgress());
  }, []);
  const update = useCallback((p: Progress) => {
    saveProgress(p);
    setProgress(p);
  }, []);
  return [progress, update];
}

export const completedCount = (p: Progress): number =>
  Object.values(p.levels).filter((l) => l.completedAt > 0).length;
