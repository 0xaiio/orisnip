import { useMemo, useRef, useState } from 'react';
import { navigate } from '@/app/router';
import { PaperCanvas } from '@/components/paper/PaperCanvas';
import { applyCut } from '@/geometry/cuts';
import { buildPacket } from '@/geometry/folds';
import { unfold } from '@/geometry/unfold';
import { getFoldPreset } from '@/geometry/paper';
import { downloadPng, downloadText, buildArtworkSvg } from '@/services/export/artwork';
import { makeWork, saveWork } from '@/services/storage/works';
import { generateDesign, isConfigured, type DesignerResult } from '@/services/ai/designer';
import { LOCAL_PRESETS, designToCuts, type AiDesign } from '@/services/ai/schema';

const EXAMPLES = [
  '我想要一张中秋主题的对称窗花，有月亮和花瓣，适合打印出来做手工。',
  '我喜欢蓝白色的雪花，图案细腻一点，但不要太难剪。',
  '给我设计一朵适合春节装饰的八瓣红色窗花。',
  '我要一张简单、对称、适合小学生剪纸课堂的图案。',
];

const FOLD_LABEL: Record<string, string> = {
  none: '不折叠',
  'fold-x': '左右对折',
  'fold-y': '上下对折',
  'fold-xy': '先左右，再上下',
  'fold-yx': '先上下，再左右',
  'fold-diag': '对角对折',
};

function renderDesign(design: AiDesign) {
  let paper = buildPacket(design.fold);
  for (const cut of designToCuts(design)) paper = applyCut(paper, cut).paper;
  return unfold(paper);
}

