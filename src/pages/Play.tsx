import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '@/app/router';
import { PaperCanvas } from '@/components/paper/PaperCanvas';
import { UnfoldPlayer } from '@/components/paper/UnfoldPlayer';
import type { StraightCut } from '@/geometry/types';
import {
  applyCut,
  cutAngleDeg,
  cutOffset,
  setCutAngleDeg,
  setCutOffset,
  validateCut,
} from '@/geometry/cuts';
import { packetBounds } from '@/geometry/paper';
import { getLevel, levelCount, nextLevel, type ResolvedLevel } from '@/game/levels';
import { evaluateCut, type PlayResult } from '@/game/scoring';
import { recordAttempt, useProgress } from '@/game/progress';

type Phase = 'aim' | 'cutting' | 'unfolding' | 'result';

const CUT_MS = 560;

export function Play({ levelId }: { levelId: string }) {
  const level = getLevel(levelId);
  if (!level) {
    return (
      <div className="shell py-24 text-center">
        <h1 className="display-2">没有找到这一关</h1>
        <p className="mt-3 text-[var(--ink-mute)]">它可能已经改名，或者链接不完整。</p>
        <button className="btn btn-primary mt-6" onClick={() => navigate({ name: 'challenge' })}>
          返回关卡列表
        </button>
      </div>
    );
  }
  return <PlayInner key={level.id} level={level} />;
}

