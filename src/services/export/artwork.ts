import type { MultiPolygon } from '@/geometry/types';
import { regionToPath } from '@/components/paper/path';

/**
 * Export pipeline.
 *
 * The exported SVG contains the *same* path data the screen renders: real
 * vector contours with interior rings, `fill-rule="evenodd"`, no embedded
 * bitmaps, no external references. It opens correctly in Illustrator, Inkscape
 * and Figma.
 */

export interface ArtworkOptions {
  /** Output size in px for PNG / share card. SVG uses a viewBox. */
  size?: number;
  paperColor?: string;
  /** `null` for a transparent background. */
  background?: string | null;
  /** Padding around the artwork, as a fraction of the sheet. */
  padding?: number;
  title?: string;
}

const SHEET = 2;

export function buildArtworkSvg(region: MultiPolygon, options: ArtworkOptions = {}): string {
  const {
    size = 1024,
    paperColor = '#B93645',
    background = null,
    padding = 0.08,
    title = '一刀万象 · Orisnip',
  } = options;

  const pad = SHEET * padding;
  const box = SHEET + pad * 2;
  const path = regionToPath(region);
  const bg = background
    ? `<rect x="${-1 - pad}" y="${-1 - pad}" width="${box}" height="${box}" fill="${background}"/>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-1 - pad} ${-1 - pad} ${box} ${box}" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
  ${bg}
  <path d="${path}" fill-rule="evenodd" fill="${paperColor}"/>
</svg>`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] as string,
  );
}

/** Trigger a browser download for a text file. */
export function downloadText(filename: string, text: string, mime = 'image/svg+xml'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Rasterise an SVG string to a PNG blob at the requested pixel size. */
export async function svgToPngBlob(svg: string, size: number): Promise<Blob | null> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法渲染图像'));
    img.src = src;
  });
}

export async function downloadPng(
  region: MultiPolygon,
  filename: string,
  options: ArtworkOptions = {},
): Promise<void> {
  const size = options.size ?? 2048;
  const svg = buildArtworkSvg(region, { ...options, size });
  const blob = await svgToPngBlob(svg, size);
  if (!blob) throw new Error('PNG 导出失败');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** A PNG blob for sharing / the作品分享卡片. */
export async function renderShareCard(
  region: MultiPolygon,
  options: { title: string; subtitle?: string; paperColor: string; background: string },
): Promise<Blob | null> {
  const W = 1200;
  const H = 1500;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, W, H);

  // Artwork
  const svg = buildArtworkSvg(region, {
    size: 900,
    paperColor: options.paperColor,
    background: null,
    padding: 0.06,
    title: options.title,
  });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await loadImage(url);
    const artSize = 880;
    ctx.drawImage(img, (W - artSize) / 2, 210, artSize, artSize);
  } finally {
    URL.revokeObjectURL(url);
  }

  // Hairline + typography
  ctx.strokeStyle = 'rgba(36,39,37,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(150, 1160);
  ctx.lineTo(W - 150, 1160);
  ctx.stroke();

  ctx.fillStyle = '#242725';
  ctx.textAlign = 'left';
  ctx.font = '500 54px "Songti SC", "STSong", serif';
  ctx.fillText(options.title.slice(0, 18), 150, 1240);

  ctx.fillStyle = 'rgba(36,39,37,0.62)';
  ctx.font = '400 26px "PingFang SC", system-ui, sans-serif';
  ctx.fillText(options.subtitle ?? '一刀万象 · 计算纸艺', 150, 1290);

  ctx.fillStyle = '#B93645';
  ctx.font = '600 24px "Songti SC", "STSong", serif';
  ctx.textAlign = 'right';
  ctx.fillText('一刀万象', W - 150, 1240);
  ctx.fillStyle = 'rgba(36,39,37,0.5)';
  ctx.font = '400 18px "PingFang SC", system-ui, sans-serif';
  ctx.fillText('ORISNIP', W - 150, 1276);

  return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export async function downloadShareCard(
  region: MultiPolygon,
  filename: string,
  options: { title: string; subtitle?: string; paperColor: string; background: string },
): Promise<void> {
  const blob = await renderShareCard(region, options);
  if (!blob) throw new Error('分享卡生成失败');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
