import type { Line, RigidTransform, Ring, Vec2 } from './types';
import { normalize, sub, perp } from './vec';

/**
 * Rigid transforms: the mathematical backbone of folding.
 *
 * Every face of the folded packet is related to the original sheet by an
 * isometry `T(p) = M p + t` with `M` orthogonal. Composition, inversion and
 * reflection all stay inside this closed family, which is what makes the
 * unfold step exact rather than approximate.
 */

export const identity = (): RigidTransform => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

export const translation = (tx: number, ty: number): RigidTransform => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  tx,
  ty,
});

export function rotation(angle: number): RigidTransform {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { a: c, b: -s, c: s, d: c, tx: 0, ty: 0 };
}

/** Apply a transform to a point. */
export function applyTransform(t: RigidTransform, p: Vec2): Vec2 {
  return {
    x: t.a * p.x + t.b * p.y + t.tx,
    y: t.c * p.x + t.d * p.y + t.ty,
  };
}

export function applyTransformRing(t: RigidTransform, ring: Ring): Ring {
  return ring.map((p) => applyTransform(t, p));
}

/** `compose(outer, inner)` applies `inner` first, then `outer`. */
export function compose(outer: RigidTransform, inner: RigidTransform): RigidTransform {
  const { a: a1, b: b1, c: c1, d: d1, tx: t1x, ty: t1y } = outer;
  const { a: a2, b: b2, c: c2, d: d2, tx: t2x, ty: t2y } = inner;
  return {
    a: a1 * a2 + b1 * c2,
    b: a1 * b2 + b1 * d2,
    c: c1 * a2 + d1 * c2,
    d: c1 * b2 + d1 * d2,
    tx: a1 * t2x + b1 * t2y + t1x,
    ty: c1 * t2x + d1 * t2y + t1y,
  };
}

/** Inverse of a rigid transform. Orthogonality makes this `M^T, -M^T t`. */
export function invert(t: RigidTransform): RigidTransform {
  const { a, b, c, d, tx, ty } = t;
  return {
    a,
    b: c,
    c: b,
    d,
    tx: -(a * tx + c * ty),
    ty: -(b * tx + d * ty),
  };
}

/** Determinant: `+1` for rotations, `-1` for reflections. */
export const determinant = (t: RigidTransform): number => t.a * t.d - t.b * t.c;

/** True when the transform reverses orientation. */
export const isReflection = (t: RigidTransform): boolean => determinant(t) < 0;

/**
 * Reflection across the line `normal . (p - point) = 0`.
 *
 *   p' = p - 2 (n . (p - point)) n
 */
export function reflection(line: Line): RigidTransform {
  const n = normalize(line.normal);
  const { x: px, y: py } = line.point;
  const k = 2 * (n.x * px + n.y * py);
  return {
    a: 1 - 2 * n.x * n.x,
    b: -2 * n.x * n.y,
    c: -2 * n.x * n.y,
    d: 1 - 2 * n.y * n.y,
    tx: k * n.x,
    ty: k * n.y,
  };
}

/**
 * A partial fold: the linear map "squash towards the crease by factor k".
 *
 * `k = 1` is the identity, `k = -1` is a full reflection, `k = 0` is edge-on.
 * This is precisely the 2D shadow of rotating a flap 180 degrees about the
 * crease, which is why the fold animation is honest rather than decorative.
 */
export function partialFold(line: Line, k: number): RigidTransform {
  const n = normalize(line.normal);
  const { x: px, y: py } = line.point;
  const f = 1 - k;
  const kx = f * (n.x * px + n.y * py);
  return {
    a: 1 - f * n.x * n.x,
    b: -f * n.x * n.y,
    c: -f * n.x * n.y,
    d: 1 - f * n.y * n.y,
    tx: kx * n.x,
    ty: kx * n.y,
  };
}

/** Build a line from two points; returns `null` for a degenerate segment. */
export function lineThrough(a: Vec2, b: Vec2): Line | null {
  const d = sub(b, a);
  if (Math.hypot(d.x, d.y) < 1e-9) return null;
  const n = normalize(perp(d));
  return { point: a, normal: n };
}

/** Does this transform preserve distances? Used by property tests. */
export function isIsometry(t: RigidTransform, eps = 1e-9): boolean {
  const col1 = { x: t.a, y: t.c };
  const col2 = { x: t.b, y: t.d };
  const n1 = col1.x * col1.x + col1.y * col1.y;
  const n2 = col2.x * col2.x + col2.y * col2.y;
  const dp = col1.x * col2.x + col1.y * col2.y;
  return Math.abs(n1 - 1) < 1e-6 + eps && Math.abs(n2 - 1) < 1e-6 + eps && Math.abs(dp) < 1e-6 + eps;
}

/** Human readable matrix, handy when debugging a puzzling unfold. */
export const formatTransform = (t: RigidTransform): string =>
  `[${t.a.toFixed(3)} ${t.b.toFixed(3)} ${t.tx.toFixed(3)}; ${t.c.toFixed(3)} ${t.d.toFixed(3)} ${t.ty.toFixed(3)}]`;
