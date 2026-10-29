import type { MultiPolygon, Paper, StraightCut } from '@/geometry/types';
import { applyCut } from '@/geometry/cuts';
import { buildPacket } from '@/geometry/folds';
import { getFoldPreset } from '@/geometry/paper';
import { unfold } from '@/geometry/unfold';
import { regionArea } from '@/geometry/polygons';

/**
 * Puzzle levels.
 *
 * Every target is *generated* from a legal cut through the level's own folded
 * packet: `target = unfold(applyCut(packet, solution))`. That guarantees, by
 * construction, that each level has at least one winning answer, and that the
 * game can never show a target no one can make.
 *
 * Coordinates are in packet space, where the folded packet sits in [0,1]^2 for
 * the twice-folded presets.
 */

export interface PuzzleLevel {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  brief: string;
  /** 1 = gentle, 2 = deliberate, 3 = a real puzzle. */
  difficulty: 1 | 2 | 3;
  /** Id of the fold plan the player must use. */
  presetId: string;
  /** At least one legal answer. */
  solution: StraightCut;
  /** Where the cut handle starts, so the player has something to grab. */
  start: StraightCut;
  hints: string[];
  /** The mathematical takeaway shown after the level. */
  knowledge: { title: string; body: string };
  /** IoU threshold for a pass. */
  tolerance: number;
}

export interface ResolvedLevel extends PuzzleLevel {
  packet: Paper;
  target: MultiPolygon;
  targetArea: number;
  targetHoles: number;
}

