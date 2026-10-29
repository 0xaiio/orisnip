import { navigate } from '@/app/router';
import { LEVELS, foldLabel, levelCount } from '@/game/levels';
import { completedCount, useProgress } from '@/game/progress';
import { regionToPath } from '@/components/paper/path';
import type { MultiPolygon } from '@/geometry/types';

function TargetThumb({ region, size = 92 }: { region: MultiPolygon; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-1.08 -1.08 2.16 2.16" aria-hidden="true" className="shrink-0">
      <rect x="-1" y="-1" width="2" height="2" fill="none" stroke="var(--line)" strokeWidth="0.01" />
      <path d={regionToPath(region)} fillRule="evenodd" fill="var(--red)" opacity="0.9" />
    </svg>
  );
}

export function Challenge() {
  const [progress] = useProgress();
  const done = completedCount(progress);

  return (
    <div className="shell py-10 sm:py-14">
      <header className="max-w-[58ch]">
        <p className="eyebrow">One-Cut Challenge</p>
        <h1 className="display-1 mt-3">一刀挑战</h1>
        <p className="lede mt-4">
          每一关都给出一个目标图案。选择允许的折叠方式，移动那条唯一的直线，然后展开。
          所有目标都是由合法解正向生成的——它们一定剪得出来。
        </p>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 border-y border-[var(--line)] py-4">
        <div className="flex items-baseline gap-2">
          <span className="num text-[1.5rem] leading-none text-[var(--red)]">{done}</span>
          <span className="text-[0.75rem] text-[var(--ink-mute)]">/ {levelCount} 已通关</span>
        </div>
        <div className="h-1 flex-1 min-w-[120px] overflow-hidden rounded-full bg-[var(--paper-3)]">
          <div
            className="h-full rounded-full bg-[var(--red)] transition-all duration-700"
            style={{ width: `${(done / levelCount) * 100}%` }}
          />
        </div>
        <span className="text-[0.72rem] text-[var(--ink-mute)]">进度保存在本机浏览器，无需登录</span>
      </div>

      <ul className="mt-8 grid list-none gap-4 p-0 sm:grid-cols-2">
        {LEVELS.map((level) => {
          const record = progress.levels[level.id];
          const passed = (record?.completedAt ?? 0) > 0;
          return (
            <li key={level.id}>
              <a
                href={`#/challenge/${level.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate({ name: 'play', levelId: level.id });
                }}
                className="group flex items-start gap-5 rounded-[4px] border border-[var(--line)] bg-[var(--white)] p-5 no-underline shadow-[var(--shadow-paper)] transition-all duration-500 hover:-translate-y-0.5 hover:border-[var(--gold)] hover:shadow-[var(--shadow-lift)]"
              >
                <div className="relative">
                  <TargetThumb region={level.target} />
                  {passed && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--red)] text-[0.7rem] text-[var(--paper)]">
                      ✓
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2.5">
                    <span className="num text-[0.68rem] text-[var(--ink-mute)]">
                      {String(level.index).padStart(2, '0')}
                    </span>
                    <h2 className="display-2 text-[1.18rem] transition-colors group-hover:text-[var(--red)]">
                      {level.name}
                    </h2>
                  </div>
                  <p className="mt-0.5 text-[0.74rem] tracking-[0.03em] text-[var(--gold)]">{level.subtitle}</p>
                  <p className="mt-2 line-clamp-2 text-[0.78rem] leading-relaxed text-[var(--ink-soft)]">
                    {level.brief}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-[var(--ink-mute)]">
                    <span>{foldLabel(level)}</span>
                    <span aria-hidden="true" className="text-[var(--line)]">/</span>
                    <span className="flex items-center gap-0.5" aria-label={`难度 ${level.difficulty} 星`}>
                      {[1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={`inline-block h-1 w-3 rounded-full ${
                            i <= level.difficulty ? 'bg-[var(--red)]' : 'bg-[var(--paper-3)]'
                          }`}
                        />
                      ))}
                    </span>
                    {record && record.bestIoU > 0 && (
                      <>
                        <span aria-hidden="true" className="text-[var(--line)]">/</span>
                        <span className="num">最佳 {Math.round(record.bestIoU * 100)}%</span>
                      </>
                    )}
                  </div>
                </div>
              </a>
            </li>
          );
        })}
      </ul>

      <p className="mt-10 max-w-[60ch] text-[0.78rem] leading-relaxed text-[var(--ink-mute)]">
        说明：本模式严格限制为「完全折叠后的一条连续直线切割」。它实现的是 Fold-and-Cut 的一个受限但精确的子集，
        不是任意多边形一刀剪切问题的通用求解器。
      </p>
    </div>
  );
}

export function useLevelList() {
  return LEVELS;
}
