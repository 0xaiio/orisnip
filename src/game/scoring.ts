import type { MultiPolygon, StraightCut } from '@/geometry/types';
import type { ResolvedLevel } from './levels';
import { iou, regionArea, subtractRegions, symmetricDifferenceArea } from '@/geometry/polygons';
import { unfold } from '@/geometry/unfold';
import { applyCut } from '@/geometry/cuts';

/**
 * Puzzle scoring.
 *
 * The verdict is a geometric measurement, never a model opinion:
 *
 *   IoU  = area(A ∩ T) / area(A ∪ T)
 *   Err  = area(A △ T) / area(P)
 *
 * A pass is `IoU >= level.tolerance`; the tolerance is per level because a cut
 * across a small shape changes IoU far faster than one across a large shape.
 */

export type Grade = 'perfect' | 'good' | 'close' | 'miss';

export interface Score {
  iou: number;
  error: number;
  passed: boolean;
  grade: Grade;
  /** result area minus target area; negative means too much was cut away. */
  areaDelta: number;
  actualArea: number;
  targetArea: number;
  holes: number;
  targetHoles: number;
  /** Where the mismatch sits on the sheet, in words. */
  feedback: string;
  /** A single actionable sentence. */
  advice: string;
}

export interface PlayResult {
  cut: StraightCut;
  region: MultiPolygon;
  score: Score;
}

export function evaluateCut(level: ResolvedLevel, cut: StraightCut): PlayResult {
  const applied = applyCut(level.packet, cut);
  const result = unfold(applied.paper);
  const target = level.target;
  const score = compare(result.region, target, level);
  return { cut, region: result.region, score };
}

export function compare(actual: MultiPolygon, target: MultiPolygon, level: ResolvedLevel): Score {
  const iouValue = iou(actual, target);
  const sym = symmetricDifferenceArea(actual, target);
  const err = sym / 4;
  const actualArea = regionArea(actual);
  const targetArea = regionArea(target);
  const areaDelta = actualArea - targetArea;

  const grade: Grade =
    iouValue >= 0.985 ? 'perfect' : iouValue >= level.tolerance ? 'good' : iouValue >= level.tolerance - 0.06 ? 'close' : 'miss';

  const extra = subtractRegions(actual, target);
  const missing = subtractRegions(target, actual);
  const extraArea = regionArea(extra);
  const missingArea = regionArea(missing);

  const where = extraArea >= missingArea ? describeRegion(extra) : describeRegion(missing);
  const keptTooMuch = extraArea >= missingArea;

  let feedback: string;
  if (iouValue >= 0.985) {
    feedback = '与目标几乎完全重合，误差在浮点容差以内。';
  } else if (keptTooMuch) {
    feedback = `你在${where}多留了约 ${extraArea.toFixed(3)} 的纸，这一部分本来应该被剪掉。`;
  } else {
    feedback = `你在${where}多剪掉了约 ${missingArea.toFixed(3)} 的纸，这一部分本来应该保留。`;
  }

  const actualHoles = actual.reduce((s, p) => s + Math.max(0, p.length - 1), 0);
  let advice: string;
  if (iouValue >= 0.985) {
    advice = '完美。可以直接进入下一关。';
  } else if (level.id === 'l3' || level.id === 'l6') {
    advice = keptTooMuch
      ? '孔洞（或留下的形状）偏小：把剪切线向远离折角的方向平移一点。'
      : '孔洞（或留下的形状）偏大：把剪切线向折角方向平移一点。';
  } else if (actualHoles !== level.targetHoles) {
    advice = `孔洞数量不对（得到 ${actualHoles} 个，目标是 ${level.targetHoles} 个），先调整剪切线是否穿过纸包内部。`;
  } else if (Math.abs(areaDelta) < 0.02) {
    advice = '面积已经很接近了，问题出在切口的角度：试着旋转这条线。';
  } else if (keptTooMuch) {
    advice = '剪掉的面积太少：把剪切线整体向纸包内部平移。';
  } else {
    advice = '剪掉的面积太多：把剪切线整体向纸包外侧平移。';
  }

  return {
    iou: iouValue,
    error: err,
    passed: iouValue >= level.tolerance,
    grade,
    areaDelta,
    actualArea,
    targetArea,
    holes: actualHoles,
    targetHoles: level.targetHoles,
    feedback,
    advice,
  };
}

type Dir = '中心' | '上方' | '下方' | '左侧' | '右侧' | '左上方' | '右上方' | '左下方' | '右下方';

/** Describe where a region sits on the sheet, in plain Chinese. */
export function describeRegion(region: MultiPolygon): string {
  let total = 0;
  let cx = 0;
  let cy = 0;
  for (const poly of region) {
    const ring = poly[0];
    if (!ring || ring.length < 3) continue;
    let a = 0;
    let x = 0;
    let y = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % ring.length];
      const f = p.x * q.y - q.x * p.y;
      a += f;
      x += (p.x + q.x) * f;
      y += (p.y + q.y) * f;
    }
    a /= 2;
    if (Math.abs(a) < 1e-12) continue;
    total += Math.abs(a);
    cx += (x / (6 * a)) * Math.abs(a);
    cy += (y / (6 * a)) * Math.abs(a);
  }
  if (total < 1e-12) return '纸面';
  cx /= total;
  cy /= total;

  const r = Math.hypot(cx, cy);
  if (r < 0.3) return '中心';
  const angle = (Math.atan2(cy, cx) * 180) / Math.PI;
  const table: [number, Dir][] = [
    [-157.5, '左侧'],
    [-112.5, '左下方'],
    [-67.5, '下方'],
    [-22.5, '右下方'],
    [22.5, '右侧'],
    [67.5, '右上方'],
    [112.5, '上方'],
    [157.5, '左上方'],
  ];
  for (const [limit, label] of table) if (angle < limit) return label;
  return '左侧';
}
