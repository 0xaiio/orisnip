import type { StraightCut } from '@/geometry/types';
import { rotateCut } from '@/geometry/cuts';

/**
 * The AI designer's contract.
 *
 * The model never draws. It picks from a closed vocabulary that the geometry
 * engine can execute exactly:
 *
 *   fold   → one of the six verified fold plans
 *   cuts   → up to four "corners", each a chamfer of a given size and tilt
 *   colour → two hex values
 *
 * Everything else (the actual pattern, area, hole count) is computed. If the
 * model returns something outside this vocabulary, `parseDesign` rejects it and
 * the UI says so instead of rendering a guess.
 */

export const MAX_CUTS = 4;
export const FOLD_CHOICES = ['none', 'fold-x', 'fold-y', 'fold-xy', 'fold-yx', 'fold-diag'] as const;
export type FoldChoice = (typeof FOLD_CHOICES)[number];

export interface AiCut {
  /** `inner` chamfers the folded corner (it becomes a hole), `outer` the far corner. */
  corner: 'inner' | 'outer';
  /** Leg length of the chamfer, 0.1 – 0.9 of the packet. */
  size: number;
  /** Tilt in degrees, -40 – 40 around the default 45° chamfer. */
  angle: number;
  /** Keep the opposite side of the cut. */
  flip: boolean;
}

export interface AiDesign {
  title: string;
  description: string;
  fold: FoldChoice;
  palette: { paper: string; background: string };
  cuts: AiCut[];
  /** How the design abstracts the user's request. Always shown in the UI. */
  note: string;
}

export type ParseResult = { ok: true; design: AiDesign } | { ok: false; error: string };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value.trim());
}

/** Strict, defensive validation of whatever the model produced. */
export function parseDesign(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '输出不是 JSON 对象' };
  const o = raw as Record<string, unknown>;

  if (typeof o.title !== 'string' || o.title.trim().length === 0) {
    return { ok: false, error: '缺少标题' };
  }
  if (typeof o.description !== 'string') return { ok: false, error: '缺少描述' };
  if (typeof o.note !== 'string') return { ok: false, error: '缺少抽象说明' };

  const fold = o.fold;
  if (typeof fold !== 'string' || !FOLD_CHOICES.includes(fold as FoldChoice)) {
    return { ok: false, error: `不支持的折法：${String(fold)}` };
  }

  const palette = o.palette as Record<string, unknown> | undefined;
  if (!palette || !isHex(palette.paper) || !isHex(palette.background)) {
    return { ok: false, error: '配色必须是 #RRGGBB' };
  }

  if (!Array.isArray(o.cuts) || o.cuts.length === 0) return { ok: false, error: '没有给出切口' };
  if (o.cuts.length > MAX_CUTS) return { ok: false, error: `切口过多（最多 ${MAX_CUTS} 条）` };

  const cuts: AiCut[] = [];
  for (const [i, item] of o.cuts.entries()) {
    if (!item || typeof item !== 'object') return { ok: false, error: `第 ${i + 1} 条切口格式错误` };
    const c = item as Record<string, unknown>;
    if (c.corner !== 'inner' && c.corner !== 'outer') {
      return { ok: false, error: `第 ${i + 1} 条切口的 corner 只能是 inner 或 outer` };
    }
    const size = Number(c.size);
    const angle = Number(c.angle ?? 0);
    if (!Number.isFinite(size) || size <= 0 || size >= 1) {
      return { ok: false, error: `第 ${i + 1} 条切口的 size 必须在 (0,1) 之间` };
    }
    if (!Number.isFinite(angle)) return { ok: false, error: `第 ${i + 1} 条切口的 angle 不是数字` };
    cuts.push({
      corner: c.corner,
      size: clamp(size, 0.1, 0.9),
      angle: clamp(angle, -40, 40),
      flip: c.flip === true,
    });
  }

  return {
    ok: true,
    design: {
      title: o.title.trim().slice(0, 24),
      description: String(o.description).slice(0, 160),
      fold: fold as FoldChoice,
      palette: { paper: palette.paper, background: palette.background },
      cuts,
      note: String(o.note).slice(0, 200),
    },
  };
}