function PlayInner({ level }: { level: ResolvedLevel }) {
  const [cut, setCut] = useState<StraightCut>(level.start);
  const [phase, setPhase] = useState<Phase>('aim');
  const [knife, setKnife] = useState(0);
  const [runId, setRunId] = useState(0);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [overlayTarget, setOverlayTarget] = useState(false);
  const [progress, setProgress] = useProgress();
  const phaseRef = useRef<Phase>('aim');
  phaseRef.current = phase;

  const bounds = useMemo(() => packetBounds(level.packet), [level]);
  const center = useMemo(
    () => ({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }),
    [bounds],
  );
  const angle = cutAngleDeg(cut);
  const offset = cutOffset(cut, center);

  const cutPaper = useMemo(() => applyCut(level.packet, cut).paper, [level, cut]);

  const startCut = useCallback(() => {
    if (phaseRef.current !== 'aim') return;
    const verdict = validateCut(level.packet, cut);
    if (!verdict.ok) {
      setMessage(verdict.message);
      return;
    }
    setMessage(null);
    setKnife(0);
    setPhase('cutting');
  }, [cut, level]);

  /* Knife sweep, then hand over to the unfold player. */
  useEffect(() => {
    if (phase !== 'cutting') return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / CUT_MS);
      setKnife(p);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const play = evaluateCut(level, cut);
      setResult(play);
      setRunId((n) => n + 1);
      setPhase('unfolding');
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, cut, level]);

  const onUnfoldDone = useCallback(() => {
    setPhase('result');
  }, []);

  /* Persist the attempt once the score exists and the reveal has finished. */
  useEffect(() => {
    if (phase !== 'result' || !result) return;
    const next = recordAttempt(level.id, result.score.iou, result.score.passed);
    setProgress(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result?.score.iou]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && phaseRef.current === 'aim') {
        e.preventDefault();
        startCut();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startCut]);

  const retry = () => {
    setPhase('aim');
    setResult(null);
    setKnife(0);
    setMessage(null);
  };

  const flipSide = () => {
    setCut((c) => ({ ...c, keepSide: c.keepSide === 1 ? -1 : 1 }));
    setMessage(null);
  };

  const reset = () => {
    setCut(level.start);
    setMessage(null);
  };

  const showAnswer = () => {
    setCut(level.solution);
    setMessage('已填入一个合法解。试着理解它为什么成立，再自己剪一次。');
  };

  const next = nextLevel(level.id);
  const passed = result?.score.passed ?? false;
  const completed = progress.levels[level.id]?.completedAt ?? 0;

  return (
    <div className="shell py-7 sm:py-10">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            className="btn btn-ghost btn-icon"
            aria-label="返回关卡列表"
            onClick={() => navigate({ name: 'challenge' })}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M13 8H3M7 4L3 8l4 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div>
            <p className="num text-[0.68rem] tracking-[0.2em] text-[var(--ink-mute)]">
              LEVEL {String(level.index).padStart(2, '0')} / {String(levelCount).padStart(2, '0')}
            </p>
            <h1 className="display-2 mt-0.5 text-[1.3rem]">{level.name}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-[0.7rem] text-[var(--ink-mute)] sm:block">
            {level.presetId === 'none' ? '不折叠' : `${level.packet.folds.length} 次折叠 · ${level.packet.faces.length} 层`}
          </span>
          {completed > 0 && (
            <span className="chip chip-static border-[var(--gold)] text-[var(--gold)]">已通关</span>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setHintsShown((n) => Math.min(level.hints.length, n + 1))}
          >
            提示 {hintsShown > 0 ? `${hintsShown}/${level.hints.length}` : ''}
          </button>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_356px]">
        {/* ---------------- stage ---------------- */}
        <div>
          <div className="sheet relative p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="font-mono text-[0.62rem] tracking-[0.22em] text-[var(--ink-mute)] uppercase">
                {phase === 'aim' || phase === 'cutting'
                  ? `折叠纸包 · ${level.packet.faces.length} 层`
                  : phase === 'unfolding'
                    ? '逐层展开'
                    : '展开结果'}
              </span>
              {phase === 'result' && (
                <button
                  className="chip chip-static text-[0.68rem]"
                  aria-pressed={overlayTarget}
                  onClick={() => setOverlayTarget((v) => !v)}
                >
                  {overlayTarget ? '隐藏目标轮廓' : '叠加目标轮廓'}
                </button>
              )}
            </div>

            <div className="mx-auto aspect-square w-full max-w-[540px]">
              {(phase === 'aim' || phase === 'cutting') && (
                <PaperCanvas
                  paper={level.packet}
                  mode="packet"
                  cut={cut}
                  onCutChange={(c) => {
                    setCut(c);
                    setMessage(null);
                  }}
                  interactive={phase === 'aim'}
                  knifeProgress={phase === 'cutting' ? knife : null}
                  showCutPreview
                  label={`第 ${level.index} 关的折叠纸包与剪切线`}
                />
              )}
              {phase === 'unfolding' && (
                <UnfoldPlayer paper={cutPaper} runId={runId} onDone={onUnfoldDone} label="逐层展开动画" />
              )}
              {phase === 'result' && result && (
                <PaperCanvas
                  paper={cutPaper}
                  mode="flat"
                  region={result.region}
                  ghost={overlayTarget ? level.target : null}
                  label="展开后的图案"
                />
              )}
            </div>
          </div>

          {/* action bar */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {phase === 'aim' && (
              <>
                <button className="btn btn-primary btn-lg flex-1 sm:flex-none" onClick={startCut}>
                  剪一刀
                  <span className="ml-1 hidden font-mono text-[0.6rem] opacity-70 sm:inline">↵</span>
                </button>
                <button className="btn btn-ghost" onClick={flipSide}>
                  换一侧保留
                </button>
                <button className="btn btn-ghost" onClick={reset}>
                  还原切线
                </button>
                <button className="btn btn-ghost ml-auto" onClick={showAnswer}>
                  查看解答
                </button>
              </>
            )}
            {phase === 'cutting' && <p className="text-[0.82rem] text-[var(--ink-mute)]">正在下刀…</p>}
            {phase === 'unfolding' && <p className="text-[0.82rem] text-[var(--ink-mute)]">纸张正在一层层展开…</p>}
            {phase === 'result' && result && (
              <>
                <button className="btn btn-primary" onClick={retry}>
                  再试一次
                </button>
                {next && (
                  <button
                    className={passed ? 'btn btn-outline' : 'btn btn-ghost'}
                    onClick={() => navigate({ name: 'play', levelId: next.id })}
                  >
                    下一关：{next.name}
                  </button>
                )}
                <button
                  className="btn btn-ghost ml-auto"
                  onClick={() => setOverlayTarget((v) => !v)}
                >
                  {overlayTarget ? '隐藏对比' : '与目标对比'}
                </button>
              </>
            )}
          </div>

          {message && (
            <p
              role="status"
              className="mt-3 rounded-[3px] border border-[var(--gold)] bg-[rgba(201,164,106,0.12)] px-3.5 py-2.5 text-[0.8rem] leading-relaxed text-[var(--ink-soft)]"
            >
              {message}
            </p>
          )}

          {hintsShown > 0 && (
            <ol className="mt-4 space-y-2 border-l-2 border-[var(--gold)] pl-4 text-[0.8rem] leading-relaxed text-[var(--ink-soft)]">
              {level.hints.slice(0, hintsShown).map((hint, i) => (
                <li key={i} className="list-none">
                  <span className="num mr-2 text-[0.68rem] text-[var(--gold)]">H{i + 1}</span>
                  {hint}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ---------------- side panel ---------------- */}
        <aside className="space-y-4">
          <section className="sheet p-4">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Target</p>
              <span className="num text-[0.66rem] text-[var(--ink-mute)]">
                {level.targetArea.toFixed(2)} / 4.00
              </span>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <div className="w-[86px] shrink-0">
                <PaperCanvas
                  paper={level.packet}
                  mode="flat"
                  region={level.target}
                  padding={0.05}
                  fill="#242725"
                  label="本关目标图案"
                />
              </div>
              <p className="text-[0.78rem] leading-relaxed text-[var(--ink-soft)]">{level.brief}</p>
            </div>
          </section>

          {(phase === 'aim' || phase === 'cutting') && (
            <section className="sheet p-4">
              <p className="eyebrow">The Cut</p>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="field-label">
                    <span>角度</span>
                    <span className="num">{angle.toFixed(0)}°</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={179}
                    step={1}
                    value={Math.round(angle)}
                    disabled={phase !== 'aim'}
                    onChange={(e) => setCut((c) => setCutAngleDeg(c, Number(e.target.value)))}
                    aria-label="剪切线角度"
                  />
                </label>

                <label className="block">
                  <span className="field-label">
                    <span>位置</span>
                    <span className="num">{offset.toFixed(2)}</span>
                  </span>
                  <input
                    type="range"
                    min={-1.2}
                    max={1.2}
                    step={0.01}
                    value={Math.max(-1.2, Math.min(1.2, offset))}
                    disabled={phase !== 'aim'}
                    onChange={(e) => setCut((c) => setCutOffset(c, Number(e.target.value), center))}
                    aria-label="剪切线相对纸包中心的位置"
                  />
                </label>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3">
                <span className="text-[0.7rem] text-[var(--ink-mute)]">
                  保留 {cut.keepSide === 1 ? '左' : '右'}侧
                </span>
                <button className="btn btn-ghost btn-sm" onClick={flipSide} disabled={phase !== 'aim'}>
                  换一侧
                </button>
              </div>
              <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--ink-mute)]">
                用鼠标或手指拖动虚线，或者直接拖动两个端点。选中虚线后也可以用方向键微调。
              </p>
            </section>
          )}

          {phase === 'result' && result && (
            <section className="sheet p-5">
              <p className="eyebrow">{passed ? 'Passed' : 'Not yet'}</p>
              <div className="mt-3 flex items-center gap-5">
                <ScoreRing value={result.score.iou} passed={passed} />
                <div>
                  <p className="display-2 text-[1.05rem]">
                    {result.score.grade === 'perfect'
                      ? '完全吻合'
                      : result.score.grade === 'good'
                        ? '通关'
                        : result.score.grade === 'close'
                          ? '非常接近'
                          : '还差一点'}
                  </p>
                  <p className="mt-1 text-[0.72rem] leading-relaxed text-[var(--ink-mute)]">
                    误差 {Math.round(result.score.error * 1000) / 10}% · 面积差{' '}
                    {result.score.areaDelta > 0 ? '+' : ''}
                    {result.score.areaDelta.toFixed(3)}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-[0.8rem] leading-relaxed text-[var(--ink-soft)]">{result.score.feedback}</p>
              <p className="mt-2 text-[0.8rem] leading-relaxed text-[var(--red)]">{result.score.advice}</p>

              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--line)] pt-3 text-center">
                <div>
                  <dt className="text-[0.62rem] tracking-[0.1em] text-[var(--ink-mute)]">面积</dt>
                  <dd className="num mt-0.5 text-[0.82rem]">{result.score.actualArea.toFixed(3)}</dd>
                </div>
                <div>
                  <dt className="text-[0.62rem] tracking-[0.1em] text-[var(--ink-mute)]">孔洞</dt>
                  <dd className="num mt-0.5 text-[0.82rem]">
                    {result.score.holes}/{result.score.targetHoles}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.62rem] tracking-[0.1em] text-[var(--ink-mute)]">判定线</dt>
                  <dd className="num mt-0.5 text-[0.82rem]">{Math.round(level.tolerance * 100)}%</dd>
                </div>
              </dl>
            </section>
          )}

          {phase === 'result' && (
            <section className="sheet-quiet p-4">
              <p className="eyebrow">Why</p>
              <h3 className="mt-2 font-display text-[1rem] tracking-[0.04em]">{level.knowledge.title}</h3>
              <p className="mt-2 text-[0.78rem] leading-relaxed text-[var(--ink-soft)]">{level.knowledge.body}</p>
            </section>
          )}

          {phase !== 'result' && (
            <section className="sheet-quiet p-4">
              <p className="eyebrow">Fold</p>
              <p className="mt-2 text-[0.8rem] leading-relaxed text-[var(--ink-soft)]">
                {level.presetId === 'none'
                  ? '本关不折叠：一刀就是一整条直线。'
                  : `本关固定折法：${level.presetId === 'fold-diag' ? '对角对折' : level.packet.folds.map((f) => f.label).join(' → ')}。`}
              </p>
              <p className="mt-2 text-[0.74rem] leading-relaxed text-[var(--ink-mute)]">{level.subtitle}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function ScoreRing({ value, passed }: { value: number; passed: boolean }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <svg viewBox="0 0 100 100" className="h-[76px] w-[76px] shrink-0" role="img" aria-label={`吻合度 ${Math.round(pct * 100)}%`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={passed ? 'var(--red)' : 'var(--gold)'}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${pct * c} ${c}`}
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.22,0.61,0.24,1)' }}
      />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        className="num"
        fontSize="20"
        fill="var(--ink)"
      >
        {Math.round(pct * 100)}
      </text>
      <text x="50" y="68" textAnchor="middle" fontSize="8" fill="var(--ink-mute)" letterSpacing="1">
        IoU %
      </text>
    </svg>
  );
}
