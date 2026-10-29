import polygonClipping from 'polygon-clipping';
import type { Line, MultiPolygon, PolygonRegion, Ring, Vec2 } from './types';
import { dedupeRing, isDegenerateRing, polygonArea, signedArea, signedDistance } from './vec';

/**
 * Polygon layer.
 *
 * Two complementary strategies are used:
 *
 * 1. **Half-plane clipping** (Sutherland-Hodgman) for cutting a *convex* face.
 *    Faces produced by folding a convex sheet are always convex, so this path
 *    is exact and allocation-cheap — it is what the scissors use.
 * 2. **Boolean operations** (`polygon-clipping`, Martinez-Rueda based) for
 *    merging unfolded faces into a single artwork, which may be non-convex,
 *    disconnected, or contain holes.
 *
 * Keeping both is a deliberate correctness decision: boolean libraries are
 * most fragile precisely at the cases that dominate folding (many collinear
 * and coincident edges), so the hot path avoids them entirely.
 *
 * Type reminder, because the nesting is easy to get wrong:
 *
 *   Ring        = Vec2[]        a closed loop
 *   Polygon     = Ring[]        [outer, ...holes]
 *   MultiPolygon = Polygon[]    a set of disjoint polygons
 */

type PcRing = [number, number][];
type PcPolygon = PcRing[];
type PcMultiPolygon = PcPolygon[];

const toPc = (ring: Ring): PcRing => ring.map((p) => [p.x, p.y] as [number, number]);

const fromPc = (mp: PcMultiPolygon): MultiPolygon =>
  mp.map((poly) => poly.map((ring) => ring.map(([x, y]) => ({ x, y }) as Vec2)));

/** Wrap a single ring into a region. */
export const asRegion = (ring: Ring): MultiPolygon => [[ring]];

/** Wrap a single ring into a polygon (outer ring, no holes). */
export const asPolygon = (ring: Ring): PolygonRegion => [ring];

export const EMPTY_REGION: MultiPolygon = [];

/** Total area of a region. */
export const regionArea = (mp: MultiPolygon): number =>
  mp.reduce((s, p) => s + polygonArea(p), 0);

/** Clip a convex ring against a half-plane, keeping `keep * d >= 0`. */
export function clipHalfPlane(ring: Ring, line: Line, keep: 1 | -1, eps = 1e-9): Ring {
  if (ring.length < 3) return [];
  const out: Vec2[] = [];
  const side = (p: Vec2) => keep * signedDistance(p, line.point, line.normal);
  for (let i = 0, n = ring.length; i < n; i++) {
    const cur = ring[i];
    const nxt = ring[(i + 1) % n];
    const dc = side(cur);
    const dn = side(nxt);
    if (dc >= -eps) out.push(cur);
    if ((dc > eps && dn < -eps) || (dc < -eps && dn > eps)) {
      const t = dc / (dc - dn);
      out.push({ x: cur.x + (nxt.x - cur.x) * t, y: cur.y + (nxt.y - cur.y) * t });
    }
  }
  const clean = dedupeRing(out);
  return isDegenerateRing(clean) ? [] : clean;
}

/** Split a convex ring into the two closed halves of a line. */
export function splitConvex(ring: Ring, line: Line): { positive: Ring; negative: Ring } {
  return {
    positive: clipHalfPlane(ring, line, 1),
    negative: clipHalfPlane(ring, line, -1),
  };
}

/**
 * Discard degenerate rings and normalise winding:
 * outer rings counter-clockwise, holes clockwise.
 */
export function cleanPolygon(poly: MultiPolygon): MultiPolygon {
  const out: MultiPolygon = [];
  for (const piece of poly) {
    const rings: PolygonRegion = [];
    for (const ring of piece) {
      const clean = dedupeRing(ring);
      if (!isDegenerateRing(clean, 1e-9)) rings.push(clean);
    }
    if (rings.length === 0) continue;
    if (signedArea(rings[0]) < 0) rings[0] = rings[0].slice().reverse();
    for (let i = 1; i < rings.length; i++) {
      if (signedArea(rings[i]) > 0) rings[i] = rings[i].slice().reverse();
    }
    out.push(rings);
  }
  return out;
}

