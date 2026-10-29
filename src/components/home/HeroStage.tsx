import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ring, StraightCut } from '@/geometry/types';
import { applyCut } from '@/geometry/cuts';
import { applyFold } from '@/geometry/folds';
import { createPaper, createSquareSheet, getFoldPreset } from '@/geometry/paper';
import { foldFrame, lerp, packetFrame, smooth, unfoldFrame, type AnimFace } from '@/components/paper/animation';
import { regionToPath, ringToPath } from '@/components/paper/path';
import { unfold } from '@/geometry/unfold';

/**
 * The homepage signature: a real fold → cut → unfold cycle, computed once and
 * replayed. Nothing here is a decorative lottie; the last frame is literally
 * the output of the same functions the game and the studio call.
 */

const SHEET = createSquareSheet(1);
const PRESET = getFoldPreset('fold-xy');
const P0 = createPaper(SHEET);
const P1 = applyFold(P0, PRESET.folds[0]).paper;
const P2 = applyFold(P1, PRESET.folds[1]).paper;
const CUT: StraightCut = { a: { x: 0, y: 0.58 }, b: { x: 0.58, y: 0 }, keepSide: 1 };
const CUT_RESULT = applyCut(P2, CUT);
const P3 = CUT_RESULT.paper;
const FINAL = unfold(P3);

const T_FLAT = 1.7;
const T_F1 = 0.95;
const T_F2 = 0.95;
const T_CUT = 0.8;
const T_FALL = 0.6;
const T_UNF = 2.0;
const T_HOLD = 2.8;
const T_FADE = 0.5;
const TOTAL = T_FLAT + T_F1 + T_F2 + T_CUT + T_FALL + T_UNF + T_HOLD + T_FADE;

const VIEW = { minX: -1.2, minY: -1.2, w: 2.4, h: 2.4 };

interface Scrap {
  ring: Ring;
  progress: number;
}

function useClock(duration: number, enabled: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setT(((now - start) / 1000) % duration);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration, enabled]);
  return t;
}

export function HeroStage() {
  const reduced = usePrefersReducedMotion();
  const t = useClock(TOTAL, !reduced);
  const frame = useMemo(() => buildFrame(reduced ? TOTAL - T_FADE - 0.1 : t), [t, reduced]);

  const uid = useRef(`hero-${Math.random().toString(36).slice(2, 8)}`).current;

  return (
    <figure className="relative m-0">
      <div className="relative aspect-square w-full">
        <svg
          viewBox={`${VIEW.minX} ${VIEW.minY} ${VIEW.w} ${VIEW.h}`}
          className="h-full w-full"
          role="img"
          aria-label="演示：一张方纸经过两次对折，沿直线剪一刀，再展开，中心出现一个菱形孔洞"
        >
          <defs>
            <filter id={`${uid}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0.03" stdDeviation="0.045" floodColor="#242725" floodOpacity="0.26" />
            </filter>
            <filter id={`${uid}-soft`} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0.008" stdDeviation="0.014" floodColor="#242725" floodOpacity="0.18" />
            </filter>
            <linearGradient id={`${uid}-grad`} x1="0" y1="0" x2="0.55" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.26" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#5C0F1A" stopOpacity="0.16" />
            </linearGradient>
            <pattern id={`${uid}-hatch`} width="0.055" height="0.055" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="0.055" stroke="#8E2531" strokeWidth="0.006" opacity="0.55" />
            </pattern>
          </defs>

          {/* A quiet stage: two gold guide lines only. */}
          <g opacity="0.5">
            <line x1={-1.06} y1={-1.14} x2={1.06} y2={-1.14} stroke="#C9A46A" strokeWidth="0.004" />
            <line x1={-1.14} y1={-1.06} x2={-1.14} y2={1.06} stroke="#C9A46A" strokeWidth="0.004" />
          </g>

          {frame.mode === 'artwork' ? (
            <g className={reduced ? '' : 'anim-bloom'}>
              <path
                d={regionToPath(frame.artwork)}
                fillRule="evenodd"
                fill="#B93645"
                filter={`url(#${uid}-shadow)`}
              />
              <path
                d={regionToPath(frame.artwork)}
                fillRule="evenodd"
                fill="none"
                stroke="#8E2531"
                strokeOpacity="0.35"
                strokeWidth="0.005"
              />
            </g>
          ) : (
            <g>
              {frame.faces.map((f, i) => (
                <path
                  key={f.key}
                  d={ringToPath(f.ring)}
                  fill="#B93645"
                  fillOpacity={0.82 + (i / Math.max(1, frame.faces.length - 1)) * 0.18}
                  stroke="#8E2531"
                  strokeOpacity="0.28"
                  strokeWidth="0.005"
                  strokeLinejoin="round"
                  filter={i === frame.faces.length - 1 ? `url(#${uid}-soft)` : undefined}
                />
              ))}
              {frame.faces.map((f) => (
                <path key={`g-${f.key}`} d={ringToPath(f.ring)} fill={`url(#${uid}-grad)`} pointerEvents="none" />
              ))}
              {frame.guides.map((g) => (
                <line
                  key={g.axis}
                  x1={g.axis === 'x' ? 0 : -1.16}
                  y1={g.axis === 'x' ? -1.16 : 0}
                  x2={g.axis === 'x' ? 0 : 1.16}
                  y2={g.axis === 'x' ? 1.16 : 0}
                  stroke="#8E2531"
                  strokeOpacity={g.strong ? 0.3 : 0.14}
                  strokeWidth={g.strong ? 0.006 : 0.004}
                  strokeDasharray={g.strong ? '0.032 0.026' : '0.018 0.03'}
                />
              ))}
              {frame.hatch && frame.hatch.length > 0 && (
                <path d={regionToPath(frame.hatch)} fillRule="evenodd" fill={`url(#${uid}-hatch)`} />
              )}
              {frame.scraps.map((s) => (
                <path
                  key={s.ring.length + String(s.progress)}
                  d={ringToPath(s.ring)}
                  fill="#B93645"
                  fillOpacity={0.75 * (1 - s.progress)}
                  transform={`translate(${s.progress * 0.35} ${s.progress * 0.55}) rotate(${s.progress * 14} 0.4 0.4)`}
                />
              ))}
              {frame.knife && (
                <g>
                  <line
                    x1={frame.knife.a.x}
                    y1={frame.knife.a.y}
                    x2={frame.knife.b.x}
                    y2={frame.knife.b.y}
                    stroke="#F8F3E9"
                    strokeOpacity="0.9"
                    strokeWidth="0.034"
                    strokeLinecap="round"
                  />
                  <line
                    x1={frame.knife.a.x}
                    y1={frame.knife.a.y}
                    x2={frame.knife.b.x}
                    y2={frame.knife.b.y}
                    stroke="#242725"
                    strokeWidth="0.012"
                    strokeLinecap="round"
                    strokeDasharray="0.03 0.022"
                  />
                  <circle cx={frame.knife.b.x} cy={frame.knife.b.y} r="0.028" fill="#242725" />
                </g>
              )}
            </g>
          )}
        </svg>
      </div>

      <figcaption className="mt-4 flex items-baseline justify-between gap-4 text-[0.72rem] tracking-[0.16em] text-[var(--ink-mute)]">
        <span className="font-mono uppercase">Fold → Cut → Unfold</span>
        <span className="num">
          {frame.mode === 'artwork'
            ? `${FINAL.holeCount} 个孔洞 · 剩余面积 ${FINAL.area.toFixed(2)}`
            : frame.caption}
        </span>
      </figcaption>
    </figure>
  );
}

