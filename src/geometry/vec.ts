import type { Vec2 } from './types';

export const EPS = 1e-9;

export const v = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** 90 degree counter-clockwise rotation. */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  if (l < EPS) return { x: 0, y: 0 };
  return { x: a.x / l, y: a.y / l };
}

export const equals = (a: Vec2, b: Vec2, eps = 1e-7): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;

export const round = (a: Vec2, digits = 6): Vec2 => {
  const f = 10 ** digits;
  return { x: Math.round(a.x * f) / f, y: Math.round(a.y * f) / f };
};

/** Signed area of a ring (positive for counter-clockwise winding). */
export function signedArea(ring: Vec2[]): number {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

/** Area of a polygon with holes. */
export function polygonArea(poly: Vec2[][]): number {
  if (poly.length === 0) return 0;
  let a = Math.abs(signedArea(poly[0]));
  for (let i = 1; i < poly.length; i++) a -= Math.abs(signedArea(poly[i]));
  return Math.max(0, a);
}

export function multiPolygonArea(mp: Vec2[][][]): number {
  return mp.reduce((sum, p) => sum + polygonArea(p), 0);
}

/** Centroid of a ring, falling back to the vertex average for degenerate rings. */
export function centroid(ring: Vec2[]): Vec2 {
  const a = signedArea(ring);
  if (Math.abs(a) < 1e-12) {
    if (ring.length === 0) return { x: 0, y: 0 };
    const s = ring.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
    return scale(s, 1 / ring.length);
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function bboxOf(rings: Vec2[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/** Signed distance to an infinite line; positive on the normal's side. */
export function signedDistance(p: Vec2, point: Vec2, normal: Vec2): number {
  return normal.x * (p.x - point.x) + normal.y * (p.y - point.y);
}

/**
 * Even-odd point-in-polygon test across a polygon with holes.
 * Points exactly on an edge are treated as inside.
 */
export function pointInPolygon(p: Vec2, poly: Vec2[][]): boolean {
  let inside = false;
  for (const ring of poly) {
    for (let i = 0, n = ring.length; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      if (pointOnSegment(p, a, b, 1e-9)) return true;
      const intersects = a.y > p.y !== b.y > p.y;
      if (intersects) {
        const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
        if (x > p.x) inside = !inside;
      }
    }
  }
  return inside;
}

export function pointOnSegment(p: Vec2, a: Vec2, b: Vec2, eps = 1e-9): boolean {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const area = cross(ab, ap);
  if (Math.abs(area) > eps * Math.max(1, len(ab))) return false;
  const t = dot(ap, ab);
  return t >= -eps && t <= dot(ab, ab) + eps;
}

/** Remove consecutive duplicate vertices, including a duplicated closing vertex. */
export function dedupeRing(ring: Vec2[], eps = 1e-9): Vec2[] {
  const out: Vec2[] = [];
  for (const p of ring) {
    if (out.length === 0 || !equals(out[out.length - 1], p, eps)) out.push(p);
  }
  while (out.length > 1 && equals(out[0], out[out.length - 1], eps)) out.pop();
  return out;
}

/** True when a ring encloses (numerically) zero area. */
export const isDegenerateRing = (ring: Vec2[], eps = 1e-10): boolean =>
  ring.length < 3 || Math.abs(signedArea(ring)) < eps;
