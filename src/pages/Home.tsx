import { useMemo } from 'react';
import { HeroStage } from '@/components/home/HeroStage';
import { navigate } from '@/app/router';
import { LEVELS, levelCount } from '@/game/levels';
import { applyCut } from '@/geometry/cuts';
import { buildPacket } from '@/geometry/folds';
import { unfold } from '@/geometry/unfold';
import { regionToPath } from '@/components/paper/path';
import type { MultiPolygon, StraightCut } from '@/geometry/types';

const ENTRIES: { no: string; title: string; en: string; desc: string; to: Parameters<typeof navigate>[0] }[] = [
  {
    no: '01',
    title: '一刀挑战',
    en: 'One-Cut Challenge',
    desc: '八个关卡，每一关都有经算法验证的合法解。折、剪、展开，比对目标。',
    to: { name: 'challenge' },
  },
  {
    no: '02',
    title: '剪纸工坊',
    en: 'Paper Studio',
    desc: '自选折法、自定切口，双画布实时预览，导出可用的 SVG 与高清 PNG。',
    to: { name: 'studio' },
  },
  {
    no: '03',
    title: 'AI 灵感设计师',
    en: 'Idea Atelier',
    desc: '用一句话描述你的创意，模型把它翻译成几何引擎能执行的参数。',
    to: { name: 'atelier' },
  },
  {
    no: '04',
    title: '我的作品',
    en: 'My Works',
    desc: '所有创作保存在本地浏览器里，随时回来继续，也可以重新导出。',
    to: { name: 'works' },
  },
  {
    no: '05',
    title: '纸艺中的数学',
    en: 'Mathematics',
    desc: '轴对称、层与切口、Fold-and-Cut 定理——用可以动手的图解释。',
    to: { name: 'math' },
  },
];

function MiniFigure({ region, caption, note }: { region: MultiPolygon; caption: string; note: string }) {
  return (
    <figure className="m-0">
      <svg viewBox="-1.15 -1.15 2.3 2.3" className="w-full" role="img" aria-label={`${caption}：${note}`}>
        <path d={regionToPath(region)} fillRule="evenodd" fill="var(--red)" opacity="0.92" />
      </svg>
      <figcaption className="mt-3 border-t border-[var(--line)] pt-2.5">
        <span className="block font-display text-[0.95rem] tracking-[0.1em] text-[var(--ink)]">{caption}</span>
        <span className="mt-0.5 block text-[0.72rem] leading-relaxed text-[var(--ink-mute)]">{note}</span>
      </figcaption>
    </figure>
  );
}

