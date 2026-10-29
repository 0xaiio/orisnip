import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { MultiPolygon, Paper } from '@/geometry/types';
import { unfoldFrame, lerp, smooth, type AnimFace } from './animation';
import { regionToPath, ringToPath } from './path';
import { unfold } from '@/geometry/unfold';

/**
 * Plays the real unfolding sequence: one crease at a time, each frame produced
 * by partially undoing that crease's reflection. When playback finishes the
 * component switches to the exact union polygon, so the final image is the
 * artwork the exporter would write.
 */

export interface UnfoldPlayerProps {
  paper: Paper;
  /** Start playback when true. Re-trigger by changing `runId`. */
  runId: number;
  secondsPerFold?: number;
  fill?: string;
  onDone?: () => void;
  className?: string;
  label?: string;
  /** Draw the target silhouette behind the result. */
  ghost?: MultiPolygon | null;
  /** Called on every frame with the current progress 0..1. */
  onProgress?: (p: number) => void;
}

export function UnfoldPlayer({
  paper,
  runId,
  secondsPerFold = 0.62,
  fill = '#B93645',
  onDone,
  className = '',
  label = '展开后的图案',
  ghost = null,
  onProgress,
}: UnfoldPlayerProps) {
  const uid = useId().replace(/:/g, '');
  const folds = paper.folds.length;
  const total = Math.max(0.001, folds * secondsPerFold);
  const [elapsed, setElapsed] = useState(0);
  const doneRef = useRef(false);

  const finalRegion = useMemo(() => unfold(paper).region, [paper]);

  useEffect(() => {
    setElapsed(0);
    doneRef.current = false;
    if (folds === 0) {
      onProgress?.(1);
      onDone?.();
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(total, (now - start) / 1000);
      setElapsed(t);
      onProgress?.(Math.min(1, t / total));
      if (t < total) {
        raf = requestAnimationFrame(tick);
      } else if (!doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, total, folds]);

  const progress = folds === 0 ? 1 : Math.min(1, elapsed / total);

  const frame: AnimFace[] | null = useMemo(() => {
    if (folds === 0 || progress >= 1) return null;
    const scaled = progress * folds;
    const segment = Math.min(folds - 1, Math.floor(scaled));
    const local = smooth(scaled - segment);
    const foldIndex = folds - 1 - segment;
    const u = lerp(1, -1, local);
    return unfoldFrame(paper, foldIndex, u);
  }, [paper, folds, progress]);

  const showArtwork = frame === null;

  return (
    <svg
      viewBox="-1.16 -1.16 2.32 2.32"
      className={`paper-scene ${className}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <filter id={`${uid}-sh`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0.028" stdDeviation="0.04" floodColor="#242725" floodOpacity="0.24" />
        </filter>
        <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {ghost && ghost.length > 0 && (
        <path
          d={regionToPath(ghost)}
          fillRule="evenodd"
          fill="none"
          stroke="#242725"
          strokeOpacity="0.25"
          strokeWidth="0.012"
          strokeDasharray="0.035 0.03"
        />
      )}

      {showArtwork ? (
        <g>
          <path d={regionToPath(finalRegion)} fillRule="evenodd" fill={fill} filter={`url(#${uid}-sh)`} />
          <path d={regionToPath(finalRegion)} fillRule="evenodd" fill={`url(#${uid}-g)`} />
        </g>
      ) : (
        <g>
          {frame.map((f, i) => (
            <path
              key={f.key}
              d={ringToPath(f.ring)}
              fill={fill}
              fillOpacity={0.8 + (i / Math.max(1, frame.length - 1)) * 0.2}
              stroke="#8E2531"
              strokeOpacity="0.3"
              strokeWidth="0.006"
              strokeLinejoin="round"
              opacity={f.opacity}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
