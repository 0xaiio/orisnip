import { describe, expect, it } from 'vitest';
import type { MultiPolygon, Paper, Ring, StraightCut, Vec2 } from './types';
import { applyCut, validateCut } from './cuts';
import { buildPacket } from './folds';
import { FOLD_PRESETS, createPaper, createSquareSheet } from './paper';
import { buildUnfoldStages, transformAtStage, unfold } from './unfold';
import { applyTransform, compose, invert, reflection } from './transforms';
import {
  asRegion,
  cleanPolygon,
  intersectRegions,
  iou,
  regionArea,
  subtractRegions,
  symmetricDifferenceArea,
  unionRegions,
} from './polygons';
import { pointInPolygon, polygonArea, signedArea } from './vec';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const square = createSquareSheet(1);

const diamond = (d: number): Ring => [
  { x: d, y: 0 },
  { x: 0, y: d },
  { x: -d, y: 0 },
  { x: 0, y: -d },
];

const areaOf = (mp: MultiPolygon): number => mp.reduce((s, p) => s + polygonArea(p), 0);

const cut = (paper: Paper, a: Vec2, b: Vec2, keepSide: 1 | -1 = 1) =>
  applyCut(paper, { a, b, keepSide });

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* ------------------------------------------------------------------ */
/* 1. golden tests                                                      */
/* ------------------------------------------------------------------ */

