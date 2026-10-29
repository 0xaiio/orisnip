import type { Face, FoldOperation, MultiPolygon, Paper, Ring } from './types';
import { applyTransformRing, identity } from './transforms';
import { rectangle } from './polygons';

/**
 * Paper construction and packet queries.
 *
 * A sheet is modelled as a single simple convex polygon. Every fold splits
 * faces along the crease, so faces stay convex for the whole lifetime of the
 * document — a property the cut algorithm relies on.
 */

/** Build a square sheet centred at the origin, `[-a, a] x [-a, a]`. */
export function createSquareSheet(a = 1): Ring {
  return [
    { x: -a, y: -a },
    { x: a, y: -a },
    { x: a, y: a },
    { x: -a, y: a },
  ];
}

/** Build a rectangular sheet centred at the origin. */
export function createRectSheet(width = 2, height = 2): Ring {
  const hw = width / 2;
  const hh = height / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
}

/** A pristine sheet with a single uncut face. */
export function createPaper(sheet: Ring = createSquareSheet()): Paper {
  return {
    sheet,
    faces: [
      {
        id: 'f0',
        sheetRegion: sheet,
        transform: identity(),
        movedBy: [],
        stack: 0,
      },
    ],
    folds: [],
    nextFaceId: 1,
  };
}

/** The image of a face inside the folded packet. */
export const packetRingOf = (face: Face): Ring => applyTransformRing(face.transform, face.sheetRegion);

/** The silhouette of the folded packet, as a multi-polygon. */
export function packetRegion(paper: Paper): MultiPolygon {
  return paper.faces.map((f) => [packetRingOf(f)]);
}

/** Axis aligned bounds of the current packet. */
export function packetBounds(paper: Paper) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const face of paper.faces) {
    for (const p of packetRingOf(face)) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

/** Layer count of the folded packet, i.e. how many sheets the scissors cross. */
export const layerCount = (paper: Paper): number => paper.faces.length;

/* ------------------------------------------------------------------ */
/* Fold presets                                                        */
/* ------------------------------------------------------------------ */

export interface FoldPreset {
  id: string;
  /** Short label used on chips. */
  label: string;
  /** One-line explanation shown under the label. */
  hint: string;
  /** Ordered folds. Empty for the "no fold" preset. */
  folds: FoldOperation[];
}

const creaseX: FoldOperation = {
  id: 'crease-x',
  kind: 'vertical',
  label: '左右对折',
  line: { point: { x: 0, y: 0 }, normal: { x: 1, y: 0 } },
  movingSide: 'negative',
};

const creaseY: FoldOperation = {
  id: 'crease-y',
  kind: 'horizontal',
  label: '上下对折',
  line: { point: { x: 0, y: 0 }, normal: { x: 0, y: 1 } },
  movingSide: 'negative',
};

const creaseDiag: FoldOperation = {
  id: 'crease-diag',
  kind: 'diagonal',
  label: '对角对折',
  line: { point: { x: 0, y: 0 }, normal: { x: Math.SQRT1_2, y: Math.SQRT1_2 } },
  movingSide: 'negative',
};

/**
 * The fold plans a player may choose in the puzzle and in the studio.
 *
 * The set is deliberately small and *verifiable*: every plan is a real
 * sequence of creases with an exact isometry per face. There is no
 * "decorative crease" that the engine cannot reproduce.
 */
export const FOLD_PRESETS: FoldPreset[] = [
  {
    id: 'none',
    label: '不折',
    hint: '一张完整的纸，剪一刀得到一条边',
    folds: [],
  },
  {
    id: 'fold-x',
    label: '左右对折',
    hint: 'u = |x|，左右对称',
    folds: [creaseX],
  },
  {
    id: 'fold-y',
    label: '上下对折',
    hint: 'v = |y|，上下对称',
    folds: [creaseY],
  },
  {
    id: 'fold-xy',
    label: '先左右，再上下',
    hint: 'u = |x|, v = |y|，四重对称',
    folds: [creaseX, creaseY],
  },
  {
    id: 'fold-yx',
    label: '先上下，再左右',
    hint: '同样的四重对称，层序不同',
    folds: [creaseY, creaseX],
  },
  {
    id: 'fold-diag',
    label: '对角对折',
    hint: '沿对角线折成三角形，二重对称',
    folds: [creaseDiag],
  },
];

export const getFoldPreset = (id: string): FoldPreset =>
  FOLD_PRESETS.find((p) => p.id === id) ?? FOLD_PRESETS[0];

/**
 * A rectangle that comfortably contains the packet, used to intersect a
 * half-plane with a bounded region when we need boolean-safe clipping.
 */
export function packetClipBox(paper: Paper, margin = 1) {
  const b = packetBounds(paper);
  return rectangle(b.minX - margin, b.minY - margin, b.maxX + margin, b.maxY + margin);
}
