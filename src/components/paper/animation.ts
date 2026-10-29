import type { Line, Paper, Ring } from '@/geometry/types';
import { applyTransformRing, compose, partialFold } from '@/geometry/transforms';
import { packetRingOf } from '@/geometry/paper';
import { buildUnfoldStages } from '@/geometry/unfold';

/**
 * Animation frames derived from real geometry.
 *
 * Every frame below is produced by applying a *partial* isometry to the exact
 * faces the engine computed. There is no keyframed illusion: the last frame of
 * a fold is bit-for-bit the packet the scissors will see, and the last frame of
 * an unfold is bit-for-bit the artwork the exporter writes out.
 *
 * `u` runs from -1 (fully flat on the original side) through 0 (edge-on) to +1
 * (fully folded). That is the 2D shadow of a 180 degree rotation about the
 * crease, so intermediate frames are physically meaningful rather than a fade.
 */

export interface AnimFace {
  key: string;
  ring: Ring;
  /** 0..1, used to fade detached scraps away. */
  opacity: number;
}

export const packetFrame = (paper: Paper): AnimFace[] =>
  paper.faces.map((f) => ({ key: f.id, ring: packetRingOf(f), opacity: 1 }));

/**
 * Frame of the fold that produced `paper.folds[foldIndex]`, at parameter `u`.
 * `paper` must already contain that fold.
 */
export function foldFrame(paper: Paper, foldIndex: number, u: number): AnimFace[] {
  const fold = paper.folds[foldIndex];
  if (!fold) return packetFrame(paper);
  return paper.faces.map((face) => {
    const moved = face.movedBy.includes(foldIndex);
    const transform = moved ? compose(partialFold(fold.line, u), face.transform) : face.transform;
    return { key: face.id, ring: applyTransformRing(transform, face.sheetRegion), opacity: 1 };
  });
}

/** Convenience for a fold described only by its crease (hero demo). */
export function foldFrameWithLine(
  faces: { id: string; sheetRegion: Ring; transform: Parameters<typeof applyTransformRing>[0]; moved: boolean }[],
  line: Line,
  u: number,
): AnimFace[] {
  return faces.map((f) => {
    const transform = f.moved ? compose(partialFold(line, u), f.transform) : f.transform;
    return { key: f.id, ring: applyTransformRing(transform, f.sheetRegion), opacity: 1 };
  });
}

/**
 * Frame of the unfold of fold `foldIndex`, in the intermediate stage where
 * only folds `[0, foldIndex]` are applied.
 */
export function unfoldFrame(paper: Paper, foldIndex: number, u: number): AnimFace[] {
  const fold = paper.folds[foldIndex];
  if (!fold) return packetFrame(paper);
  const stages = buildUnfoldStages(paper);
  const stage = stages.find((s) => s.foldsApplied === foldIndex + 1) ?? stages[0];
  return stage.faces.map(({ face, transform }) => {
    const moved = face.movedBy.includes(foldIndex);
    const t = moved ? compose(partialFold(fold.line, u), transform) : transform;
    return { key: face.id, ring: applyTransformRing(t, face.sheetRegion), opacity: 1 };
  });
}

/** Linear interpolation helper. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));
/** Smoothstep, for animation segments that should ease at both ends. */
export const smooth = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
