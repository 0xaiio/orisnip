import type { CutOperation, CutResult, Face, Line, Paper, StraightCut, ValidationResult } from './types';
import { invert } from './transforms';
import { clipHalfPlane, ringArea } from './polygons';
import { packetRingOf } from './paper';
import { lineThrough } from './transforms';
import { sub, len } from './vec';

/**
 * Cutting.
 *
 * The game mode is strict: exactly one straight cut through the folded packet.
 * At the geometric level a cut is a half-plane intersection per face, which is
 * why a "violin-shaped path" can never be smuggled in — the data type only has
 * two endpoints.
 */

/** Minimum accepted cut length, in sheet units (2% of a unit square). */
export const MIN_CUT_LENGTH = 0.02;

export interface ResolvedCut {
  line: Line;
  length: number;
  op: CutOperation;
}

export function resolveCut(cut: StraightCut): ResolvedCut | null {
  const line = lineThrough(cut.a, cut.b);
  if (!line) return null;
  return {
    line,
    length: len(sub(cut.b, cut.a)),
    op: { cut, line, length: len(sub(cut.b, cut.a)) },
  };
}

/** Reject degenerate or no-op cuts with a message the player can act on. */
export function validateCut(paper: Paper, cut: StraightCut): ValidationResult {
  const resolved = resolveCut(cut);
  if (!resolved) {
    return { ok: false, code: 'zero-length', message: '剪切线长度为 0，请拖动端点做出真正的切口。' };
  }
  if (resolved.length < MIN_CUT_LENGTH) {
    return {
      ok: false,
      code: 'too-short',
      message: '剪切线太短了，几乎切不到纸。',
      detail: { length: resolved.length },
    };
  }
  let kept = 0;
  let removed = 0;
  for (const face of paper.faces) {
    const ring = packetRingOf(face);
    kept += ringArea(clipHalfPlane(ring, resolved.line, cut.keepSide));
    removed += ringArea(clipHalfPlane(ring, resolved.line, (-cut.keepSide) as 1 | -1));
  }
  const total = kept + removed;
  if (total < 1e-9) {
    return { ok: false, code: 'outside-paper', message: '纸包是空的。' };
  }
  if (removed < 1e-8 * total || removed < 1e-9) {
    return {
      ok: false,
      code: 'no-intersection',
      message: '这一刀没有切到纸：剪切线完全落在纸包外面。',
      detail: { kept },
    };
  }
  if (kept < 1e-8 * total || kept < 1e-9) {
    return {
      ok: false,
      code: 'empty-result',
      message: '这一刀会把整张纸都切走。移动剪切线，或者换一侧保留。',
      detail: { removed },
    };
  }
  return { ok: true, code: 'ok', message: '切口有效。', detail: { kept, removed } };
}

export function applyCut(paper: Paper, cut: StraightCut): CutResult {
  const resolved = resolveCut(cut);
  if (!resolved) {
    return { paper, kept: [], removed: [], removedArea: 0 };
  }
  const kept: Face[] = [];
  const removed: Face[] = [];
  let nextId = paper.nextFaceId;
  let removedArea = 0;

  for (const face of paper.faces) {
    const packet = packetRingOf(face);
    const inv = invert(face.transform);
    const keepRing = clipHalfPlane(packet, resolved.line, cut.keepSide);
    const dropRing = clipHalfPlane(packet, resolved.line, (-cut.keepSide) as 1 | -1);

    if (keepRing.length >= 3 && ringArea(keepRing) > 1e-10) {
      const whole = Math.abs(ringArea(keepRing) - ringArea(packet)) <= 1e-12;
      kept.push({
        ...face,
        id: whole ? face.id : `f${nextId++}`,
        sheetRegion: whole ? face.sheetRegion : mapRing(inv, keepRing),
      });
    }
    if (dropRing.length >= 3 && ringArea(dropRing) > 1e-10) {
      removedArea += ringArea(dropRing);
      removed.push({
        ...face,
        id: `f${nextId++}`,
        sheetRegion: mapRing(inv, dropRing),
      });
    }
  }

  return {
    paper: {
      sheet: paper.sheet,
      faces: kept.map((f, i) => ({ ...f, stack: i })),
      // The cut is not a fold: the fold list stays untouched so unfolding still
      // replays exactly the creases the player chose.
      folds: paper.folds,
      nextFaceId: nextId,
    },
    kept,
    removed,
    removedArea,
  };
}

