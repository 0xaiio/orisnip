import { useEffect, useState } from 'react';
import type { Route } from './router';
import { navigate, routeToPath, useRoute } from './router';
import { Home } from '@/pages/Home';
import { Challenge } from '@/pages/Challenge';
import { Play } from '@/pages/Play';
import { Studio } from '@/pages/Studio';
import { MathPage } from '@/pages/MathPage';
import { Atelier } from '@/pages/Atelier';
import { Works } from '@/pages/Works';

const NAV: { route: Route; label: string; en: string }[] = [
  { route: { name: 'home' }, label: '首页', en: 'Index' },
  { route: { name: 'challenge' }, label: '一刀挑战', en: 'Challenge' },
  { route: { name: 'studio' }, label: '剪纸工坊', en: 'Studio' },
  { route: { name: 'atelier' }, label: 'AI 灵感', en: 'Atelier' },
  { route: { name: 'math' }, label: '纸艺数学', en: 'Mathematics' },
  { route: { name: 'works' }, label: '我的作品', en: 'Works' },
];

function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2.5 L29.5 16 L16 29.5 L2.5 16 Z" fill="var(--red)" />
      <path d="M16 9.5 L22.5 16 L16 22.5 L9.5 16 Z" fill="var(--paper)" />
    </svg>
  );
}

export function App() {
  const route = useRoute();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route.name, route.name === 'play' ? route.levelId : '']);

  const isActive = (r: Route) =>
    r.name === route.name || (r.name === 'challenge' && route.name === 'play');

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className={`sticky top-0 z-40 transition-all duration-500 ${
          scrolled ? 'border-b border-[var(--line)] bg-[rgba(248,243,233,0.86)] backdrop-blur-md' : 'border-b border-transparent'
        }`}
      >
        <div className="shell flex items-center gap-3 py-3 sm:gap-6">
          <a
            href="#/"
            className="flex shrink-0 items-center gap-2.5 no-underline"
            aria-label="回到首页"
            onClick={(e) => {
              e.preventDefault();
              navigate({ name: 'home' });
            }}
          >
            <Logo />
            <span className="flex flex-col leading-none">
              <span className="font-display text-[1rem] tracking-[0.22em] whitespace-nowrap text-[var(--ink)]">
                一刀万象
              </span>
              <span className="mt-1 hidden font-mono text-[0.52rem] tracking-[0.3em] text-[var(--ink-mute)] uppercase sm:block">
                Orisnip
              </span>
            </span>
          </a>

          {/* Horizontal scroll keeps every entry reachable on a phone without
              collapsing the navigation into a hamburger. */}
          <nav
            aria-label="主导航"
            className="-mr-1 ml-auto flex min-w-0 items-center gap-0.5 overflow-x-auto pl-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {NAV.map((item) => {
              const active = isActive(item.route);
              return (
                <a
                  key={item.label}
                  href={routeToPath(item.route)}
                  aria-current={active ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(item.route);
                  }}
                  className={`relative shrink-0 whitespace-nowrap rounded-full px-2 py-2 text-[0.74rem] tracking-[0.04em] transition-colors sm:px-3.5 sm:text-[0.78rem] sm:tracking-[0.08em] ${
                    active ? 'text-[var(--ink)]' : 'text-[var(--ink-mute)] hover:text-[var(--ink)]'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-1.5 -bottom-0.5 h-px bg-[var(--red)] sm:inset-x-3" aria-hidden="true" />
                  )}
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {route.name === 'home' && <Home />}
        {route.name === 'challenge' && <Challenge />}
        {route.name === 'play' && <Play levelId={route.levelId} />}
        {route.name === 'studio' && <Studio />}
        {route.name === 'atelier' && <Atelier />}
        {route.name === 'math' && <MathPage />}
        {route.name === 'works' && <Works />}
      </main>

      <footer className="mt-24 border-t border-[var(--line)] bg-[rgba(241,233,218,0.5)]">
        <div className="shell grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Logo size={22} />
              <span className="font-display text-[0.95rem] tracking-[0.22em]">一刀万象</span>
            </div>
            <p className="mt-3 max-w-[22ch] text-[0.78rem] leading-relaxed text-[var(--ink-mute)]">
              一张纸，千种可能；一把剪刀，万象展开。
            </p>
          </div>

          <div>
            <p className="eyebrow">Explore</p>
            <ul className="mt-3 space-y-1.5 text-[0.82rem]">
              {NAV.slice(1).map((item) => (
                <li key={item.label}>
                  <a
                    className="text-[var(--ink-soft)] no-underline hover:text-[var(--red)]"
                    href={routeToPath(item.route)}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(item.route);
                    }}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="eyebrow">Method</p>
            <p className="mt-3 text-[0.78rem] leading-relaxed text-[var(--ink-mute)]">
              所有图案由确定性的折纸几何引擎计算：每一层纸都是一次等距变换，展开是它的逆映射。没有预制图片，也没有像素级近似。
            </p>
          </div>

          <div>
            <p className="eyebrow">Notes</p>
            <p className="mt-3 text-[0.78rem] leading-relaxed text-[var(--ink-mute)]">
              作品保存在浏览器本地。受 Erik Demaine 的 Fold-and-Cut 研究启发，本项目未复制其谜题或素材。
            </p>
          </div>
        </div>
        <div className="shell flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] py-5 text-[0.7rem] text-[var(--ink-mute)]">
          <span>© {new Date().getFullYear()} 一刀万象 · Orisnip</span>
          <span className="font-mono tracking-[0.18em] uppercase">Computational Paper Art</span>
        </div>
      </footer>
    </div>
  );
}
