import type { StraightCut } from '@/geometry/types';

/**
 * Original studio templates.
 *
 * Each template is a set of *parameters* — a fold plan, a handful of straight
 * cuts and two colours. Nothing is a stored picture, so every template stays
 * fully editable and reproducible on real paper: fold along the given creases,
 * make the given straight cuts, unfold.
 */

export interface Template {
  id: string;
  name: string;
  en: string;
  note: string;
  presetId: string;
  paperColor: string;
  bgColor: string;
  cuts: StraightCut[];
}

export const TEMPLATES: Template[] = [
  {
    id: 'window-flower',
    name: '中国窗花',
    en: 'Window Flower',
    note: '四重对称，中心菱形镂空 + 四角斜切',
    presetId: 'fold-xy',
    paperColor: '#B93645',
    bgColor: '#F8F3E9',
    cuts: [
      { a: { x: 0, y: 0.42 }, b: { x: 0.42, y: 0 }, keepSide: 1 },
      { a: { x: 0.52, y: 1 }, b: { x: 1, y: 0.52 }, keepSide: -1 },
    ],
  },
  {
    id: 'snowflake',
    name: '冬日雪花',
    en: 'Winter Flake',
    note: '细密切口，冰蓝纸上留出六角般的放射骨架',
    presetId: 'fold-xy',
    paperColor: '#3D6B78',
    bgColor: '#EDF1F2',
    cuts: [
      { a: { x: 0, y: 0.28 }, b: { x: 0.28, y: 0 }, keepSide: 1 },
      { a: { x: 0.46, y: 0.62 }, b: { x: 0.62, y: 0.46 }, keepSide: 1 },
      { a: { x: 0.72, y: 1 }, b: { x: 1, y: 0.72 }, keepSide: -1 },
    ],
  },
  {
    id: 'kaleidoscope',
    name: '几何万花筒',
    en: 'Kaleidoscope',
    note: '三条平行切口，展开后形成层层内缩的方框',
    presetId: 'fold-xy',
    paperColor: '#378C86',
    bgColor: '#F6F1E6',
    cuts: [
      { a: { x: 0, y: 0.2 }, b: { x: 0.2, y: 0 }, keepSide: 1 },
      { a: { x: 0, y: 0.5 }, b: { x: 0.5, y: 0 }, keepSide: 1 },
      { a: { x: 0, y: 0.78 }, b: { x: 0.78, y: 0 }, keepSide: 1 },
    ],
  },
  {
    id: 'festive',
    name: '节日祝福',
    en: 'Festive',
    note: '两次折叠，一条斜切，适合做卡片与礼物装饰',
    presetId: 'fold-x',
    paperColor: '#D84A49',
    bgColor: '#FFFBF2',
    cuts: [{ a: { x: 0.35, y: 1 }, b: { x: 1, y: 0.45 }, keepSide: -1 }],
  },
];

export const getTemplate = (id: string): Template | undefined => TEMPLATES.find((t) => t.id === id);

/** Palettes offered in the colour row. */
export const PAPER_COLORS = ['#B93645', '#D84A49', '#242725', '#378C86', '#C9A46A', '#3D6B78', '#8E2531', '#5B4A6B'];
export const BG_COLORS = ['#F8F3E9', '#FFFBF2', '#EDF1F2', '#242725', '#1B2430', '#F1E9DA'];
