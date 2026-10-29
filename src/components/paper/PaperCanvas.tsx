import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { MultiPolygon, Paper, StraightCut, Vec2 } from '@/geometry/types';
import { lineThrough } from '@/geometry/transforms';
import { packetRingOf } from '@/geometry/paper';
import { asRegion, clipHalfPlane, unionRegions } from '@/geometry/polygons';
import { lineRectIntersections, regionToPath, ringToPath } from './path';

/**
 * The interactive paper stage.
 *
 * Two rendering modes share one coordinate frame:
 * - `packet` shows the folded stack with layered faces and the scissors line;
 * - `flat` shows the unfolded artwork with real holes.
 *
 * The component is deliberately dumb about *state*: it renders whatever
 * geometry it is given and reports pointer deltas upward. That is what keeps
 * the geometry engine testable without a DOM.
 */

export interface PaperCanvasProps {
  paper: Paper;
  mode: 'packet' | 'flat';
  /** Required in `flat` mode: the unfolded region. */
  region?: MultiPolygon;
  cut?: StraightCut | null;
  onCutChange?: (cut: StraightCut) => void;
  /** Shade the area the current cut would remove. */
  showCutPreview?: boolean;
  /** 0..1: a knife travelling along the cut. When set, the preview is hidden. */
  knifeProgress?: number | null;
  showCreases?: boolean;
  interactive?: boolean;
  /** Optional ghost outline drawn behind the artwork, e.g. a level target. */
  ghost?: MultiPolygon | null;
  fill?: string;
  background?: string;
  padding?: number;
  label?: string;
  className?: string;
  /** Called when a keyboard nudge happens, for screen-reader announcements. */
  onNudge?: (message: string) => void;
}

type DragMode = 'a' | 'b' | 'move' | null;

