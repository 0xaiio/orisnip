import { useCallback, useMemo, useRef, useState } from 'react';
import { PaperCanvas } from '@/components/paper/PaperCanvas';
import { applyCut, cutAngleDeg, cutOffset, setCutAngleDeg, setCutOffset, validateCut } from '@/geometry/cuts';
import { buildPacket } from '@/geometry/folds';
import { packetBounds, getFoldPreset } from '@/geometry/paper';
import { unfold } from '@/geometry/unfold';
import { FOLD_PRESETS } from '@/geometry/paper';
import type { StraightCut } from '@/geometry/types';
import { PAPER_COLORS, BG_COLORS, TEMPLATES } from '@/studio/patterns';
import { downloadPng, downloadShareCard, downloadText, buildArtworkSvg } from '@/services/export/artwork';
import { getWork, makeWork, saveWork } from '@/services/storage/works';
import { readHashQuery } from '@/app/router';

/**
 * The studio.
 *
 * Left: the folded packet you cut. Right: the unfolded artwork, recomputed on
 * every keystroke. Both are the same geometry — there is no separate "preview
 * renderer" that could drift from the export.
 *
 * A studio document is fully parametric, so undo/redo restores geometry (not
 * pixels), and saved works are a few hundred bytes.
 */

interface Doc {
  title: string;
  presetId: string;
  cuts: StraightCut[];
  active: number;
  paperColor: string;
  bgColor: string;
}

const initialDoc: Doc = {
  title: '未命名作品',
  presetId: 'fold-xy',
  cuts: [{ a: { x: 0, y: 0.45 }, b: { x: 0.45, y: 0 }, keepSide: 1 }],
  active: 0,
  paperColor: '#B93645',
  bgColor: '#F8F3E9',
};

