import { describe, expect, it } from 'vitest';
import { buildArtworkSvg } from './artwork';
import { applyCut } from '@/geometry/cuts';
import { unfold } from '@/geometry/unfold';
import { getLevel } from '@/game/levels';

const level = getLevel('l3')!;
const artwork = unfold(applyCut(level.packet, level.solution).paper).region;

describe('SVG export', () => {
  it('emits a standalone, self-contained document', () => {
    const svg = buildArtworkSvg(artwork, { paperColor: '#B93645', background: '#F8F3E9' });
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox=');
    // The only URL allowed is the SVG namespace declaration itself.
    const urls = svg.match(/https?:\/\/[^"\s]+/g) ?? [];
    expect(urls).toEqual(['http://www.w3.org/2000/svg']);
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('href=');
  });

  it('expresses holes with an evenodd fill rule and two rings', () => {
    const svg = buildArtworkSvg(artwork, { paperColor: '#B93645' });
    expect(svg).toContain('fill-rule="evenodd"');
    // One outer ring plus one hole ring => two subpaths in the same path data.
    const d = /d="([^"]+)"/.exec(svg)?.[1] ?? '';
    const subpaths = (d.match(/M/g) ?? []).length;
    expect(subpaths).toBe(2);
    expect(d).toContain('Z');
  });

  it('omits the background rect when transparency is requested', () => {
    const transparent = buildArtworkSvg(artwork, { background: null });
    expect(transparent).not.toContain('<rect');
    const opaque = buildArtworkSvg(artwork, { background: '#FFFFFF' });
    expect(opaque).toContain('<rect');
  });

  it('escapes the title so it cannot break the markup', () => {
    const svg = buildArtworkSvg(artwork, { title: '<script>alert(1)</script>' });
    expect(svg).not.toContain('<script>alert');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('scales through width/height without touching the geometry', () => {
    const small = buildArtworkSvg(artwork, { size: 256 });
    const large = buildArtworkSvg(artwork, { size: 4096 });
    expect(small).toContain('width="256"');
    expect(large).toContain('width="4096"');
    const viewSmall = /viewBox="([^"]+)"/.exec(small)?.[1];
    const viewLarge = /viewBox="([^"]+)"/.exec(large)?.[1];
    expect(viewSmall).toBe(viewLarge);
  });

  it('rounds coordinates to a sane precision', () => {
    const svg = buildArtworkSvg(artwork, {});
    const d = /d="([^"]+)"/.exec(svg)?.[1] ?? '';
    const numbers = d.match(/-?\d+\.?\d*/g) ?? [];
    for (const n of numbers) {
      const decimals = n.split('.')[1]?.length ?? 0;
      expect(decimals).toBeLessThanOrEqual(4);
    }
  });
});