function mapRing(
  t: { a: number; b: number; c: number; d: number; tx: number; ty: number },
  ring: { x: number; y: number }[],
) {
  return ring.map((p) => ({ x: t.a * p.x + t.b * p.y + t.tx, y: t.c * p.x + t.d * p.y + t.ty }));
}

/** Move a cut segment by a delta, keeping it a valid segment. */
export function translateCut(cut: StraightCut, dx: number, dy: number): StraightCut {
  return {
    a: { x: cut.a.x + dx, y: cut.a.y + dy },
    b: { x: cut.b.x + dx, y: cut.b.y + dy },
    keepSide: cut.keepSide,
  };
}

/** Rotate a cut segment about its midpoint, in radians. */
export function rotateCut(cut: StraightCut, delta: number): StraightCut {
  const mx = (cut.a.x + cut.b.x) / 2;
  const my = (cut.a.y + cut.b.y) / 2;
  const cos = Math.cos(delta);
  const sin = Math.sin(delta);
  const rot = (p: { x: number; y: number }) => {
    const dx = p.x - mx;
    const dy = p.y - my;
    return { x: mx + dx * cos - dy * sin, y: my + dx * sin + dy * cos };
  };
  return { a: rot(cut.a), b: rot(cut.b), keepSide: cut.keepSide };
}

/** Extend a segment symmetrically so the knife always crosses the whole packet. */
export function extendCut(cut: StraightCut, factor = 3): StraightCut {
  const mx = (cut.a.x + cut.b.x) / 2;
  const my = (cut.a.y + cut.b.y) / 2;
  const ex = (p: { x: number; y: number }) => ({
    x: mx + (p.x - mx) * factor,
    y: my + (p.y - my) * factor,
  });
  return { a: ex(cut.a), b: ex(cut.b), keepSide: cut.keepSide };
}

/** Midpoint of the cut, used to place the knife handle and labels. */
export const cutMidpoint = (cut: StraightCut) => ({
  x: (cut.a.x + cut.b.x) / 2,
  y: (cut.a.y + cut.b.y) / 2,
});

/** Angle of the cut in radians, normalised to [0, pi). */
export function cutAngle(cut: StraightCut): number {
  const ang = Math.atan2(cut.b.y - cut.a.y, cut.b.x - cut.a.x);
  return ang < 0 ? ang + Math.PI : ang;
}

/** Angle in degrees, in [0, 180). */
export const cutAngleDeg = (cut: StraightCut): number => (cutAngle(cut) * 180) / Math.PI;

/** Rotate about the midpoint so the segment reaches `deg` degrees. */
export function setCutAngleDeg(cut: StraightCut, deg: number): StraightCut {
  let delta = (deg * Math.PI) / 180 - cutAngle(cut);
  while (delta > Math.PI / 2) delta -= Math.PI;
  while (delta < -Math.PI / 2) delta += Math.PI;
  return rotateCut(cut, delta);
}

/** Signed distance from `center` to the cut line, along its normal. */
export function cutOffset(cut: StraightCut, center: { x: number; y: number }): number {
  const resolved = resolveCut(cut);
  if (!resolved) return 0;
  const { point, normal } = resolved.line;
  return normal.x * (point.x - center.x) + normal.y * (point.y - center.y);
}

/** Translate the cut so its line sits at `offset` from `center`. */
export function setCutOffset(
  cut: StraightCut,
  offset: number,
  center: { x: number; y: number },
): StraightCut {
  const resolved = resolveCut(cut);
  if (!resolved) return cut;
  const current = cutOffset(cut, center);
  const delta = offset - current;
  return translateCut(cut, resolved.line.normal.x * delta, resolved.line.normal.y * delta);
}