/** Turn a validated design into parameters the studio can edit. */
export function designToCuts(design: AiDesign): StraightCut[] {
  return design.cuts.map((c) => {
    const s = c.size;
    const base: StraightCut =
      c.corner === 'inner'
        ? // Chamfer the folded corner at the origin; the removed sliver becomes a hole.
          { a: { x: 0, y: s }, b: { x: s, y: 0 }, keepSide: 1 }
        : // Chamfer the far corner; keeps the half-plane that contains the origin.
          { a: { x: 1 - s, y: 1 }, b: { x: 1, y: 1 - s }, keepSide: -1 };
    const rotated = c.angle === 0 ? base : rotateCut(base, (c.angle * Math.PI) / 180);
    return c.flip ? { ...rotated, keepSide: rotated.keepSide === 1 ? -1 : 1 } : rotated;
  });
}

/* ------------------------------------------------------------------ */
/* Local presets: used when no runtime model is configured, and as a   */
/* fallback when a request fails. These are heuristics, not AI.        */
/* ------------------------------------------------------------------ */

export interface LocalPreset extends AiDesign {
  keywords: string[];
}

export const LOCAL_PRESETS: LocalPreset[] = [
  {
    keywords: ['中秋', '月亮', '月', '花', '团圆', '秋'],
    title: '月满中庭',
    description: '以中心月洞为骨，四角留出花瓣般的缺口。',
    fold: 'fold-xy',
    palette: { paper: '#B93645', background: '#F8F3E9' },
    cuts: [
      { corner: 'inner', size: 0.46, angle: 0, flip: false },
      { corner: 'outer', size: 0.3, angle: 12, flip: false },
    ],
    note: '月亮被抽象为一个居中的多边孔洞，花瓣对应四角的斜切——这是几何近似，不是写实图形。',
  },
  {
    keywords: ['雪', '冬', '冰', '蓝', '白', '圣诞'],
    title: '初雪',
    description: '冰蓝纸上留下细密的放射状镂空。',
    fold: 'fold-xy',
    palette: { paper: '#3D6B78', background: '#EDF1F2' },
    cuts: [
      { corner: 'inner', size: 0.26, angle: 0, flip: false },
      { corner: 'inner', size: 0.58, angle: 0, flip: false },
      { corner: 'outer', size: 0.26, angle: -10, flip: false },
    ],
    note: '雪花的六角结构无法用两次中线折叠精确复现，这里用四重对称的层叠镂空做几何近似。',
  },
  {
    keywords: ['春节', '新年', '红', '窗花', '喜庆', '福'],
    title: '朱门春晓',
    description: '中国红，八瓣感的对称窗花，中心留一枚方胜孔。',
    fold: 'fold-xy',
    palette: { paper: '#B93645', background: '#FFFBF2' },
    cuts: [
      { corner: 'inner', size: 0.4, angle: 0, flip: false },
      { corner: 'outer', size: 0.42, angle: 18, flip: false },
    ],
    note: '「八瓣」由四重镜像折叠产生，不是八次旋转对称；这是折纸能做到的对称，而不是数字绘制的对称。',
  },
  {
    keywords: ['几何', '现代', '抽象', '万花筒', '青', '绿'],
    title: '方寸',
    description: '三条平行切口，展开成层层内缩的方框。',
    fold: 'fold-xy',
    palette: { paper: '#378C86', background: '#F6F1E6' },
    cuts: [
      { corner: 'inner', size: 0.2, angle: 0, flip: false },
      { corner: 'inner', size: 0.5, angle: 0, flip: false },
      { corner: 'inner', size: 0.78, angle: 0, flip: false },
    ],
    note: '对称的方框来自同一族平行切线，展开后自然形成同心结构。',
  },
  {
    keywords: ['简单', '儿童', '课堂', '小学', '入门'],
    title: '第一张窗花',
    description: '一刀就够：折两次，剪掉中心一角。',
    fold: 'fold-xy',
    palette: { paper: '#D84A49', background: '#F8F3E9' },
    cuts: [{ corner: 'inner', size: 0.5, angle: 0, flip: false }],
    note: '只用一条切口，方便课堂上第一次上手。',
  },
];

/** Pick the local preset whose keywords best match the prompt. */
export function matchLocalPreset(prompt: string): LocalPreset {
  let best = LOCAL_PRESETS[0];
  let bestScore = 0;
  for (const preset of LOCAL_PRESETS) {
    const score = preset.keywords.reduce((s, k) => (prompt.includes(k) ? s + 1 : s), 0);
    if (score > bestScore) {
      bestScore = score;
      best = preset;
    }
  }
  return best;
}