describe('golden: fold-and-cut mathematics', () => {
  it('01 — no fold, no cut: the result is the original sheet', () => {
    const paper = createPaper(square);
    const result = unfold(paper);
    expect(result.pieceCount).toBe(1);
    expect(result.holeCount).toBe(0);
    expect(result.area).toBeCloseTo(4, 10);
    expect(result.removedArea).toBeCloseTo(0, 10);
    expect(iou(result.region, asRegion(square))).toBeCloseTo(1, 10);
  });

  it('02 — one mirror fold, then unfold, restores the original shape', () => {
    const packet = buildPacket('fold-x');
    expect(packet.faces.length).toBe(2);
    const result = unfold(packet);
    expect(result.area).toBeCloseTo(4, 10);
    expect(iou(result.region, asRegion(square))).toBeCloseTo(1, 10);
    expect(result.pieceCount).toBe(1);
  });

  it('03 — two orthogonal folds, then unfold, restores the original shape', () => {
    const packet = buildPacket('fold-xy');
    expect(packet.faces.length).toBe(4);
    const result = unfold(packet);
    expect(result.area).toBeCloseTo(4, 10);
    expect(iou(result.region, asRegion(square))).toBeCloseTo(1, 10);
    expect(result.holeCount).toBe(0);
  });

  it('04 — two orthogonal folds + corner triangle cut => diamond hole |x|+|y| < d', () => {
    const d = 0.55;
    const packet = buildPacket('fold-xy');
    const cutResult = cut(packet, { x: 0, y: d }, { x: d, y: 0 }, 1);
    // Four stacked layers each lose a right triangle of legs d, so the sheet
    // loses 4 * (d^2 / 2) = 2 d^2 — exactly the area of the unfolded diamond.
    expect(cutResult.removedArea).toBeCloseTo(2 * d * d, 10);

    const result = unfold(cutResult.paper);
    expect(result.holeCount).toBe(1);
    expect(result.pieceCount).toBe(1);
    expect(result.area).toBeCloseTo(4 - 2 * d * d, 8);

    const expected = subtractRegions(asRegion(square), asRegion(diamond(d)));
    expect(iou(result.region, expected)).toBeCloseTo(1, 8);
    expect(symmetricDifferenceArea(result.region, expected)).toBeLessThan(1e-9);

    // The hole really is the open diamond |x| + |y| < d.
    expect(pointInPolygon({ x: 0, y: 0 }, result.region.flat())).toBe(false);
    expect(pointInPolygon({ x: d * 0.4, y: d * 0.4 }, result.region.flat())).toBe(false);
    expect(pointInPolygon({ x: d * 0.5, y: d * 0.2 }, result.region.flat())).toBe(false);
    // Just outside a tip, and out at the corners, the paper is intact.
    expect(pointInPolygon({ x: d * 1.15, y: 0 }, result.region.flat())).toBe(true);
    expect(pointInPolygon({ x: 0, y: -d * 1.15 }, result.region.flat())).toBe(true);
    expect(pointInPolygon({ x: d, y: d }, result.region.flat())).toBe(true);

    // D2 symmetry of the hole.
    for (const p of [
      { x: 0.37, y: 0.04 },
      { x: -0.12, y: 0.29 },
    ]) {
      const inside = pointInPolygon(p, result.region.flat());
      expect(pointInPolygon({ x: -p.x, y: p.y }, result.region.flat())).toBe(inside);
      expect(pointInPolygon({ x: p.x, y: -p.y }, result.region.flat())).toBe(inside);
      expect(pointInPolygon({ x: -p.x, y: -p.y }, result.region.flat())).toBe(inside);
    }
  });

  it('05 — changing the intercept changes the hole size continuously', () => {
    const areas: number[] = [];
    for (const d of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const packet = buildPacket('fold-xy');
      const result = unfold(cut(packet, { x: 0, y: d }, { x: d, y: 0 }, 1).paper);
      expect(result.area).toBeCloseTo(4 - 2 * d * d, 8);
      const expected = subtractRegions(asRegion(square), asRegion(diamond(d)));
      expect(iou(result.region, expected)).toBeCloseTo(1, 8);
      areas.push(result.area);
    }
    for (let i = 1; i < areas.length; i++) expect(areas[i]).toBeLessThan(areas[i - 1]);
  });

  it('06 — a cut that misses the paper is rejected, not silently ignored', () => {
    const packet = buildPacket('fold-xy');
    const outside: StraightCut = { a: { x: 2, y: 2 }, b: { x: 3, y: 2 }, keepSide: -1 };
    const verdict = validateCut(packet, outside);
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('no-intersection');
    // Applying it anyway must leave the geometry untouched.
    const applied = applyCut(packet, outside);
    expect(unfold(applied.paper).area).toBeCloseTo(unfold(packet).area, 10);
  });

  it('07 — a zero-length cut reports an explicit error', () => {
    const packet = buildPacket('fold-xy');
    const verdict = validateCut(packet, { a: { x: 0.5, y: 0.5 }, b: { x: 0.5, y: 0.5 }, keepSide: 1 });
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('zero-length');
  });

  it('08 — symmetric folds produce symmetric results', () => {
    const packet = buildPacket('fold-xy');
    const result = unfold(cut(packet, { x: 0.1, y: 1 }, { x: 0.8, y: 0.1 }, 1).paper);
    // D2 symmetry: invariant under x -> -x and y -> -y.
    for (const p of [
      { x: 0.42, y: -0.31 },
      { x: -0.6, y: 0.2 },
      { x: 0.15, y: 0.77 },
      { x: -0.83, y: -0.44 },
    ]) {
      const inside = pointInPolygon(p, result.region.flat());
      expect(pointInPolygon({ x: -p.x, y: p.y }, result.region.flat())).toBe(inside);
      expect(pointInPolygon({ x: p.x, y: -p.y }, result.region.flat())).toBe(inside);
      expect(pointInPolygon({ x: -p.x, y: -p.y }, result.region.flat())).toBe(inside);
    }
  });

  it('09 — every vertex of the result lies inside the original sheet', () => {
    for (const preset of FOLD_PRESETS) {
      const packet = buildPacket(preset.id);
      const result = unfold(cut(packet, { x: 0.05, y: 0.9 }, { x: 0.9, y: 0.05 }, 1).paper);
      for (const poly of result.region) {
        for (const ring of poly) {
          for (const p of ring) {
            expect(p.x).toBeGreaterThanOrEqual(-1 - 1e-9);
            expect(p.x).toBeLessThanOrEqual(1 + 1e-9);
            expect(p.y).toBeGreaterThanOrEqual(-1 - 1e-9);
            expect(p.y).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. invariants                                                        */
/* ------------------------------------------------------------------ */

describe('invariants: folding', () => {
  it('faces always tile the sheet exactly', () => {
    for (const preset of FOLD_PRESETS) {
      const paper = buildPacket(preset.id);
      const total = paper.faces.reduce((s, f) => s + Math.abs(signedArea(f.sheetRegion)), 0);
      expect(total).toBeCloseTo(4, 9);
      const unioned = regionArea(unionRegions(paper.faces.map((f) => asRegion(f.sheetRegion))));
      expect(unioned).toBeCloseTo(4, 9);
    }
  });

  it('every face transform is an isometry and its inverse restores vertices', () => {
    const paper = buildPacket('fold-xy');
    for (const face of paper.faces) {
      const inv = invert(face.transform);
      for (const p of face.sheetRegion) {
        const back = applyTransform(inv, applyTransform(face.transform, p));
        expect(back.x).toBeCloseTo(p.x, 12);
        expect(back.y).toBeCloseTo(p.y, 12);
      }
    }
  });

  it('transformAtStage agrees with the stored transform at the final stage', () => {
    const paper = buildPacket('fold-yx');
    for (const face of paper.faces) {
      const rebuilt = transformAtStage(face, paper.folds, paper.folds.length);
      expect(rebuilt.a).toBeCloseTo(face.transform.a, 12);
      expect(rebuilt.b).toBeCloseTo(face.transform.b, 12);
      expect(rebuilt.c).toBeCloseTo(face.transform.c, 12);
      expect(rebuilt.d).toBeCloseTo(face.transform.d, 12);
      expect(rebuilt.tx).toBeCloseTo(face.transform.tx, 12);
      expect(rebuilt.ty).toBeCloseTo(face.transform.ty, 12);
    }
  });

  it('fold + cut never increases the paper area', () => {
    for (const preset of FOLD_PRESETS) {
      const packet = buildPacket(preset.id);
      const before = unfold(packet).area;
      for (const keep of [1, -1] as const) {
        const result = unfold(cut(packet, { x: 0.1, y: 0.8 }, { x: 0.8, y: 0.1 }, keep).paper);
        expect(result.area).toBeLessThanOrEqual(before + 1e-9);
        expect(result.removedArea).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('unfold stages form a chain that ends flat', () => {
    const packet = buildPacket('fold-xy');
    const cutResult = cut(packet, { x: 0, y: 0.5 }, { x: 0.5, y: 0 }, 1);
    const stages = buildUnfoldStages(cutResult.paper);
    expect(stages.length).toBe(packet.folds.length + 1);
    expect(stages[0].foldsApplied).toBe(2);
    expect(stages[stages.length - 1].foldsApplied).toBe(0);
    expect(stages[stages.length - 1].undoing).toBe(-1);

    // The final stage renders exactly the unfolded artwork.
    const flat: MultiPolygon = stages[stages.length - 1].faces.map((f) => [
      f.face.sheetRegion.map((p) => applyTransform(f.transform, p)),
    ]);
    expect(iou(cleanPolygon(flat), unfold(cutResult.paper).region)).toBeCloseTo(1, 9);
    // ...and its area matches the flat unfold, i.e. no piece was lost.
    expect(regionArea(cleanPolygon(flat))).toBeCloseTo(unfold(cutResult.paper).area, 9);
  });
});

/* ------------------------------------------------------------------ */
/* 3. property tests                                                    */
/* ------------------------------------------------------------------ */

describe('properties: randomised cuts', () => {
  it('area never grows, result stays inside the sheet, and runs are reproducible', () => {
    const rand = mulberry32(20241024);
    for (let i = 0; i < 120; i++) {
      const preset = FOLD_PRESETS[Math.floor(rand() * FOLD_PRESETS.length)];
      const packet = buildPacket(preset.id);
      const ax = rand() * 2 - 1;
      const ay = rand() * 2 - 1;
      const angle = rand() * Math.PI * 2;
      const length = 0.2 + rand() * 3;
      const bx = ax + Math.cos(angle) * length;
      const by = ay + Math.sin(angle) * length;
      const keepSide = rand() > 0.5 ? 1 : -1;

      const first = unfold(applyCut(packet, { a: { x: ax, y: ay }, b: { x: bx, y: by }, keepSide }).paper);
      const second = unfold(applyCut(packet, { a: { x: ax, y: ay }, b: { x: bx, y: by }, keepSide }).paper);

      expect(first.area).toBeLessThanOrEqual(4 + 1e-9);
      expect(first.area).toBeGreaterThanOrEqual(-1e-9);
      expect(first.area).toBeCloseTo(second.area, 12);
      expect(first.holeCount).toBe(second.holeCount);
      for (const poly of first.region) {
        for (const ring of poly) {
          for (const p of ring) {
            expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-7);
            expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-7);
          }
        }
      }
    }
  });

  it('reflection preserves distances and is its own inverse', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const angle = rand() * Math.PI * 2;
      const line = {
        point: { x: rand() * 2 - 1, y: rand() * 2 - 1 },
        normal: { x: Math.cos(angle), y: Math.sin(angle) },
      };
      const r = reflection(line);
      const p1 = { x: rand() * 2 - 1, y: rand() * 2 - 1 };
      const p2 = { x: rand() * 2 - 1, y: rand() * 2 - 1 };
      const q1 = applyTransform(r, p1);
      const q2 = applyTransform(r, p2);
      expect(Math.hypot(q1.x - q2.x, q1.y - q2.y)).toBeCloseTo(Math.hypot(p1.x - p2.x, p1.y - p2.y), 10);
      const back = applyTransform(compose(r, r), p1);
      expect(back.x).toBeCloseTo(p1.x, 10);
      expect(back.y).toBeCloseTo(p1.y, 10);
    }
  });

  it('degenerate input never crashes', () => {
    const degenerate: Ring = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ];
    const paper: Paper = {
      sheet: square,
      faces: [
        {
          id: 'x',
          sheetRegion: degenerate,
          transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
          movedBy: [],
          stack: 0,
        },
      ],
      folds: [],
      nextFaceId: 1,
    };
    expect(() => unfold(paper)).not.toThrow();
    expect(cleanPolygon([[degenerate]])).toEqual([]);
    expect(() => applyCut(paper, { a: { x: 2, y: 2 }, b: { x: 3, y: 3 }, keepSide: 1 })).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* 4. boolean sanity                                                    */
/* ------------------------------------------------------------------ */

describe('boolean layer', () => {
  it('union of adjacent faces has no holes and exact area', () => {
    const a: Ring = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const b: Ring = [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
    ];
    const u = unionRegions([asRegion(a), asRegion(b)]);
    expect(areaOf(u)).toBeCloseTo(2, 12);
    expect(u.length).toBe(1);
    expect(u[0].length).toBe(1);
  });

  it('intersection, difference and IoU are consistent', () => {
    const a: Ring = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    const b: Ring = [
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 3 },
      { x: 1, y: 3 },
    ];
    expect(areaOf(intersectRegions(asRegion(a), asRegion(b)))).toBeCloseTo(1, 12);
    expect(areaOf(subtractRegions(asRegion(a), asRegion(b)))).toBeCloseTo(3, 12);
    expect(iou(asRegion(a), asRegion(b))).toBeCloseTo(1 / 7, 10);
  });
});
