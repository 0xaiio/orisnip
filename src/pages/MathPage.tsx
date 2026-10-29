import { useMemo, useState } from 'react';
import { PaperCanvas } from '@/components/paper/PaperCanvas';
import { applyCut } from '@/geometry/cuts';
import { buildPacket } from '@/geometry/folds';
import { getFoldPreset } from '@/geometry/paper';
import { unfold } from '@/geometry/unfold';
import { applyTransform, reflection } from '@/geometry/transforms';
import type { StraightCut } from '@/geometry/types';
import { navigate } from '@/app/router';

const DEMO_FOLDS = [
  { id: 'none', label: '不折叠', note: '一刀只有一条边' },
  { id: 'fold-x', label: '折一次', note: '切口被复制两次' },
  { id: 'fold-xy', label: '折两次', note: '切口被复制四次' },
];

/**
 * The same physical cut for every fold plan: a chamfer of leg `d` across the
 * packet corner at (1, 1), keeping the half-plane that contains the origin.
 */
const cornerCut = (d: number): StraightCut => ({
  a: { x: 1 - d, y: 1 },
  b: { x: 1, y: 1 - d },
  keepSide: -1,
});

function ReflectionDemo() {
  const [angleDeg, setAngleDeg] = useState(35);
  const angle = (angleDeg * Math.PI) / 180;
  const normal = { x: Math.cos(angle), y: Math.sin(angle) };
  const line = { point: { x: 0, y: 0 }, normal };
  const t = reflection(line);
  const p = { x: 0.85, y: -0.45 };
  const q = applyTransform(t, p);
  const dir = { x: -normal.y, y: normal.x };

  return (
    <div>
      <svg viewBox="-1.25 -1.25 2.5 2.5" className="w-full" role="img" aria-label="一个点关于直线的镜像">
        <rect x="-1" y="-1" width="2" height="2" fill="none" stroke="var(--line)" strokeWidth="0.008" />
        <line
          x1={-dir.x * 1.5}
          y1={-dir.y * 1.5}
          x2={dir.x * 1.5}
          y2={dir.y * 1.5}
          stroke="var(--gold)"
          strokeWidth="0.012"
        />
        <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--ink-mute)" strokeWidth="0.008" strokeDasharray="0.03 0.03" />
        <circle cx={p.x} cy={p.y} r="0.055" fill="var(--red)" />
        <circle cx={q.x} cy={q.y} r="0.055" fill="var(--jade)" />
        <text x={p.x + 0.08} y={p.y - 0.05} fontSize="0.13" fill="var(--red)" fontFamily="monospace">
          P
        </text>
        <text x={q.x + 0.08} y={q.y - 0.05} fontSize="0.13" fill="var(--jade)" fontFamily="monospace">
          P′
        </text>
      </svg>
      <label className="mt-3 block">
        <span className="field-label">
          <span>折痕方向</span>
          <span className="num">{angleDeg}°</span>
        </span>
        <input
          type="range"
          min={0}
          max={180}
          value={angleDeg}
          onChange={(e) => setAngleDeg(Number(e.target.value))}
          aria-label="折痕方向"
        />
      </label>
      <p className="mt-2 text-[0.74rem] leading-relaxed text-[var(--ink-mute)]">
        无论折痕转到哪里，|OP| 与 |OP′| 始终相等，面积、角度也全部保持——这就是「等距变换」。
      </p>
    </div>
  );
}

