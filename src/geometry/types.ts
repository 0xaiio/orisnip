/**
 * Core geometric primitives for the Orisnip paper engine.
 *
 * Coordinate systems
 * ------------------
 * - **Sheet coordinates** (`sheet`): the original, unfolded sheet of paper.
 *   Orisnip uses a square sheet centred at the origin: [-a, a] x [-a, a].
 * - **Packet coordinates** (`packet`): the folded stack the scissors actually
 *   travel through. Every face carries a rigid transform sheet -> packet.
 *
 * All geometry is stored as `Vec2` objects rather than tuples so that the
 * domain layer stays readable and is not coupled to a specific boolean
 * library's wire format.
 */

/** A point or vector in 2D. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * A closed ring of vertices. The closing edge is implicit: the last vertex
 * connects back to the first one, and the first vertex must not be repeated.
 */
export type Ring = Vec2[];

/**
 * A polygon: `[outerRing, ...holes]`.
 *
 * Faces produced by the folding engine are always simple convex polygons with
 * no holes, but unfolded results may contain holes, hence the general type.
 */
export type PolygonRegion = Ring[];

/** A disjoint set of polygons, each of which may carry holes. */
export type MultiPolygon = PolygonRegion[];

/**
 * A 2D rigid transform (isometry) written as
 *
 *   T(p) = M p + t,   M = [[a, b], [c, d]]
 *
 * `M` is orthogonal: `det(M)` is `+1` for a rotation and `-1` for a
 * reflection. Both are required: folding a flap *is* a reflection.
 */
export interface RigidTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

/**
 * An infinite line used as a crease or a cut line.
 *
 * `normal` must be a unit vector. The positive half-plane is defined by
 * `normal . (p - point) >= 0`.
 */
export interface Line {
  point: Vec2;
  normal: Vec2;
}

/** Classification of how a piece of paper sits relative to a fold line. */
export type Side = 'positive' | 'negative';

/** Fold archetypes supported by the P0 engine. */
export type FoldKind = 'vertical' | 'horizontal' | 'diagonal' | 'custom';

/**
 * A single fold instruction, expressed in the packet frame *at the moment the
 * fold is performed*.
 */
export interface FoldOperation {
  id: string;
  kind: FoldKind;
  /** Short human readable label, e.g. "沿中线对折". */
  label: string;
  /** Crease line in packet coordinates. */
  line: Line;
  /** Which half is picked up and folded over the other half. */
  movingSide: Side;
}

/**
 * A triangular face of the sheet, i.e. one rigid piece of paper.
 *
 * The union of all faces over a state is exactly the remaining sheet, and each
 * face is mapped into the packet by `transform`.
 */
export interface Face {
  id: string;
  /** Region of the original sheet occupied by this face, in sheet coordinates. */
  sheetRegion: Ring;
  /** sheet -> packet isometry. */
  transform: RigidTransform;
  /** Indices of the folds that moved this face, in application order. */
  movedBy: number[];
  /** Stacking index inside the packet; 0 is the bottom sheet. */
  stack: number;
}

/** A "layer" is a contiguous run of faces sharing the same packet footprint order. */
export interface PaperLayer {
  index: number;
  faces: Face[];
}

/** The complete state of a sheet of paper: geometry plus fold history. */
export interface Paper {
  /** The original sheet outline in sheet coordinates. */
  sheet: Ring;
  /** Remaining faces, ordered bottom -> top inside the packet. */
  faces: Face[];
  /** Folds applied so far, in order. */
  folds: FoldOperation[];
  /** Monotonic counter used to mint deterministic face ids. */
  nextFaceId: number;
}

/** A straight cut through the folded packet, defined by two points. */
export interface StraightCut {
  a: Vec2;
  b: Vec2;
  /**
   * Which side of the directed line survives.
   * `+1` keeps `normal . (p - a) >= 0`; `-1` keeps the opposite half-plane.
   */
  keepSide: 1 | -1;
}

/** A cut that has been applied to a paper state. */
export interface CutOperation {
  cut: StraightCut;
  /** The line derived from the cut's two points. */
  line: Line;
  /** Length of the segment the user drew, in packet units. */
  length: number;
}

/** Result of cutting a paper state. */
export interface CutResult {
  /** Paper state after the cut (still folded). */
  paper: Paper;
  /** Faces that survived, with their pre-cut geometry, for animation. */
  kept: Face[];
  /** Faces (or fragments) that were cut away. */
  removed: Face[];
  /** Total area removed, in sheet units. */
  removedArea: number;
}

/**
 * The unfolded artwork.
 *
 * `region` is the remaining paper expressed as a multi-polygon in sheet
 * coordinates, with interior holes represented as extra rings.
 */
export interface UnfoldResult {
  region: MultiPolygon;
  /** Remaining paper area. */
  area: number;
  /** Original sheet area. */
  sheetArea: number;
  /** Area removed by all cuts, i.e. `sheetArea - area`. */
  removedArea: number;
  /** Total length of the boundary of `region`, useful for complexity metrics. */
  perimeter: number;
  /** Axis-aligned bounds of the remaining paper. */
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  /** Number of separate pieces (a "confetti" cut produces many). */
  pieceCount: number;
  /** Number of enclosed holes. */
  holeCount: number;
}

/** Why a cut or fold was rejected. */
export type ValidationCode =
  | 'ok'
  | 'zero-length'
  | 'no-intersection'
  | 'outside-paper'
  | 'empty-result'
  | 'too-short'
  | 'invalid-fold';

/** The outcome of validating a user operation. */
export interface ValidationResult {
  ok: boolean;
  code: ValidationCode;
  /** Human readable Chinese explanation, shown directly in the UI. */
  message: string;
  /** Extra numbers the UI may want to surface (offsets, areas, ...). */
  detail?: Record<string, number>;
}
