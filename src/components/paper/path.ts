import type { Line, MultiPolygon, Ring, Vec2 } from '@/geometry/types';

/**
 * Tiny SVG helpers. Keeping them pure makes the export pipeline and the
 * on-screen renderer share exactly the same path data — the SVG a user
 * downloads is the SVG they saw.
 */

const n = (value: number): string => {
  const rounded = Math.round(value * 1e4) / 1e4;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

export function ringToPath(ring: Ring, close = true): string {
  if (ring.length === 0) return '';
  let d = `M${n(ring[0].x)} ${n(ring[0].y)}`;
  for (let i = 1; i < ring.length; i++) d += `L${n(ring[i].x)} ${n(ring[i].y)}`;
  return close ? `${d}Z` : d;
}

/**
 * A multi-polygon as a single path. Every ring is emitted, so interior rings
 * become holes under `fill-rule: evenodd` (and under `nonzero` too, because
 * `cleanPolygon` already assigns opposite windings).
 */
export function regionToPath(region: MultiPolygon): string {
  const parts: string[] = [];
  for (const poly of region) {
    for (const ring of poly) {
      const d = ringToPath(ring);
      if (d) parts.push(d);
    }
  }
  return parts.join('');
}

/** Intersections of an infinite line with an axis-aligned rectangle. */
export function lineRectIntersections(
  line: Line,
  rect: { minX: number; minY: number; maxX: number; maxY: number },
): [Vec2, Vec2] | null {
  const { point, normal } = line;
  // Direction along the line.
  const dir = { x: -normal.y, y: normal.x };
  const hits: Vec2[] = [];
  const eps = 1e-12;

  const push = (x: number, y: number) => {
    if (x < rect.minX - 1e-9 || x > rect.maxX + 1e-9) return;
    if (y < rect.minY - 1e-9 || y > rect.maxY + 1e-9) return;
    if (hits.some((h) => Math.abs(h.x - x) < 1e-7 && Math.abs(h.y - y) < 1e-7)) return;
    hits.push({ x, y });
  };

  if (Math.abs(dir.x) > eps) {
    for (const x of [rect.minX, rect.maxX]) {
      const t = (x - point.x) / dir.x;
      push(x, point.y + t * dir.y);
    }
  }
  if (Math.abs(dir.y) > eps) {
    for (const y of [rect.minY, rect.maxY]) {
      const t = (y - point.y) / dir.y;
      push(point.x + t * dir.x, y);
    }
  }

  if (hits.length < 2) return null;
  // Pick the two furthest apart for a stable handle pair.
  let best: [Vec2, Vec2] = [hits[0], hits[1]];
  let bestDist = -1;
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      const d = Math.hypot(hits[i].x - hits[j].x, hits[i].y - hits[j].y);
      if (d > bestDist) {
        bestDist = d;
        best = [hits[i], hits[j]];
      }
    }
  }
  return best;
}

/** Compact polyline for a crease guide. */
export const segmentPath = (a: Vec2, b: Vec2): string =>
  `M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}`;

export const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const angleOf = (a: Vec2, b: Vec2): number => Math.atan2(b.y - a.y, b.x - a.x);

/** Degrees in [0, 180) for display. */
export const angleDeg = (a: Vec2, b: Vec2): number => {
  let deg = (angleOf(a, b) * 180) / Math.PI;
  deg = ((deg % 180) + 180) % 180;
  return deg;
};

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);