interface Frame {
  mode: 'packet' | 'artwork';
  faces: AnimFace[];
  artwork: ReturnType<typeof unfold>['region'];
  hatch: ReturnType<typeof unfold>['region'] | null;
  knife: { a: { x: number; y: number }; b: { x: number; y: number } } | null;
  scraps: Scrap[];
  caption: string;
  /** Crease guides to draw, with the active one emphasised. */
  guides: { axis: 'x' | 'y'; strong: boolean }[];
}

function buildFrame(t: number): Frame {
  const empty = {
    mode: 'packet' as const,
    faces: [],
    artwork: [],
    hatch: null,
    knife: null,
    scraps: [],
    guides: [],
  };
  let cursor = 0;

  // 1. Flat sheet
  if (t < (cursor += T_FLAT)) {
    return {
      ...empty,
      faces: packetFrame(P0),
      caption: '一张方纸',
      guides: [
        { axis: 'x', strong: false },
        { axis: 'y', strong: false },
      ],
    };
  }

  // 2. First fold
  if (t < (cursor += T_F1)) {
    const p = (t - (cursor - T_F1)) / T_F1;
    return {
      ...empty,
      faces: foldFrame(P1, 0, lerp(-1, 1, smooth(p))),
      caption: '左右对折',
      guides: [
        { axis: 'x', strong: true },
        { axis: 'y', strong: false },
      ],
    };
  }

  // 3. Second fold
  if (t < (cursor += T_F2)) {
    const p = (t - (cursor - T_F2)) / T_F2;
    return {
      ...empty,
      faces: foldFrame(P2, 1, lerp(-1, 1, smooth(p))),
      caption: '上下对折 · 四层',
      guides: [{ axis: 'y', strong: true }],
    };
  }

  // 4. Knife travels along the crease-free corner
  if (t < (cursor += T_CUT)) {
    const p = smooth((t - (cursor - T_CUT)) / T_CUT);
    const a = CUT.a;
    const b = { x: lerp(a.x, CUT.b.x, p), y: lerp(a.y, CUT.b.y, p) };
    const hatchRing = CUT_RESULT.removed.length > 0 ? CUT_RESULT.removed.map((f) => [f.sheetRegion]) : null;
    return {
      ...empty,
      faces: packetFrame(P2),
      hatch: p > 0.98 ? null : hatchRing,
      knife: { a, b },
      caption: '沿着直线剪一刀',
    };
  }

  // 5. Scraps fall away
  if (t < (cursor += T_FALL)) {
    const p = (t - (cursor - T_FALL)) / T_FALL;
    return {
      ...empty,
      faces: packetFrame(P3),
      scraps: CUT_RESULT.removed.map((f) => ({ ring: f.sheetRegion, progress: p })),
      caption: '剪下的碎片脱落',
    };
  }

  // 6. Unfold, one crease at a time
  if (t < (cursor += T_UNF)) {
    const p = (t - (cursor - T_UNF)) / T_UNF;
    if (p < 0.5) {
      const u = lerp(1, -1, smooth(p / 0.5));
      return { ...empty, faces: unfoldFrame(P3, 1, u), caption: '展开第一层' };
    }
    const u = lerp(1, -1, smooth((p - 0.5) / 0.5));
    return { ...empty, faces: unfoldFrame(P3, 0, u), caption: '展开第二层' };
  }

  // 7. Hold the artwork
  if (t < cursor + T_HOLD) {
    return { ...empty, mode: 'artwork', artwork: FINAL.region, caption: '菱形孔洞' };
  }

  return { ...empty, mode: 'artwork', artwork: FINAL.region, caption: '菱形孔洞' };
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReduced(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

export function useReducedMotion(): boolean {
  return usePrefersReducedMotion();
}