const levelData: PuzzleLevel[] = [
  {
    id: 'l1',
    index: 1,
    name: '剪掉一个角',
    subtitle: '直线与凸多边形',
    brief: '一张没有折叠的方纸。用一条直线剪掉右上角，让纸变成一个缺了角的方形。',
    difficulty: 1,
    presetId: 'none',
    solution: { a: { x: 1, y: 0.35 }, b: { x: 0.35, y: 1 }, keepSide: 1 },
    start: { a: { x: 1, y: 0.85 }, b: { x: 0.85, y: 1 }, keepSide: 1 },
    hints: [
      '整条虚线可以拖动，两个端点可以分别拖动来改变角度。',
      '把剪切线移动到能让右上角整块离开的位置。',
      '参考：切线大约从右边 x = 1 处 y ≈ 0.35 的位置，连到上边 y = 1 处 x ≈ 0.35。',
    ],
    knowledge: {
      title: '一刀就是一个半平面',
      body: '对凸多边形来说，一条直线切下去只会产生两块：直线的一侧与另一侧。没有折叠时，一刀最多只能让边数 +1，这就是为什么简单的一刀剪不出复杂窗花。',
    },
    // A corner chamfer is a small fraction of the sheet, so IoU moves slowly:
    // the tolerance has to be tighter than on levels that remove a big region.
    tolerance: 0.96,
  },
  {
    id: 'l2',
    index: 2,
    name: '镜像魔法',
    subtitle: '第一次折叠',
    brief: '把纸左右对折，再剪掉折叠纸包的一个角。展开后，你会同时得到两个缺口。',
    difficulty: 1,
    presetId: 'fold-x',
    solution: { a: { x: 0.55, y: 1 }, b: { x: 1, y: 0.55 }, keepSide: -1 },
    start: { a: { x: 0.55, y: 1 }, b: { x: 1, y: 0.55 }, keepSide: 1 },
    hints: [
      '注意：选择保留哪一侧，结果会完全不同。',
      '切口要切掉折包上靠近 (1, 1) 的那个角。',
      '如果结果只剩一小块纸，说明保留侧反了，点「换一侧」试试。',
    ],
    knowledge: {
      title: '一次折叠 = 一次反射',
      body: '左右对折把左半边通过 x ↦ −x 映到右半边，于是右半边的每一个切口在展开时都被复制到左侧镜像位置。层数翻倍，图案就翻倍。',
    },
    tolerance: 0.94,
  },
  {
    id: 'l3',
    index: 3,
    name: '一刀成菱',
    subtitle: 'Fold-and-Cut 的经典例子',
    brief: '先左右对折，再上下对折。在折包的角落斜剪一刀，展开后，纸的中心会出现一个菱形孔洞。',
    difficulty: 2,
    presetId: 'fold-xy',
    solution: { a: { x: 0, y: 0.55 }, b: { x: 0.55, y: 0 }, keepSide: 1 },
    start: { a: { x: 0, y: 0.95 }, b: { x: 0.95, y: 0 }, keepSide: 1 },
    hints: [
      '折了两次，四层纸叠在一起，一刀等于四刀。',
      '把这条斜线放到折包左上角附近，切掉靠近原点的三角形。',
      '菱形越大，说明切线离原点越远。',
    ],
    knowledge: {
      title: '为什么是菱形',
      body: '两次对折后，折包坐标 (u, v) = (|x|, |y|)。切线 u + v = d 在折包里切掉一个三角形；展开时 |x| + |y| = d 描述的正是菱形，所以中心的孔洞是菱形而不是方形。',
    },
    tolerance: 0.93,
  },
  {
    id: 'l4',
    index: 4,
    name: '偏移的秘密',
    subtitle: '角度改变一切',
    brief: '同样的两次对折，换一条不与对角线平行的切线。四层纸展开后，四条边会出现方向一致的斜缺口。',
    difficulty: 2,
    presetId: 'fold-xy',
    solution: { a: { x: 0, y: 0.2 }, b: { x: 1, y: 0.8 }, keepSide: -1 },
    start: { a: { x: 0.5, y: 0.5 }, b: { x: 1, y: 0.5 }, keepSide: -1 },
    hints: [
      '这次切线不经过原点附近的角落，而是斜穿整个纸包。',
      '让切线从左边界 y ≈ 0.2 出发，到右边界 y ≈ 0.8。',
      '观察四层纸的层序：同样的一刀，在四条边上留下了旋转对称的缺口。',
    ],
    knowledge: {
      title: 'D2 对称群',
      body: '两次中线折叠让图案具有 x → −x 与 y → −y 两组镜像对称。四条边上的缺口看起来是「旋转」的，其实是四次镜像复制的结果。',
    },
    tolerance: 0.93,
  },
  {
    id: 'l5',
    index: 5,
    name: '一刀瘦身',
    subtitle: '切掉一整条',
    brief: '上下、左右都折过之后，竖直剪一刀，纸会剩下什么？目标很极端——一张又高又窄的长条。',
    difficulty: 2,
    presetId: 'fold-xy',
    solution: { a: { x: 0.38, y: -1 }, b: { x: 0.38, y: 1 }, keepSide: 1 },
    start: { a: { x: 0.8, y: -1 }, b: { x: 0.8, y: 1 }, keepSide: 1 },
    hints: [
      '这一刀切掉的不是角落，而是整条边。',
      '把竖直的剪切线移动到 u ≈ 0.38 的位置。',
      '剩下的是宽度 0.76、高度 2 的长条。',
    ],
    knowledge: {
      title: '面积是可以算出来的',
      body: '折包宽 1、高 2，切掉 u > 0.38 的部分后，每一层剩下 0.38 × 2；四层展开后总面积为 4 × 0.76 = 3.04？并非如此——展开后是 0.76 × 2 = 1.52。层数不会增加面积，只会复制切口。',
    },
    tolerance: 0.93,
  },
  {
    id: 'l6',
    index: 6,
    name: '只剩一颗菱形',
    subtitle: '保留内侧',
    brief: '这一次反过来：不剪掉角落，而是把角落之外的全部丢掉。展开后，整张纸会缩成一颗菱形。',
    difficulty: 3,
    presetId: 'fold-xy',
    solution: { a: { x: 0, y: 0.85 }, b: { x: 0.85, y: 0 }, keepSide: -1 },
    start: { a: { x: 0, y: 0.85 }, b: { x: 0.85, y: 0 }, keepSide: 1 },
    hints: [
      '「换一侧」按钮在这里是关键：你要保留的是靠近折角的小三角形。',
      '如果展开后是一个带菱形孔的方纸，说明保留侧选反了。',
      '菱形的大小由切线到原点的距离决定。',
    ],
    knowledge: {
      title: '同一刀，两种结果',
      body: '一条直线把平面分成两个半平面，剪完之后两块纸都存在。保留哪一块是创作决定，不是几何决定——这正是剪纸艺术里「留白」的数学含义。',
    },
    tolerance: 0.93,
  },
  {
    id: 'l7',
    index: 7,
    name: '对角留白',
    subtitle: '斜折线',
    brief: '这一次沿对角线折成三角形。平行于折痕剪一刀，展开后会留下一条贯穿纸面的斜带。',
    difficulty: 3,
    presetId: 'fold-diag',
    solution: { a: { x: 1, y: -0.2 }, b: { x: -0.2, y: 1 }, keepSide: 1 },
    start: { a: { x: 0.5, y: 0.4 }, b: { x: 0.4, y: 0.5 }, keepSide: 1 },
    hints: [
      '对角折之后，纸包是一个等腰直角三角形，折痕就是斜边。',
      '切线要平行于折痕，这样展开后两条边界才会互相平行。',
      '把切线放在折痕外侧、距离折痕约 0.57 的位置。',
    ],
    knowledge: {
      title: '对称轴不一定是水平的',
      body: '沿对角线折叠时，反射轴是 x + y = 0。展开后得到的是关于这条斜线的镜像：一条平行于折痕的切线，展开后变成一对平行的边界，于是留下一条斜带。',
    },
    tolerance: 0.93,
  },
  {
    id: 'l8',
    index: 8,
    name: '最终挑战',
    subtitle: '没有提示的题',
    brief: '目标图案由某个合法的折叠与剪切方案正向生成。我们不会告诉你答案，只看你能不能把它找回来。',
    difficulty: 3,
    presetId: 'fold-yx',
    solution: { a: { x: 0, y: 1 }, b: { x: 1, y: 0.35 }, keepSide: -1 },
    start: { a: { x: 0.5, y: -1 }, b: { x: 0.5, y: 1 }, keepSide: -1 },
    hints: [
      '先看目标图案缺了什么，再想这一刀应该切在哪里。',
      '这是一条斜线，不是水平线也不是竖直线。',
      '试试点「查看提示」里的面积差，它告诉你剪多了还是剪少了。',
    ],
    knowledge: {
      title: '层序与几何无关',
      body: '「先上下后左右」和「先左右后上下」得到同一个纸包，只是四层纸的叠放顺序不同。对一刀剪来说，层序只影响手感，不影响展开结果——几何只关心每一层被映到哪里。',
    },
    tolerance: 0.94,
  },
];

const cache = new Map<string, ResolvedLevel>();

export function resolveLevel(level: PuzzleLevel): ResolvedLevel {
  const cached = cache.get(level.id);
  if (cached) return cached;
  const packet = buildPacket(level.presetId);
  const cut = applyCut(packet, level.solution);
  const result = unfold(cut.paper);
  const resolved: ResolvedLevel = {
    ...level,
    packet,
    target: result.region,
    targetArea: regionArea(result.region),
    targetHoles: result.holeCount,
  };
  cache.set(level.id, resolved);
  return resolved;
}

export const LEVELS: ResolvedLevel[] = levelData.map(resolveLevel);

export const getLevel = (id: string): ResolvedLevel | undefined =>
  LEVELS.find((level) => level.id === id);

export const nextLevel = (id: string): ResolvedLevel | undefined => {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] : undefined;
};

export const levelCount = LEVELS.length;

/** Human readable fold plan for a level, e.g. "左右对折 → 上下对折". */
export const foldLabel = (level: PuzzleLevel): string => {
  const preset = getFoldPreset(level.presetId);
  return preset.folds.length === 0 ? '不折叠' : preset.folds.map((f) => f.label).join(' → ');
};