export function Home() {
  const figures = useMemo(() => {
    // One and the same cut, applied to three fold plans: the only thing that
    // changes is how many times the scissors are duplicated.
    const cut: StraightCut = { a: { x: 0.35, y: 1 }, b: { x: 1, y: 0.35 }, keepSide: -1 };
    const none = unfold(applyCut(buildPacket('none'), cut).paper);
    const fold1 = unfold(applyCut(buildPacket('fold-x'), cut).paper);
    const fold2 = unfold(applyCut(buildPacket('fold-xy'), cut).paper);
    return { none, fold1, fold2 };
  }, []);

  return (
    <div>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="shell relative grid items-center gap-10 pb-16 pt-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:pb-24 lg:pt-16">
        <div className="anim-rise">
          <p className="eyebrow">计算折纸 · 剪纸实验室</p>

          <h1 className="display-hero mt-5">
            一刀
            <span className="relative inline-block">
              万象
              <svg
                className="absolute -bottom-3 left-0 w-full"
                height="10"
                viewBox="0 0 200 10"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d="M2 7 C 50 2, 150 2, 198 6" stroke="var(--gold)" strokeWidth="1.6" fill="none" />
              </svg>
            </span>
          </h1>

          <div className="mt-7 flex items-center gap-4">
            <span className="h-px w-12 bg-[var(--gold)]" aria-hidden="true" />
            <span className="font-mono text-[0.66rem] tracking-[0.32em] text-[var(--ink-mute)] uppercase">
              One Cut, Infinite Wonders
            </span>
          </div>

          <p className="lede mt-7 max-w-[34ch] text-balance">
            折一折，剪一刀，亲眼看着一条直线在展开的瞬间变成对称的窗花。
            一张纸，千种可能；一把剪刀，万象展开。
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <button className="btn btn-primary btn-lg" onClick={() => navigate({ name: 'play', levelId: 'l1' })}>
              立即剪一刀
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="btn btn-outline btn-lg" onClick={() => navigate({ name: 'studio' })}>
              开始创造
            </button>
          </div>

          <dl className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-2 text-[0.72rem] text-[var(--ink-mute)]">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">注册</dt>
              <dd>无需注册</dd>
            </div>
            <span aria-hidden="true" className="text-[var(--line)]">/</span>
            <div className="flex items-center gap-1.5">
              <dd>逐层真实几何</dd>
            </div>
            <span aria-hidden="true" className="text-[var(--line)]">/</span>
            <div className="flex items-center gap-1.5">
              <dd>可导出 SVG · PNG</dd>
            </div>
          </dl>
        </div>

        <div className="anim-fade delay-2 relative">
          <div
            className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-70 blur-3xl"
            style={{ background: 'radial-gradient(circle at 55% 45%, rgba(201,164,106,0.22), transparent 62%)' }}
            aria-hidden="true"
          />
          <HeroStage />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Honest numbers                                                   */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-[var(--line)] bg-[rgba(241,233,218,0.45)]">
        <div className="shell grid grid-cols-2 gap-6 py-7 sm:grid-cols-4">
          {[
            { k: `${levelCount}`, v: '个可通关卡' },
            { k: '6', v: '种折叠方案' },
            { k: '0', v: '张预制成品图' },
            { k: '2', v: '种矢量 / 位图导出' },
          ].map((item) => (
            <div key={item.v} className="flex items-baseline gap-3">
              <span className="num text-[1.6rem] leading-none text-[var(--red)]">{item.k}</span>
              <span className="text-[0.75rem] tracking-[0.05em] text-[var(--ink-mute)]">{item.v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Index of experiences                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="shell pt-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Contents</p>
            <h2 className="display-1 mt-3">五种进入纸的方式</h2>
          </div>
          <p className="max-w-[36ch] text-[0.82rem] leading-relaxed text-[var(--ink-mute)]">
            从一关游戏开始，或者直接进入工坊自由创作。它们共用同一个几何内核。
          </p>
        </div>

        <div className="mt-10">
          {ENTRIES.map((entry) => (
            <a
              key={entry.no}
              href={`#/${entry.to.name === 'home' ? '' : entry.to.name}`}
              className="group grid grid-cols-[2.2rem_1fr_auto] items-baseline gap-4 border-t border-[var(--line)] py-6 no-underline last:border-b sm:grid-cols-[3rem_1fr_auto] sm:gap-8 sm:py-7"
              onClick={(e) => {
                e.preventDefault();
                navigate(entry.to);
              }}
            >
              <span className="num text-[0.72rem] text-[var(--ink-mute)]">{entry.no}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h3 className="display-2 transition-colors group-hover:text-[var(--red)]">{entry.title}</h3>
                  <span className="font-mono text-[0.62rem] tracking-[0.22em] text-[var(--ink-mute)] uppercase">
                    {entry.en}
                  </span>
                </div>
                <p className="mt-1.5 max-w-[52ch] text-[0.84rem] leading-relaxed text-[var(--ink-soft)]">
                  {entry.desc}
                </p>
              </div>
              <span
                className="translate-x-0 text-[1.1rem] text-[var(--ink-mute)] transition-all duration-500 group-hover:translate-x-1.5 group-hover:text-[var(--red)]"
                aria-hidden="true"
              >
                →
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Mathematics teaser                                               */}
      {/* ---------------------------------------------------------------- */}
      <section className="shell pt-24">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <p className="eyebrow">Mathematics</p>
            <h2 className="display-1 mt-3">折叠，是给每个点换一个坐标</h2>
            <p className="lede mt-5">
              每一次折叠，都把纸的一部分做一次反射；展开，就是把这次反射撤销。
              同一条直线，经过 n 次折叠，就会在纸上留下 n 份镜像。
            </p>
            <p className="mt-5 text-[0.82rem] leading-relaxed text-[var(--ink-mute)]">
              下面的三张图不是插画，是引擎实时算出来的结果。折得越多，同样一刀能留下的形状越复杂。
            </p>
            <button className="btn btn-ghost btn-sm mt-6" onClick={() => navigate({ name: 'math' })}>
              读一读这里的数学
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 sm:gap-7">
            <MiniFigure
              region={figures.none.region}
              caption="不折叠"
              note={`剪掉 1 个角，面积 ${figures.none.area.toFixed(2)}`}
            />
            <MiniFigure
              region={figures.fold1.region}
              caption="折一次"
              note={`2 个角同时消失，面积 ${figures.fold1.area.toFixed(2)}`}
            />
            <MiniFigure
              region={figures.fold2.region}
              caption="折两次"
              note={`4 个角同时消失，面积 ${figures.fold2.area.toFixed(2)}`}
            />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Closing call                                                     */}
      {/* ---------------------------------------------------------------- */}
      <section className="shell pt-24">
        <div className="sheet relative overflow-hidden px-7 py-12 sm:px-14 sm:py-16">
          <div
            className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-60 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(185,54,69,0.16), transparent 65%)' }}
            aria-hidden="true"
          />
          <div className="relative max-w-[46ch]">
            <p className="eyebrow">Start here</p>
            <h2 className="display-1 mt-3">第一关只需要十秒</h2>
            <p className="lede mt-4">
              不折，剪一刀，看看直线能留下什么。然后你会发现，折叠会让同一刀变成四刀、八刀。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="btn btn-primary" onClick={() => navigate({ name: 'play', levelId: LEVELS[0].id })}>
                开始第一关
              </button>
              <button className="btn btn-ghost" onClick={() => navigate({ name: 'challenge' })}>
                查看全部 {levelCount} 关
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
