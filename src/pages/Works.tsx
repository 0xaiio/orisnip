import { useMemo, useState } from 'react';
import { navigate } from '@/app/router';
import { PaperCanvas } from '@/components/paper/PaperCanvas';
import { applyCut } from '@/geometry/cuts';
import { buildPacket } from '@/geometry/folds';
import { unfold } from '@/geometry/unfold';
import type { MultiPolygon } from '@/geometry/types';
import { deleteWork, loadWorks, type Work } from '@/services/storage/works';
import { downloadPng, downloadText, buildArtworkSvg } from '@/services/export/artwork';

function regionOf(work: Work): MultiPolygon {
  let paper = buildPacket(work.presetId);
  for (const cut of work.cuts) paper = applyCut(paper, cut).paper;
  return unfold(paper).region;
}

const fmt = (ts: number) =>
  new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export function Works() {
  const [store, setStore] = useState(() => loadWorks());
  const [notice, setNotice] = useState<string | null>(null);

  const items = useMemo(
    () => store.works.map((w) => ({ work: w, region: regionOf(w) })).sort((a, b) => b.work.updatedAt - a.work.updatedAt),
    [store],
  );

  const remove = (id: string) => {
    setStore(deleteWork(id));
    setNotice('已删除。这个动作不可撤销。');
  };

  const exportSvg = (work: Work, region: MultiPolygon) => {
    downloadText(
      `${work.title || 'orisnip'}.svg`,
      buildArtworkSvg(region, { paperColor: work.paperColor, background: work.bgColor, title: work.title }),
    );
  };

  const exportPng = async (work: Work, region: MultiPolygon) => {
    try {
      await downloadPng(region, `${work.title || 'orisnip'}.png`, {
        size: 2048,
        paperColor: work.paperColor,
        background: work.bgColor,
      });
    } catch {
      setNotice('PNG 导出失败，请重试。');
    }
  };

  return (
    <div className="shell py-10 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">My Works</p>
          <h1 className="display-1 mt-3">我的作品</h1>
          <p className="lede mt-3 max-w-[52ch]">
            保存在这台设备浏览器里的创作。每条记录只有几百字节——存的是参数，不是图片，所以随时可以重新导出任意尺寸。
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => navigate({ name: 'studio' })}>
          去工坊做一张
        </button>
      </header>

      {items.length === 0 ? (
        <div className="mt-14 flex flex-col items-center justify-center rounded-[4px] border border-dashed border-[var(--line)] py-20 text-center">
          <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true" className="opacity-60">
            <path d="M32 6 L58 32 L32 58 L6 32 Z" fill="none" stroke="var(--gold)" strokeWidth="1.4" />
            <path d="M32 20 L44 32 L32 44 L20 32 Z" fill="none" stroke="var(--line)" strokeWidth="1.4" />
          </svg>
          <p className="mt-5 font-display text-[1.05rem] tracking-[0.06em]">还没有作品</p>
          <p className="mt-1.5 max-w-[34ch] text-[0.8rem] leading-relaxed text-[var(--ink-mute)]">
            去剪纸工坊选一个折法，剪一两刀，然后按「保存作品」。它会出现在这里。
          </p>
          <button className="btn btn-ghost btn-sm mt-6" onClick={() => navigate({ name: 'studio' })}>
            打开剪纸工坊
          </button>
        </div>
      ) : (
        <ul className="mt-9 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ work, region }) => (
            <li key={work.id} className="group">
              <div className="sheet overflow-hidden">
                <div className="p-3" style={{ background: work.bgColor }}>
                  <div className="aspect-square w-full">
                    <PaperCanvas paper={buildPacket(work.presetId)} mode="flat" region={region} fill={work.paperColor} label={`${work.title} 的图案`} />
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="truncate font-display text-[1rem] tracking-[0.04em]">{work.title || '未命名作品'}</h2>
                    <span className="num shrink-0 text-[0.62rem] text-[var(--ink-mute)]">{fmt(work.updatedAt)}</span>
                  </div>
                  <p className="mt-1 text-[0.7rem] text-[var(--ink-mute)]">
                    {work.presetId === 'none' ? '不折叠' : `${work.presetId === 'fold-diag' ? '对角对折' : '中线折叠'}`} ·{' '}
                    {work.cuts.length} 条切口
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        window.location.hash = `#/studio?work=${work.id}`;
                        navigate({ name: 'studio' });
                      }}
                    >
                      继续编辑
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => exportSvg(work, region)}>
                      SVG
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => exportPng(work, region)}>
                      PNG
                    </button>
                    <button
                      className="btn btn-ghost btn-sm ml-auto text-[var(--ink-mute)]"
                      onClick={() => remove(work.id)}
                      aria-label={`删除 ${work.title}`}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {notice && (
        <p role="status" className="mt-5 text-[0.78rem] text-[var(--ink-soft)]">
          {notice}
        </p>
      )}

      <p className="mt-10 max-w-[62ch] text-[0.74rem] leading-relaxed text-[var(--ink-mute)]">
        作品只保存在当前浏览器的 localStorage 中，不会上传到任何服务器。清除站点数据会一并删除它们。
        「继续编辑」会把保存的折法、切口与配色重新载入工坊——存的是参数，所以载入后的一切仍然可编辑。
      </p>
    </div>
  );
}