function FoldDemo() {
  const [presetId, setPresetId] = useState('fold-xy');
  const [d, setD] = useState(0.5);

  const data = useMemo(() => {
    const packet = buildPacket(presetId);
    const cut = cornerCut(d);
    const applied = applyCut(packet, cut);
    const result = unfold(applied.paper);
    return { packet, result, layers: packet.faces.length };
  }, [presetId, d]);

  const preset = getFoldPreset(presetId);


  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {DEMO_FOLDS.map((f) => (
          <button
            key={f.id}
            className={`chip ${presetId === f.id ? 'is-active' : ''}`}
            aria-pressed={presetId === f.id}
            onClick={() => setPresetId(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 items-center gap-4">
        <div>
          <div className="aspect-square w-full rounded-[3px] border border-[var(--line)] bg-[var(--white)] p-1.5">
            <PaperCanvas
              paper={data.packet}
              mode="packet"
              cut={cornerCut(d)}
              padding={0.1}
              label="折叠纸包与切线"
            />
          </div>
          <p className="mt-1.5 text-center font-mono text-[0.6rem] tracking-[0.14em] text-[var(--ink-mute)] uppercase">
            折包 · {data.layers} 层
          </p>
        </div>
        <div>
          <div className="aspect-square w-full rounded-[3px] border border-[var(--line)] bg-[var(--white)] p-1.5">
            <PaperCanvas paper={data.packet} mode="flat" region={data.result.region} padding={0.1} label="展开结果" />
          </div>
          <p className="mt-1.5 text-center font-mono text-[0.6rem] tracking-[0.14em] text-[var(--ink-mute)] uppercase">
            展开 · {data.result.holeCount} 孔
          </p>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="field-label">
          <span>切线到折角的距离 d</span>
          <span className="num">{d.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min={0.12}
          max={0.95}
          step={0.01}
          value={d}
          onChange={(e) => setD(Number(e.target.value))}
          aria-label="切线到折角的距离"
        />
      </label>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--line)] pt-3 text-center">
        <div>
          <dt className="text-[0.6rem] tracking-[0.1em] text-[var(--ink-mute)]">层数</dt>
          <dd className="num mt-0.5 text-[0.9rem]">{data.layers}</dd>
        </div>
        <div>
          <dt className="text-[0.6rem] tracking-[0.1em] text-[var(--ink-mute)]">剩余面积</dt>
          <dd className="num mt-0.5 text-[0.9rem]">{data.result.area.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-[0.6rem] tracking-[0.1em] text-[var(--ink-mute)]">孔洞</dt>
          <dd className="num mt-0.5 text-[0.9rem]">{data.result.holeCount}</dd>
        </div>
      </dl>

      <p className="mt-3 text-[0.74rem] leading-relaxed text-[var(--ink-mute)]">
        {preset.folds.length === 0
          ? '没有折叠时，这条斜线只剪掉一个角。'
          : presetId === 'fold-x'
            ? '折一次后，切口被左右镜像复制：一张纸同时失去两个角。'
            : '折两次后，四个象限共享同一条切线：四个角同时消失，纸张变成八边形。层数就是复制次数。'}
      </p>
    </div>
  );
}

export function MathPage() {
  return (
    <div className="shell py-10 sm:py-14">
      <header className="max-w-[62ch]">
        <p className="eyebrow">Mathematics of Paper</p>
        <h1 className="display-1 mt-3">纸艺中的数学</h1>
        <p className="lede mt-4">
          剪纸看起来是手艺，底下是三件很朴素的事：反射、层、以及一条直线的方程。
          这里不放长公式，只放可以拖动的图。
        </p>
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <section>
          <h2 className="display-2">一、折叠就是反射</h2>
          <p className="mt-3 text-[0.86rem] leading-relaxed text-[var(--ink-soft)]">
            把纸沿一条直线折过去，纸上的每个点都跨过这条线落到对称位置。数学上，这是一次
            <strong className="font-medium text-[var(--ink)]">关于直线的反射</strong>：
            <span className="num"> p′ = p − 2(n·p)n</span>，其中 n 是折痕的单位法向量。
          </p>
          <p className="mt-3 text-[0.86rem] leading-relaxed text-[var(--ink-soft)]">
            反射是等距变换：任意两点的距离不变，任何图形的面积不变。这条性质是我们能「展开回去」的全部依据。
          </p>
          <div className="sheet mt-5 p-4">
            <ReflectionDemo />
          </div>
        </section>

        <section>
          <h2 className="display-2">二、层数就是复制次数</h2>
          <p className="mt-3 text-[0.86rem] leading-relaxed text-[var(--ink-soft)]">
            折一次，纸变成两层；再折一次，四层。剪刀穿过纸包时，一次下剪会在每一层上各留下一条切口，
            展开后就是同样多的镜像副本。
          </p>
          <p className="mt-3 text-[0.86rem] leading-relaxed text-[var(--ink-soft)]">
            下面这条切线在折包里只是简单的一条斜线。切换折法，看它如何被复制成完全不同的图案。
          </p>
          <div className="sheet mt-5 p-4">
            <FoldDemo />
          </div>
        </section>
      </div>

      <section className="mt-16">
        <h2 className="display-2">三、一刀能剪出什么</h2>
        <div className="mt-5 grid gap-6 md:grid-cols-3">
          <div className="sheet p-5">
            <p className="eyebrow">Theorem</p>
            <h3 className="mt-2 font-display text-[1.05rem] tracking-[0.03em]">Fold-and-Cut</h3>
            <p className="mt-2.5 text-[0.8rem] leading-relaxed text-[var(--ink-soft)]">
              任何由有限条直线段构成的目标图形，都可以通过先把纸折叠成某个平折状态、再沿一条直线剪一刀得到。
              这是 Erik Demaine、Martin Demaine 与 Anna Lubiw 在 1999 年证明的结果。
            </p>
            <p className="mt-2.5 text-[0.74rem] leading-relaxed text-[var(--ink-mute)]">
              它保证了「一刀剪」的表达力，但没有给出好用的折法。找一个具体图形的最优折法，通常仍然很难。
            </p>
          </div>

          <div className="sheet p-5">
            <p className="eyebrow">Scope</p>
            <h3 className="mt-2 font-display text-[1.05rem] tracking-[0.03em]">本应用实现到哪里</h3>
            <p className="mt-2.5 text-[0.8rem] leading-relaxed text-[var(--ink-soft)]">
              我们实现的是一个受限但精确的子集：中线对折、对角对折，以及折包上的一条连续直线切割。
              每一层的映射都是真实等距变换，展开是它的逆映射，结果由多边形布尔运算合并。
            </p>
            <p className="mt-2.5 text-[0.74rem] leading-relaxed text-[var(--ink-mute)]">
              它不是任意多边形一刀剪切问题的通用求解器，也不声称支持任意平折状态。
            </p>
          </div>

          <div className="sheet p-5">
            <p className="eyebrow">Reading</p>
            <h3 className="mt-2 font-display text-[1.05rem] tracking-[0.03em]">延伸阅读</h3>
            <ul className="mt-3 space-y-2 text-[0.78rem] leading-relaxed">
              <li>
                <a
                  className="text-[var(--red)] underline decoration-[rgba(185,54,69,0.3)] underline-offset-2 hover:decoration-[var(--red)]"
                  href="https://erikdemaine.org/foldcut/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Erik Demaine · Fold and Cut
                </a>
              </li>
              <li>
                <a
                  className="text-[var(--red)] underline decoration-[rgba(185,54,69,0.3)] underline-offset-2 hover:decoration-[var(--red)]"
                  href="https://erikdemaine.org/fonts/simplefoldcut/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Simple Fold &amp; Cut Font
                </a>
              </li>
              <li>
                <a
                  className="text-[var(--red)] underline decoration-[rgba(185,54,69,0.3)] underline-offset-2 hover:decoration-[var(--red)]"
                  href="https://origamisimulator.org/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Origami Simulator
                </a>
              </li>
            </ul>
            <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--ink-mute)]">
              以上为外部链接，仅作延伸阅读。本项目的代码、图案与文案均为原创，未复制上述来源的谜题或素材。
            </p>
          </div>
        </div>
      </section>

      <section className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] pt-8">
        <p className="max-w-[46ch] text-[0.84rem] leading-relaxed text-[var(--ink-soft)]">
          看懂了吗？最好的检验方式是回到关卡，把那个菱形剪出来。
        </p>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={() => navigate({ name: 'play', levelId: 'l3' })}>
            试试第三关
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate({ name: 'studio' })}>
            去工坊创作
          </button>
        </div>
      </section>
    </div>
  );
}