function useUndoable<T>(initial: T) {
  const [state, setState] = useState<T>(initial);
  const ref = useRef<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, force] = useState(0);

  const set = useCallback((next: T, record = true) => {
    if (record) {
      past.current.push(ref.current);
      if (past.current.length > 120) past.current.shift();
      future.current = [];
    }
    ref.current = next;
    setState(next);
    force((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(ref.current);
    ref.current = prev;
    setState(prev);
    force((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(ref.current);
    ref.current = next;
    setState(next);
    force((v) => v + 1);
  }, []);

  return {
    state,
    set,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}

export function Studio() {
  // `#/studio?work=<id>` reopens a saved work. The document is rebuilt from
  // parameters, so what comes back is the same geometry, not a screenshot.
  const resumed = useRef(readHashQuery().work).current;
  const restored = resumed ? getWork(resumed) : undefined;
  const startDoc: Doc = restored
    ? {
        title: restored.title,
        presetId: restored.presetId,
        cuts: restored.cuts.map((c) => ({ ...c })),
        active: 0,
        paperColor: restored.paperColor,
        bgColor: restored.bgColor,
      }
    : initialDoc;

  const { state: doc, set: setDoc, undo, redo, canUndo, canRedo } = useUndoable<Doc>(startDoc);
  const [notice, setNotice] = useState<string | null>(null);
  const [workId, setWorkId] = useState<string | null>(restored?.id ?? null);

  const packet = useMemo(() => buildPacket(doc.presetId), [doc.presetId]);
  const bounds = useMemo(() => packetBounds(packet), [packet]);
  const center = useMemo(
    () => ({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }),
    [bounds],
  );

  const stacked = useMemo(() => {
    let current = packet;
    const issues: string[] = [];
    for (const [i, cut] of doc.cuts.entries()) {
      const verdict = validateCut(current, cut);
      if (!verdict.ok) issues.push(`第 ${i + 1} 刀：${verdict.message}`);
      current = applyCut(current, cut).paper;
    }
    return { paper: current, issues };
  }, [packet, doc.cuts]);

  const artwork = useMemo(() => unfold(stacked.paper), [stacked.paper]);

  const activeCut = doc.cuts[doc.active] ?? doc.cuts[0];
  const angle = activeCut ? cutAngleDeg(activeCut) : 0;
  const offset = activeCut ? cutOffset(activeCut, center) : 0;

  const updateCut = (index: number, cut: StraightCut, record = true) => {
    const cuts = doc.cuts.map((c, i) => (i === index ? cut : c));
    setDoc({ ...doc, cuts }, record);
  };

  const addCut = () => {
    const y = (bounds.minY + bounds.maxY) / 2;
    const cut: StraightCut = {
      a: { x: bounds.minX, y },
      b: { x: bounds.maxX, y },
      keepSide: 1,
    };
    setDoc({ ...doc, cuts: [...doc.cuts, cut], active: doc.cuts.length });
  };

  const removeCut = (index: number) => {
    if (doc.cuts.length <= 1) return;
    const cuts = doc.cuts.filter((_, i) => i !== index);
    setDoc({ ...doc, cuts, active: Math.max(0, Math.min(cuts.length - 1, doc.active)) });
  };

  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setDoc({
      ...doc,
      title: t.name,
      presetId: t.presetId,
      cuts: t.cuts.map((c) => ({ ...c })),
      active: 0,
      paperColor: t.paperColor,
      bgColor: t.bgColor,
    });
    setNotice(`已套用「${t.name}」：${t.note}`);
  };

  const reset = () => {
    setDoc({ ...initialDoc, title: doc.title });
    setNotice('已回到空白纸。');
  };

  const persist = () => {
    const work = makeWork({
      ...(workId ? { id: workId } : {}),
      title: doc.title,
      presetId: doc.presetId,
      cuts: doc.cuts,
      paperColor: doc.paperColor,
      bgColor: doc.bgColor,
    });
    saveWork(work);
    setWorkId(work.id);
    setNotice('已保存到本机。刷新页面后仍可在「我的作品」里找到它。');
  };

  const exportSvg = () => {
    const svg = buildArtworkSvg(artwork.region, {
      size: 1024,
      paperColor: doc.paperColor,
      background: doc.bgColor,
      padding: 0.06,
      title: doc.title,
    });
    downloadText(`${safeName(doc.title)}.svg`, svg);
    setNotice('已导出 SVG：保留真实矢量路径与孔洞，可直接交给矢量软件。');
  };

  const exportPng = async () => {
    try {
      await downloadPng(artwork.region, `${safeName(doc.title)}@2x.png`, {
        size: 2048,
        paperColor: doc.paperColor,
        background: doc.bgColor,
        padding: 0.06,
      });
      setNotice('已导出 2048 × 2048 PNG。');
    } catch {
      setNotice('PNG 导出失败：浏览器拒绝了画布绘制，请重试。');
    }
  };

  const exportCard = async () => {
    try {
      await downloadShareCard(artwork.region, `${safeName(doc.title)}-card.png`, {
        title: doc.title,
        subtitle: `${foldLabel(doc.presetId)} · ${doc.cuts.length} 条直线切口`,
        paperColor: doc.paperColor,
        background: doc.bgColor,
      });
      setNotice('已生成分享卡片（1200 × 1500）。');
    } catch {
      setNotice('分享卡生成失败，请改用 PNG 导出。');
    }
  };

  return (
    <div className="shell py-7 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Paper Studio</p>
          <h1 className="display-1 mt-2 text-[2.1rem]">剪纸工坊</h1>
          <p className="mt-2 max-w-[52ch] text-[0.84rem] leading-relaxed text-[var(--ink-soft)]">
            左边是你手里的折包，右边是它展开之后的样子。任何参数改变都会立刻重新计算——
            没有「生成中」，也没有预制图案。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-icon" onClick={undo} disabled={!canUndo} aria-label="撤销">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 7h7a3 3 0 010 6H6M3 7l3-3M3 7l3 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="btn btn-ghost btn-icon" onClick={redo} disabled={!canRedo} aria-label="重做">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M13 7H6a3 3 0 000 6h4M13 7l-3-3M13 7l-3 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="btn btn-primary btn-sm" onClick={persist}>
            保存作品
          </button>
        </div>
      </header>

      {/* canvases */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="sheet p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[0.62rem] tracking-[0.22em] text-[var(--ink-mute)] uppercase">
              折叠工作台 · {packet.faces.length} 层
            </span>
            <span className="text-[0.66rem] text-[var(--ink-mute)]">拖动虚线或端点</span>
          </div>
          <div className="mx-auto aspect-square w-full max-w-[440px]">
            <PaperCanvas
              paper={packet}
              mode="packet"
              cut={activeCut ?? null}
              onCutChange={(c) => updateCut(doc.active, c, false)}
              interactive
              fill={doc.paperColor}
              label="折叠后的纸包与当前切口"
            />
          </div>
        </section>

        <section className="p-4" style={{ background: doc.bgColor, borderRadius: 4, border: '1px solid var(--line)' }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[0.62rem] tracking-[0.22em] uppercase" style={{ color: 'rgba(36,39,37,0.55)' }}>
              展开预览
            </span>
            <span className="num text-[0.66rem]" style={{ color: 'rgba(36,39,37,0.55)' }}>
              {artwork.holeCount} 孔 · {artwork.area.toFixed(2)} / 4.00
            </span>
          </div>
          <div className="mx-auto aspect-square w-full max-w-[440px]">
            <PaperCanvas
              paper={packet}
              mode="flat"
              region={artwork.region}
              fill={doc.paperColor}
              label="实时展开预览"
            />
          </div>
        </section>
      </div>

      {stacked.issues.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-[3px] border border-[var(--gold)] bg-[rgba(201,164,106,0.1)] px-4 py-3 text-[0.78rem] text-[var(--ink-soft)]">
          {stacked.issues.map((issue, i) => (
            <li key={i} className="list-none">
              {issue}
            </li>
          ))}
        </ul>
      )}

      {/* controls */}
      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <section className="sheet p-4">
          <p className="eyebrow">Fold</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {FOLD_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={`chip ${doc.presetId === preset.id ? 'is-active' : ''}`}
                aria-pressed={doc.presetId === preset.id}
                onClick={() => setDoc({ ...doc, presetId: preset.id })}
                title={preset.hint}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--ink-mute)]">
            {getFoldPreset(doc.presetId).hint}
          </p>
        </section>

        <section className="sheet p-4">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Cuts</p>
            <button className="btn btn-ghost btn-sm" onClick={addCut}>
              + 加一刀
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {doc.cuts.map((_, i) => (
              <span key={i} className="inline-flex items-center">
                <button
                  className={`chip rounded-r-none ${doc.active === i ? 'is-active' : ''}`}
                  aria-pressed={doc.active === i}
                  onClick={() => setDoc({ ...doc, active: i })}
                >
                  第 {i + 1} 刀
                </button>
                {doc.cuts.length > 1 && (
                  <button
                    className="chip rounded-l-none border-l-0 px-1.5"
                    aria-label={`删除第 ${i + 1} 刀`}
                    onClick={() => removeCut(i)}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>

          {activeCut && (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="field-label">
                  <span>角度</span>
                  <span className="num">{angle.toFixed(0)}°</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={179}
                  value={Math.round(angle)}
                  onChange={(e) => updateCut(doc.active, setCutAngleDeg(activeCut, Number(e.target.value)), false)}
                  aria-label="当前切口角度"
                />
              </label>
              <label className="block">
                <span className="field-label">
                  <span>位置</span>
                  <span className="num">{offset.toFixed(2)}</span>
                </span>
                <input
                  type="range"
                  min={-1.6}
                  max={1.6}
                  step={0.01}
                  value={Math.max(-1.6, Math.min(1.6, offset))}
                  onChange={(e) => updateCut(doc.active, setCutOffset(activeCut, Number(e.target.value), center), false)}
                  aria-label="当前切口位置"
                />
              </label>
              <div className="flex items-center justify-between">
                <span className="text-[0.7rem] text-[var(--ink-mute)]">
                  保留 {activeCut.keepSide === 1 ? '左' : '右'}侧
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => updateCut(doc.active, { ...activeCut, keepSide: activeCut.keepSide === 1 ? -1 : 1 })}
                >
                  换一侧
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="sheet p-4">
          <p className="eyebrow">Colour</p>
          <div className="mt-3">
            <span className="text-[0.68rem] tracking-[0.08em] text-[var(--ink-mute)]">纸色</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PAPER_COLORS.map((c) => (
                <button
                  key={c}
                  aria-label={`纸色 ${c}`}
                  aria-pressed={doc.paperColor === c}
                  className={`h-7 w-7 rounded-full border transition-transform ${
                    doc.paperColor === c ? 'scale-110 border-[var(--ink)]' : 'border-[rgba(36,39,37,0.15)]'
                  }`}
                  style={{ background: c }}
                  onClick={() => setDoc({ ...doc, paperColor: c })}
                />
              ))}
            </div>
          </div>
          <div className="mt-4">
            <span className="text-[0.68rem] tracking-[0.08em] text-[var(--ink-mute)]">背景</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {BG_COLORS.map((c) => (
                <button
                  key={c}
                  aria-label={`背景色 ${c}`}
                  aria-pressed={doc.bgColor === c}
                  className={`h-7 w-7 rounded-full border transition-transform ${
                    doc.bgColor === c ? 'scale-110 border-[var(--ink)]' : 'border-[rgba(36,39,37,0.15)]'
                  }`}
                  style={{ background: c }}
                  onClick={() => setDoc({ ...doc, bgColor: c })}
                />
              ))}
            </div>
          </div>
          <label className="mt-4 block">
            <span className="field-label">作品标题</span>
            <input
              type="text"
              value={doc.title}
              maxLength={24}
              onChange={(e) => setDoc({ ...doc, title: e.target.value }, false)}
              className="mt-1.5"
            />
          </label>
        </section>

        <section className="sheet p-4">
          <p className="eyebrow">Templates</p>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {TEMPLATES.map((t) => (
              <button key={t.id} className="chip justify-center" onClick={() => applyTemplate(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
          <hr className="hairline my-4" />
          <p className="eyebrow">Export</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn btn-ghost btn-sm" onClick={exportSvg}>
              SVG
            </button>
            <button className="btn btn-ghost btn-sm" onClick={exportPng}>
              PNG 2048
            </button>
            <button className="btn btn-ghost btn-sm" onClick={exportCard}>
              分享卡
            </button>
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              清空重来
            </button>
          </div>
        </section>
      </div>

      {notice && (
        <p role="status" className="mt-4 flex items-start gap-2 text-[0.78rem] leading-relaxed text-[var(--ink-soft)]">
          <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-[var(--red)]" aria-hidden="true" />
          {notice}
        </p>
      )}

      <p className="mt-8 max-w-[74ch] text-[0.74rem] leading-relaxed text-[var(--ink-mute)]">
        关于可实物复现：工坊里的每一条切口都是折包上的真实直线，展开结果由等距变换逆映射得到。
        只要按所选折法折纸、沿预览中的直线各剪一刀，就能得到同样的图案（多刀需要多次下剪）。
        这里不提供「数字对称」图案，因此不存在看起来对称、实际剪不出来的情况。
      </p>
    </div>
  );
}

const foldLabel = (presetId: string) => {
  const preset = getFoldPreset(presetId);
  return preset.folds.length === 0 ? '不折叠' : preset.folds.map((f) => f.label).join(' → ');
};

const safeName = (title: string) => (title.trim() || 'orisnip').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40);