export function PaperCanvas({
  paper,
  mode,
  region,
  cut,
  onCutChange,
  showCutPreview = true,
  knifeProgress = null,
  showCreases = true,
  interactive = false,
  ghost = null,
  fill = '#B93645',
  background = 'transparent',
  padding = 0.14,
  label = '纸张视图',
  className = '',
  onNudge,
}: PaperCanvasProps) {
  const uid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragMode>(null);
  const dragRef = useRef<{ mode: DragMode; start: Vec2; origin: StraightCut } | null>(null);

  /* ---------------- frame ---------------- */

  const frame = useMemo(() => {
    // Packet mode frames the folded stack (it is what you actually cut);
    // flat mode frames the whole sheet so the artwork never rescales mid-edit.
    const points: Vec2[] = mode === 'packet' ? paper.faces.flatMap((f) => packetRingOf(f)) : paper.sheet;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    if (!Number.isFinite(minX)) {
      minX = -1;
      minY = -1;
      maxX = 1;
      maxY = 1;
    }
    const w = maxX - minX || 2;
    const h = maxY - minY || 2;
    const side = Math.max(w, h) * (1 + padding * 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return {
      minX: cx - side / 2,
      minY: cy - side / 2,
      maxX: cx + side / 2,
      maxY: cy + side / 2,
      width: side,
      height: side,
    };
  }, [paper.sheet, paper.faces, mode, padding]);

  const viewBox = `${frame.minX} ${frame.minY} ${frame.width} ${frame.height}`;
  const unit = Math.max(frame.width, frame.height);

  /* ---------------- cut geometry ---------------- */

  const line = useMemo(() => (cut ? lineThrough(cut.a, cut.b) : null), [cut]);

  const handles = useMemo(() => {
    if (!line) return null;
    return lineRectIntersections(line, {
      minX: frame.minX + unit * 0.012,
      minY: frame.minY + unit * 0.012,
      maxX: frame.maxX - unit * 0.012,
      maxY: frame.maxY - unit * 0.012,
    });
  }, [line, frame, unit]);

  const cutPreview = useMemo(() => {
    if (!line || !cut || !showCutPreview || knifeProgress !== null) return [];
    const pieces = paper.faces
      .map((f) => clipHalfPlane(packetRingOf(f), line, (-cut.keepSide) as 1 | -1))
      .filter((r) => r.length >= 3);
    if (pieces.length === 0) return [];
    return unionRegions(pieces.map(asRegion));
  }, [paper.faces, line, cut, showCutPreview, knifeProgress]);

  const silhouette = useMemo(() => {
    if (mode !== 'packet') return [];
    return unionRegions(paper.faces.map((f) => asRegion(packetRingOf(f))));
  }, [paper.faces, mode]);

  /* ---------------- pointer handling ---------------- */

  const toLocal = useCallback((e: React.PointerEvent): Vec2 | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }, []);

  const beginDrag = (mode: DragMode) => (e: React.PointerEvent) => {
    if (!interactive || !cut || !onCutChange) return;
    const p = toLocal(e);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { mode, start: p, origin: cut };
    setDrag(mode);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !cut || !onCutChange) return;
    const p = toLocal(e);
    if (!p) return;
    e.preventDefault();

    if (d.mode === 'move') {
      onCutChange({
        a: { x: d.origin.a.x + (p.x - d.start.x), y: d.origin.a.y + (p.y - d.start.y) },
        b: { x: d.origin.b.x + (p.x - d.start.x), y: d.origin.b.y + (p.y - d.start.y) },
        keepSide: d.origin.keepSide,
      });
      return;
    }
    if (!handles) return;
    const [ha, hb] = handles;
    if (d.mode === 'a') onCutChange({ a: p, b: hb, keepSide: cut.keepSide });
    if (d.mode === 'b') onCutChange({ a: ha, b: p, keepSide: cut.keepSide });
  };

  const endDrag = () => {
    dragRef.current = null;
    setDrag(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!interactive || !cut || !onCutChange) return;
    const step = unit * 0.012;
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    onCutChange({
      a: { x: cut.a.x + dx, y: cut.a.y + dy },
      b: { x: cut.b.x + dx, y: cut.b.y + dy },
      keepSide: cut.keepSide,
    });
    onNudge?.(`剪切线移动 ${dx !== 0 ? (dx > 0 ? '向右' : '向左') : dy > 0 ? '向下' : '向上'}`);
  };

  const handleR = unit * 0.023;
  const strokeW = unit * 0.004;

  /* ---------------- render ---------------- */

  const faces = mode === 'packet' ? paper.faces : [];

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      className={`paper-scene ${className}`}
      role="img"
      aria-label={label}
      style={{ background }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={(e) => {
        if (e.buttons === 0) endDrag();
      }}
    >
      <defs>
        <filter id={`shadow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy={unit * 0.012} stdDeviation={unit * 0.018} floodColor="#242725" floodOpacity="0.22" />
        </filter>
        <filter id={`soft-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy={unit * 0.004} stdDeviation={unit * 0.008} floodColor="#242725" floodOpacity="0.14" />
        </filter>
        <pattern
          id={`hatch-${uid}`}
          width={unit * 0.045}
          height={unit * 0.045}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2={unit * 0.045} stroke="#B93645" strokeWidth={unit * 0.0055} opacity="0.5" />
        </pattern>
        <linearGradient id={`paper-${uid}`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {/* Ghost / target outline */}
      {ghost && ghost.length > 0 && (
        <path
          d={regionToPath(ghost)}
          fillRule="evenodd"
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.28}
          strokeWidth={strokeW * 1.6}
          strokeDasharray={`${unit * 0.014} ${unit * 0.016}`}
        />
      )}

      {mode === 'packet' ? (
        <>
          {silhouette.length > 0 && (
            <path d={regionToPath(silhouette)} fillRule="evenodd" fill={fill} filter={`url(#shadow-${uid})`} opacity={0.96} />
          )}
          {faces.map((face, i) => {
            const depth = faces.length <= 1 ? 0 : i / (faces.length - 1);
            return (
              <path
                key={face.id}
                d={ringToPath(packetRingOf(face))}
                className="paper-face"
                fill={fill}
                fillOpacity={0.86 + depth * 0.14}
                stroke="#242725"
                strokeOpacity={0.12 + depth * 0.1}
                strokeWidth={strokeW}
                strokeLinejoin="round"
              />
            );
          })}
          <path d={regionToPath(silhouette)} fillRule="evenodd" fill={`url(#paper-${uid})`} pointerEvents="none" />
          {showCreases &&
            paper.folds.map((fold, i) => {
              const seg = lineRectIntersections(fold.line, {
                minX: frame.minX,
                minY: frame.minY,
                maxX: frame.maxX,
                maxY: frame.maxY,
              });
              if (!seg) return null;
              return (
                <line
                  key={`crease-${i}`}
                  x1={seg[0].x}
                  y1={seg[0].y}
                  x2={seg[1].x}
                  y2={seg[1].y}
                  stroke="#242725"
                  strokeOpacity={0.16}
                  strokeWidth={strokeW * 0.8}
                  strokeDasharray={`${unit * 0.008} ${unit * 0.012}`}
                  pointerEvents="none"
                />
              );
            })}
          {cutPreview.length > 0 && (
            <path
              d={regionToPath(cutPreview)}
              fillRule="evenodd"
              fill={`url(#hatch-${uid})`}
              stroke="#B93645"
              strokeOpacity={0.35}
              strokeWidth={strokeW}
              pointerEvents="none"
            />
          )}
        </>
      ) : (
        <>
          {region && region.length > 0 && (
            <path
              d={regionToPath(region)}
              fillRule="evenodd"
              fill={fill}
              filter={`url(#shadow-${uid})`}
            />
          )}
          {region && region.length > 0 && (
            <path d={regionToPath(region)} fillRule="evenodd" fill={`url(#paper-${uid})`} pointerEvents="none" />
          )}
        </>
      )}

      {/* Cut line + handles, or the knife sweep during the cut animation */}
      {cut && line && handles && knifeProgress !== null && (
        <g pointerEvents="none">
          <line
            x1={cut.a.x}
            y1={cut.a.y}
            x2={cut.b.x}
            y2={cut.b.y}
            stroke="#F8F3E9"
            strokeOpacity={0.85}
            strokeWidth={strokeW * 3.2}
            strokeLinecap="round"
          />
          <line
            x1={cut.a.x}
            y1={cut.a.y}
            x2={cut.a.x + (cut.b.x - cut.a.x) * knifeProgress}
            y2={cut.a.y + (cut.b.y - cut.a.y) * knifeProgress}
            stroke="#242725"
            strokeWidth={strokeW * 1.8}
            strokeLinecap="round"
          />
          <circle
            cx={cut.a.x + (cut.b.x - cut.a.x) * knifeProgress}
            cy={cut.a.y + (cut.b.y - cut.a.y) * knifeProgress}
            r={handleR * 0.85}
            fill="#242725"
          />
        </g>
      )}

      {cut && line && handles && knifeProgress === null && (
        <g
          className="cut-overlay"
          tabIndex={interactive ? 0 : -1}
          role={interactive ? 'slider' : undefined}
          aria-label={
            interactive ? '剪切线，方向键移动整体，拖动端点改变角度，拖动线段移动位置' : undefined
          }
          aria-valuetext={interactive ? '剪切线位于折叠纸包上' : undefined}
          onKeyDown={onKeyDown}
          style={{ cursor: drag === 'move' ? 'grabbing' : 'grab', outline: 'none' }}
        >
          <line
            x1={handles[0].x}
            y1={handles[0].y}
            x2={handles[1].x}
            y2={handles[1].y}
            className="cut-line-halo"
            strokeWidth={strokeW * 4}
            pointerEvents="none"
          />
          <line
            x1={handles[0].x}
            y1={handles[0].y}
            x2={handles[1].x}
            y2={handles[1].y}
            className="cut-line"
            strokeWidth={strokeW * 1.8}
            onPointerDown={beginDrag('move')}
            style={{ cursor: drag === 'move' ? 'grabbing' : 'grab' }}
          />
          {interactive &&
            ([0, 1] as const).map((idx) => (
              <circle
                key={idx}
                cx={handles[idx].x}
                cy={handles[idx].y}
                r={handleR}
                className="grab-handle"
                strokeWidth={strokeW * 1.6}
                onPointerDown={beginDrag(idx === 0 ? 'a' : 'b')}
                aria-hidden="true"
              />
            ))}
        </g>
      )}
    </svg>
  );
}