export function Atelier() {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DesignerResult | null>(null);
  const [localDesign, setLocalDesign] = useState<AiDesign | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const configured = isConfigured();

  const design = result?.status === 'ok' ? result.design! : localDesign;
  const artwork = useMemo(() => (design ? renderDesign(design) : null), [design]);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setResult(null);
    setLocalDesign(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await generateDesign(prompt, { signal: controller.signal });
      setResult(res);
      if (res.status === 'ok') setPrompt('');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  const useLocal = (index: number) => {
    const preset = LOCAL_PRESETS[index];
    const { keywords, ...rest } = preset;
    void keywords;
    setLocalDesign(rest);
    setResult(null);
    setNotice('已套用本地参数化模板。它由规则匹配得到，不是模型输出。');
  };

  const saveToWorks = () => {
    if (!design) return;
    const work = makeWork({
      title: design.title,
      presetId: design.fold,
      cuts: designToCuts(design),
      paperColor: design.palette.paper,
      bgColor: design.palette.background,
    });
    saveWork(work);
    setNotice('已存入「我的作品」，正在打开工坊…');
    setTimeout(() => {
      window.location.hash = `#/studio?work=${work.id}`;
    }, 400);
  };

  const exportSvg = () => {
    if (!design || !artwork) return;
    downloadText(
      `${design.title}.svg`,
      buildArtworkSvg(artwork.region, {
        paperColor: design.palette.paper,
        background: design.palette.background,
        title: design.title,
      }),
    );
  };

  const exportPng = async () => {
    if (!design || !artwork) return;
    try {
      await downloadPng(artwork.region, `${design.title}.png`, {
        size: 2048,
        paperColor: design.palette.paper,
        background: design.palette.background,
      });
    } catch {
      setNotice('PNG 导出失败，请重试。');
    }
  };

  return (
    <div className="shell py-10 sm:py-14">
      <header className="max-w-[62ch]">
        <div className="flex flex-wrap items-center gap-3">
          <p className="eyebrow">Idea Atelier</p>
          <span
            className={`chip chip-static text-[0.65rem] ${
              configured ? 'border-[var(--jade)] text-[var(--jade)]' : 'border-[var(--line)] text-[var(--ink-mute)]'
            }`}
          >
            {configured ? '运行时模型已配置' : '运行时模型未接入'}
          </span>
        </div>
        <h1 className="display-1 mt-3">AI 灵感设计师</h1>
        <p className="lede mt-4">
          用一句话描述你想要的感觉。模型不会画图——它把一个模糊的念头翻译成折法、切口与配色，
          真正的图案由几何引擎计算出来，可以继续编辑，也可以真的剪出来。
        </p>
        {!configured && (
          <p className="mt-4 border-l-2 border-[var(--gold)] pl-4 text-[0.8rem] leading-relaxed text-[var(--ink-soft)]">
            当前部署没有提供模型服务凭据，因此生成按钮会如实返回「未接入」，不会伪造输出。
            下面仍然提供五套由代码生成的参数化模板，可以直接使用。
          </p>
        )}
      </header>

      <div className="mt-8 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
        <div>
          <label className="block">
            <span className="field-label">
              <span>描述你的想法</span>
              <span className="num">{prompt.length}/300</span>
            </span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, 300))}
              rows={5}
              placeholder="例如：我想要一张中秋主题的对称窗花，有月亮和花瓣，适合打印出来做手工。"
              className="mt-2"
              disabled={busy}
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={run} disabled={busy || prompt.trim().length < 2}>
              {busy ? '正在理解…' : '生成设计方案'}
            </button>
            {busy && (
              <button className="btn btn-ghost" onClick={stop}>
                停止
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => setPrompt(EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)])} disabled={busy}>
              换一个例子
            </button>
          </div>

          <div className="mt-6">
            <p className="eyebrow">Examples</p>
            <ul className="mt-2 space-y-1.5">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button
                    className="text-left text-[0.78rem] leading-relaxed text-[var(--ink-soft)] hover:text-[var(--red)]"
                    onClick={() => setPrompt(ex)}
                  >
                    「{ex}」
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow">Local presets</p>
              <span className="text-[0.66rem] text-[var(--ink-mute)]">规则匹配 · 非模型输出</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {LOCAL_PRESETS.map((preset, i) => (
                <button
                  key={preset.title}
                  className="group rounded-[4px] border border-[var(--line)] bg-[var(--white)] p-3 text-left transition-colors hover:border-[var(--gold)]"
                  onClick={() => useLocal(i)}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: preset.palette.paper }}
                      aria-hidden="true"
                    />
                    <span className="font-display text-[0.92rem] tracking-[0.03em]">{preset.title}</span>
                  </span>
                  <span className="mt-1 block text-[0.7rem] leading-relaxed text-[var(--ink-mute)]">
                    {preset.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {result && result.status !== 'ok' && (
            <div
              role="status"
              className="mt-5 rounded-[3px] border border-[var(--gold)] bg-[rgba(201,164,106,0.1)] px-4 py-3 text-[0.78rem] leading-relaxed text-[var(--ink-soft)]"
            >
              <p>{result.message}</p>
              {result.raw && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[0.72rem] text-[var(--ink-mute)]">查看模型原始输出</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-[rgba(36,39,37,0.05)] p-2 font-mono text-[0.66rem]">
                    {result.raw.slice(0, 1200)}
                  </pre>
                </details>
              )}
            </div>
          )}

          {notice && (
            <p role="status" className="mt-4 text-[0.78rem] text-[var(--ink-soft)]">
              {notice}
            </p>
          )}
        </div>

        <aside className="lg:sticky lg:top-24">
          {design && artwork ? (
            <div className="sheet overflow-hidden">
              <div className="p-4" style={{ background: design.palette.background }}>
                <div className="mx-auto aspect-square w-full max-w-[380px]">
                  <PaperCanvas
                    paper={buildPacket(design.fold)}
                    mode="flat"
                    region={artwork.region}
                    fill={design.palette.paper}
                    label={`${design.title} 的图案`}
                  />
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="display-2 text-[1.2rem]">{design.title}</h2>
                  <span className="num text-[0.62rem] text-[var(--ink-mute)]">
                    {artwork.area.toFixed(2)} / 4.00
                  </span>
                </div>
                <p className="mt-1.5 text-[0.82rem] leading-relaxed text-[var(--ink-soft)]">{design.description}</p>

                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--line)] pt-3 text-center">
                  <div>
                    <dt className="text-[0.6rem] tracking-[0.1em] text-[var(--ink-mute)]">折法</dt>
                    <dd className="mt-0.5 text-[0.72rem]">{FOLD_LABEL[design.fold] ?? design.fold}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.6rem] tracking-[0.1em] text-[var(--ink-mute)]">切口</dt>
                    <dd className="num mt-0.5 text-[0.72rem]">{design.cuts.length}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.6rem] tracking-[0.1em] text-[var(--ink-mute)]">孔洞</dt>
                    <dd className="num mt-0.5 text-[0.72rem]">{artwork.holeCount}</dd>
                  </div>
                </dl>

                <p className="mt-4 border-l-2 border-[var(--gold)] pl-3 text-[0.75rem] leading-relaxed text-[var(--ink-mute)]">
                  {design.note}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn btn-primary btn-sm" onClick={saveToWorks}>
                    在工坊中继续
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={exportSvg}>
                    SVG
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={exportPng}>
                    PNG
                  </button>
                </div>

                <p className="mt-3 text-[0.68rem] leading-relaxed text-[var(--ink-mute)]">
                  折法：{getFoldPreset(design.fold).hint}。图案完全由这条参数计算得到，不包含任何图片素材。
                </p>
              </div>
            </div>
          ) : (
            <div className="flex aspect-[4/5] flex-col items-center justify-center rounded-[4px] border border-dashed border-[var(--line)] p-8 text-center">
              <svg width="52" height="52" viewBox="0 0 64 64" aria-hidden="true" className="opacity-50">
                <path d="M32 6 L58 32 L32 58 L6 32 Z" fill="none" stroke="var(--gold)" strokeWidth="1.2" />
                <path d="M32 18 L46 32 L32 46 L18 32 Z" fill="none" stroke="var(--line)" strokeWidth="1.2" />
                <circle cx="32" cy="32" r="4" fill="var(--red)" opacity="0.5" />
              </svg>
              <p className="mt-4 font-display text-[1rem] tracking-[0.05em]">还没有设计方案</p>
              <p className="mt-1.5 max-w-[30ch] text-[0.76rem] leading-relaxed text-[var(--ink-mute)]">
                写一句描述，或者从左边挑一个本地模板。生成后可以直接进工坊继续改。
              </p>
            </div>
          )}

          <p className="mt-4 text-[0.68rem] leading-relaxed text-[var(--ink-mute)]">
            隐私说明：只有你在输入框里写的这段文字会发送到模型服务，本地作品与折剪参数不会上传。
            模型输出会经过 JSON 与几何双重校验，未通过的一律丢弃。
          </p>
        </aside>
      </div>
    </div>
  );
}

export const atelierRoutes = () => navigate({ name: 'atelier' });