/** Union of many regions (each may itself contain several polygons). */
export function unionRegions(regions: MultiPolygon[]): MultiPolygon {
  const flat: MultiPolygon = [];
  for (const region of regions) for (const poly of region) if (poly.length > 0) flat.push(poly);
  if (flat.length === 0) return [];
  try {
    const result = polygonClipping.union(flat.map((poly) => poly.map(toPc)) as PcMultiPolygon);
    return cleanPolygon(fromPc(result as PcMultiPolygon));
  } catch {
    // A boolean failure must never crash the app; keeping the first component
    // is visually incomplete but preserves the session and the fold history.
    return cleanPolygon([flat[0]]);
  }
}

export function intersectRegions(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0 || b.length === 0) return [];
  try {
    const result = polygonClipping.intersection(
      a.map((poly) => poly.map(toPc)) as PcMultiPolygon,
      b.map((poly) => poly.map(toPc)) as PcMultiPolygon,
    );
    return cleanPolygon(fromPc(result as PcMultiPolygon));
  } catch {
    return [];
  }
}

export function subtractRegions(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0) return [];
  if (b.length === 0) return cleanPolygon(a);
  try {
    const result = polygonClipping.difference(
      a.map((poly) => poly.map(toPc)) as PcMultiPolygon,
      b.map((poly) => poly.map(toPc)) as PcMultiPolygon,
    );
    return cleanPolygon(fromPc(result as PcMultiPolygon));
  } catch {
    return cleanPolygon(a);
  }
}

/** Intersection-over-union of two regions — the basis of puzzle scoring. */
export function iou(a: MultiPolygon, b: MultiPolygon): number {
  const unionArea = regionArea(unionRegions([a, b]));
  if (unionArea <= 1e-12) return 1;
  const interArea = regionArea(intersectRegions(a, b));
  return Math.max(0, Math.min(1, interArea / unionArea));
}

/** Area of the symmetric difference, in sheet units. */
export function symmetricDifferenceArea(a: MultiPolygon, b: MultiPolygon): number {
  return regionArea(subtractRegions(a, b)) + regionArea(subtractRegions(b, a));
}

/** Total boundary length of a region, holes included. */
export function perimeterOf(mp: MultiPolygon): number {
  let total = 0;
  for (const poly of mp) {
    for (const ring of poly) {
      for (let i = 0, n = ring.length; i < n; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % n];
        total += Math.hypot(b.x - a.x, b.y - a.y);
      }
    }
  }
  return total;
}

/** Number of holes across all components. */
export function countHoles(mp: MultiPolygon): number {
  return mp.reduce((s, poly) => s + Math.max(0, poly.length - 1), 0);
}

/** Rectangle ring helper, used for half-plane intersections and level targets. */
export function rectangle(minX: number, minY: number, maxX: number, maxY: number): Ring {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

export const ringArea = (ring: Ring): number => Math.abs(signedArea(ring));

/** Does a segment touch a ring at all? */
export function segmentIntersectsRing(a: Vec2, b: Vec2, ring: Ring): boolean {
  for (let i = 0, n = ring.length; i < n; i++) {
    if (segmentsIntersect(a, b, ring[i], ring[(i + 1) % n])) return true;
  }
  return false;
}

export function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d1 = orientation(p3, p4, p1);
  const d2 = orientation(p3, p4, p2);
  const d3 = orientation(p1, p2, p3);
  const d4 = orientation(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  const onSeg = (p: Vec2, q: Vec2, r: Vec2) =>
    Math.min(p.x, q.x) - 1e-9 <= r.x &&
    r.x <= Math.max(p.x, q.x) + 1e-9 &&
    Math.min(p.y, q.y) - 1e-9 <= r.y &&
    r.y <= Math.max(p.y, q.y) + 1e-9;
  if (Math.abs(d1) < 1e-9 && onSeg(p3, p4, p1)) return true;
  if (Math.abs(d2) < 1e-9 && onSeg(p3, p4, p2)) return true;
  if (Math.abs(d3) < 1e-9 && onSeg(p1, p2, p3)) return true;
  if (Math.abs(d4) < 1e-9 && onSeg(p1, p2, p4)) return true;
  return false;
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  return abx * acy - aby * acx;
}
