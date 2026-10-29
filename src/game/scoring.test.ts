import { describe, expect, it } from 'vitest';
import { compare, describeRegion, evaluateCut } from './scoring';
import { getLevel } from './levels';
import { asRegion, regionArea } from '@/geometry/polygons';
import { createSquareSheet } from '@/geometry/paper';
import type { MultiPolygon } from '@/geometry/types';

const level = getLevel('l3')!;

describe('scoring', () => {
  it('the reference cut scores a perfect 1.0', () => {
    const result = evaluateCut(level, level.solution);
    expect(result.score.iou).toBeGreaterThan(0.9999);
    expect(result.score.error).toBeLessThan(1e-6);
    expect(result.score.grade).toBe('perfect');
    expect(result.score.passed).toBe(true);
  });

  it('a deliberately wrong cut fails and says why', () => {
    const result = evaluateCut(level, level.start);
    expect(result.score.passed).toBe(false);
    expect(result.score.grade === 'miss' || result.score.grade === 'close').toBe(true);
    expect(result.score.feedback.length).toBeGreaterThan(10);
    expect(result.score.advice.length).toBeGreaterThan(5);
    // A too-large hole means too little paper left.
    expect(result.score.areaDelta).toBeLessThan(0);
  });

  it('IoU and symmetric-difference error stay in range for random cuts', () => {
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const d = 0.15 + t * 0.7;
      const result = evaluateCut(level, { a: { x: 0, y: d }, b: { x: d, y: 0 }, keepSide: 1 });
      expect(result.score.iou).toBeGreaterThanOrEqual(0);
      expect(result.score.iou).toBeLessThanOrEqual(1);
      expect(result.score.error).toBeGreaterThanOrEqual(0);
      expect(result.score.error).toBeLessThanOrEqual(1);
      expect(result.score.actualArea).toBeGreaterThan(0);
    }
  });

  it('identical regions compare as identical', () => {
    const sheet = createSquareSheet(1);
    const region: MultiPolygon = asRegion(sheet);
    const score = compare(region, region, level);
    expect(score.iou).toBeCloseTo(1, 12);
    expect(score.error).toBeCloseTo(0, 12);
    expect(score.feedback).toContain('几乎完全重合');
  });

  it('an empty result is reported, not crashed on', () => {
    const empty: MultiPolygon = [];
    const score = compare(empty, level.target, level);
    expect(score.iou).toBeLessThan(0.001);
    expect(score.passed).toBe(false);
    expect(regionArea(empty)).toBe(0);
  });

  it('describes where a mismatch sits', () => {
    const topRight: MultiPolygon = [
      [
        [
          { x: 0.6, y: 0.6 },
          { x: 1, y: 0.6 },
          { x: 1, y: 1 },
          { x: 0.6, y: 1 },
        ],
      ],
    ];
    expect(describeRegion(topRight)).toBe('右上方');
    const centre: MultiPolygon = [
      [
        [
          { x: -0.05, y: -0.05 },
          { x: 0.05, y: -0.05 },
          { x: 0.05, y: 0.05 },
          { x: -0.05, y: 0.05 },
        ],
      ],
    ];
    expect(describeRegion(centre)).toBe('中心');
    expect(describeRegion([])).toBe('纸面');
  });

  it('reports hole counts on both sides', () => {
    const result = evaluateCut(level, level.solution);
    expect(result.score.holes).toBe(1);
    expect(result.score.targetHoles).toBe(1);
  });
});
