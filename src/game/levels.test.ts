import { describe, expect, it } from 'vitest';
import { LEVELS, getLevel, nextLevel, foldLabel, resolveLevel } from './levels';
import { validateCut } from '@/geometry/cuts';
import { evaluateCut } from './scoring';
import { asRegion, iou, regionArea } from '@/geometry/polygons';

/**
 * Level integrity.
 *
 * The contract of the game mode is simple and testable: every level has at
 * least one cut that wins, and the cut we hand the player does *not*.
 */

describe('puzzle levels', () => {
  it('has at least six distinct levels with unique ids', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(LEVELS.map((l) => l.id));
    expect(ids.size).toBe(LEVELS.length);
    const indices = LEVELS.map((l) => l.index).sort((a, b) => a - b);
    expect(indices).toEqual(Array.from({ length: LEVELS.length }, (_, i) => i + 1));
  });

  it('every level carries complete metadata', () => {
    for (const level of LEVELS) {
      expect(level.name.length).toBeGreaterThan(0);
      expect(level.brief.length).toBeGreaterThan(10);
      expect(level.hints.length).toBeGreaterThanOrEqual(2);
      expect(level.knowledge.title.length).toBeGreaterThan(0);
      expect(level.knowledge.body.length).toBeGreaterThan(20);
      expect(level.tolerance).toBeGreaterThan(0.8);
      expect(level.tolerance).toBeLessThan(1);
      expect(foldLabel(level).length).toBeGreaterThan(0);
    }
  });

  it('the reference solution is a legal cut and wins with IoU ≈ 1', () => {
    for (const level of LEVELS) {
      const verdict = validateCut(level.packet, level.solution);
      expect(verdict.ok, `${level.id}: ${verdict.message}`).toBe(true);
      const result = evaluateCut(level, level.solution);
      expect(result.score.iou, level.id).toBeGreaterThan(0.999);
      expect(result.score.passed, level.id).toBe(true);
      expect(result.score.grade, level.id).toBe('perfect');
    }
  });

  it('the cut handed to the player does NOT already pass', () => {
    for (const level of LEVELS) {
      const result = evaluateCut(level, level.start);
      expect(result.score.passed, `${level.id} starts solved (IoU ${result.score.iou.toFixed(3)})`).toBe(false);
    }
  });

  it('targets are real subsets of the sheet with sane area', () => {
    for (const level of LEVELS) {
      expect(level.targetArea).toBeGreaterThan(0.5);
      expect(level.targetArea).toBeLessThan(4);
      const area = regionArea(level.target);
      expect(area).toBeCloseTo(level.targetArea, 9);
      for (const poly of level.target) {
        for (const p of poly[0]) {
          expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
          expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });

  it('targets differ from each other', () => {
    for (let i = 0; i < LEVELS.length; i++) {
      for (let j = i + 1; j < LEVELS.length; j++) {
        const same = iou(LEVELS[i].target, LEVELS[j].target);
        expect(same, `${LEVELS[i].id} vs ${LEVELS[j].id}`).toBeLessThan(0.999);
      }
    }
  });

  it('a cut that removes nothing is rejected instead of scoring', () => {
    const level = getLevel('l3')!;
    const verdict = validateCut(level.packet, {
      a: { x: 2.4, y: 2.4 },
      b: { x: 2.9, y: 2.4 },
      keepSide: -1,
    });
    expect(verdict.ok).toBe(false);
  });

  it('resolution is cached and stable', () => {
    const a = resolveLevel(LEVELS[0]);
    const b = resolveLevel(LEVELS[0]);
    expect(a).toBe(b);
    expect(a.target).toEqual(b.target);
  });

  it('nextLevel walks the list and stops at the end', () => {
    expect(nextLevel('l1')?.id).toBe('l2');
    expect(nextLevel(LEVELS[LEVELS.length - 1].id)).toBeUndefined();
    expect(nextLevel('nope')).toBeUndefined();
  });

  it('a target can be reproduced from the sheet it claims to live on', () => {
    const level = getLevel('l3')!;
    expect(iou(level.target, asRegion(level.packet.sheet))).toBeLessThan(1);
    expect(level.targetHoles).toBe(1);
  });
});
