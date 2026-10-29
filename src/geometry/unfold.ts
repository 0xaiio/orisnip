import type { FoldOperation, Paper, PolygonRegion, RigidTransform, UnfoldResult } from './types';
import { compose, identity, reflection } from './transforms';
import { asRegion, cleanPolygon, countHoles, perimeterOf, unionRegions } from './polygons';
import { bboxOf, polygonArea } from './vec';

/**
 * Unfolding.
 *
 * Because folding never destroys information — each face remembers the exact
 * isometry that carried it into the packet — unfolding is not a heuristic and
 * not a mirrored guess. It is literally the identity map read backwards:
 *
 *   remaining sheet = union over faces of `sheetRegion`
 *
 * The union is computed with a polygon boolean library because the result may
 * be disconnected and may contain holes.
 */

export function unfold(paper: Paper): UnfoldResult {
  const region = cleanPolygon(unionRegions(paper.faces.map((f) => asRegion(f.sheetRegion))));
  const area = region.reduce((s, p) => s + polygonArea(p), 0);
  const sheetArea = Math.abs(polygonArea([paper.sheet]));
  return {
    region,
    area,
    sheetArea,
    removedArea: Math.max(0, sheetArea - area),
    perimeter: perimeterOf(region),
    bbox: bboxOf(region.flat()),
    pieceCount: region.length,
    holeCount: countHoles(region),
  };
}

/** Transform of a face in the intermediate stage where only folds `[0, k)` are applied. */
export function transformAtStage(face: { movedBy: number[]; transform: RigidTransform }, folds: FoldOperation[], k: number): RigidTransform {
  let t = identity();
  for (const idx of face.movedBy) {
    if (idx < k && folds[idx]) t = compose(reflection(folds[idx].line), t);
  }
  return t;
}

export interface StageFace {
  face: Paper['faces'][number];
  transform: RigidTransform;
}

export interface UnfoldStage {
  /** Fold index undone when leaving this stage; `-1` for the final flat stage. */
  undoing: number;
  foldsApplied: number;
  /** Ordered bottom -> top, so painters can simply draw in order. */
  faces: StageFace[];
}

/**
 * Build the full 3D-ish reveal timeline: every intermediate state between the
 * folded packet and the flat sheet, in the exact order the player folded.
 *
 * The UI animates each segment by squashing the moving group towards the
 * crease (a 2D fold seen edge-on), which converges exactly on the next stage.
 */
export function buildUnfoldStages(paper: Paper): UnfoldStage[] {
  const n = paper.folds.length;
  const stages: UnfoldStage[] = [];
  let order = paper.faces.slice();

  for (let j = n; j >= 0; j--) {
    stages.push({
      undoing: j === 0 ? -1 : j - 1,
      foldsApplied: j,
      faces: order.map((face) => ({ face, transform: transformAtStage(face, paper.folds, j) })),
    });
    if (j > 0) {
      const idx = j - 1;
      const moved = order.filter((f) => f.movedBy.includes(idx));
      const rest = order.filter((f) => !f.movedBy.includes(idx));
      // Undo the fold: the flap that was on top returns underneath, and its
      // internal stacking order flips back.
      order = [...moved.slice().reverse(), ...rest];
    }
  }
  return stages;
}

/** Convenience: the sheet-space polygon of every face, for export. */
export function facePolygons(paper: Paper): PolygonRegion[] {
  return paper.faces.map((f) => [[...f.sheetRegion]]);
}
