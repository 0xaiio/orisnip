import type { Face, FoldOperation, Paper, RigidTransform, Ring, ValidationResult } from './types';
import { compose, invert, reflection } from './transforms';
import { clipHalfPlane, ringArea } from './polygons';
import { createPaper, packetRingOf, getFoldPreset } from './paper';

/**
 * Folding.
 *
 * A fold is applied in *packet space*: the crease line is a real line the
 * player sees, and the half on `movingSide` is picked up and reflected across
 * it. Two invariants must hold afterwards, and both are asserted in the test
 * suite for every preset:
 *
 * 1. the union of `sheetRegion` over all faces is still the whole sheet;
 * 2. every face still reports an isometry `sheet -> packet`.
 */

const AREA_EPS = 1e-10;

export interface FoldResult {
  paper: Paper;
  /** Number of faces before / after, useful for UI copy ("4 层"). */
  facesBefore: number;
  facesAfter: number;
  /** True when the fold did nothing (all paper was already on one side). */
  noop: boolean;
}

export function applyFold(paper: Paper, fold: FoldOperation): FoldResult {
  const foldIndex = paper.folds.length;
  const refl = reflection(fold.line);
  const stays: Face[] = [];
  const moves: Face[] = [];
  let nextId = paper.nextFaceId;
  let noop = true;

  for (const face of paper.faces) {
    const packet = packetRingOf(face);
    const positive = clipHalfPlane(packet, fold.line, 1);
    const negative = clipHalfPlane(packet, fold.line, -1);
    const stayingRing = fold.movingSide === 'negative' ? positive : negative;
    const movingRing = fold.movingSide === 'negative' ? negative : positive;
    const inv = invert(face.transform);
    const packetArea = ringArea(packet);

    const stayingArea = ringArea(stayingRing);
    if (stayingArea > AREA_EPS) {
      const whole = Math.abs(stayingArea - packetArea) <= 1e-12 * Math.max(1, packetArea);
      stays.push({
        ...face,
        id: whole ? face.id : `f${nextId++}`,
        sheetRegion: whole ? face.sheetRegion : mapRing(inv, stayingRing),
      });
    }

    const movingArea = ringArea(movingRing);
    if (movingArea > AREA_EPS) {
      noop = false;
      moves.push({
        ...face,
        id: `f${nextId++}`,
        // The physical piece keeps its position on the sheet; only its image in
        // the packet changes. Mapping with the *old* inverse is what makes the
        // unfold exact rather than a mirrored guess.
        sheetRegion: mapRing(inv, movingRing),
        transform: compose(refl, face.transform),
        movedBy: [...face.movedBy, foldIndex],
      });
    }
  }

  // A folded flap lands on top of the stationary stack, and flipping a stack
  // reverses its internal order.
  const ordered = [...stays, ...moves.reverse()];

  return {
    paper: {
      sheet: paper.sheet,
      faces: ordered.map((f, i) => ({ ...f, stack: i })),
      folds: [...paper.folds, fold],
      nextFaceId: nextId,
    },
    facesBefore: paper.faces.length,
    facesAfter: ordered.length,
    noop,
  };
}

function mapRing(t: RigidTransform, ring: Ring): Ring {
  return ring.map((p) => ({ x: t.a * p.x + t.b * p.y + t.tx, y: t.c * p.x + t.d * p.y + t.ty }));
}

/** Validate a fold before applying it, so the UI can explain refusals. */
export function validateFold(paper: Paper, fold: FoldOperation): ValidationResult {
  const n = Math.hypot(fold.line.normal.x, fold.line.normal.y);
  if (!Number.isFinite(n) || n < 1e-9) {
    return { ok: false, code: 'invalid-fold', message: '折线方向无效，无法确定折痕。' };
  }
  let pos = 0;
  let neg = 0;
  for (const face of paper.faces) {
    const ring = packetRingOf(face);
    pos += ringArea(clipHalfPlane(ring, fold.line, 1));
    neg += ringArea(clipHalfPlane(ring, fold.line, -1));
  }
  if (pos < AREA_EPS || neg < AREA_EPS) {
    return { ok: false, code: 'invalid-fold', message: '折线没有穿过纸张，折不起来。' };
  }
  return { ok: true, code: 'ok', message: '折痕有效。' };
}

/** Replay a whole fold plan onto a sheet. */
export function applyFoldPlan(paper: Paper, folds: FoldOperation[]): Paper {
  let current = paper;
  for (const fold of folds) {
    current = applyFold(current, fold).paper;
  }
  return current;
}

/** Build the folded packet for a named preset. */
export function buildPacket(presetId: string, sheet?: Ring): Paper {
  const preset = getFoldPreset(presetId);
  return applyFoldPlan(createPaper(sheet), preset.folds);
}

/**
 * Rebuild a paper state from a fold-plan id plus a list of user folds.
 * Used by the studio when replaying a document from storage.
 */
export function rebuildPaper(presetId: string, sheet?: Ring): Paper {
  return buildPacket(presetId, sheet);
}
