import { describe, expect, it } from 'vitest';
import { LOCAL_PRESETS, designToCuts, matchLocalPreset, parseDesign, MAX_CUTS } from './schema';
import { buildPacket } from '@/geometry/folds';
import { validateCut } from '@/geometry/cuts';

const valid = {
  title: '月满中庭',
  description: '一句话描述',
  fold: 'fold-xy',
  palette: { paper: '#B93645', background: '#F8F3E9' },
  cuts: [
    { corner: 'inner', size: 0.45, angle: 0, flip: false },
    { corner: 'outer', size: 0.3, angle: 10, flip: true },
  ],
  note: '把月亮抽象为中心孔洞',
};

describe('AI design schema', () => {
  it('accepts a well formed design', () => {
    const result = parseDesign(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.design.title).toBe('月满中庭');
      expect(result.design.cuts).toHaveLength(2);
    }
  });

  it('rejects an unknown fold plan', () => {
    const result = parseDesign({ ...valid, fold: 'fold-360' });
    expect(result.ok).toBe(false);
  });

  it('rejects more cuts than the engine will accept', () => {
    const cuts = Array.from({ length: MAX_CUTS + 1 }, () => ({ corner: 'inner', size: 0.3, angle: 0, flip: false }));
    const result = parseDesign({ ...valid, cuts });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('切口过多');
  });

  it('rejects a malformed palette', () => {
    expect(parseDesign({ ...valid, palette: { paper: 'red', background: '#fff' } }).ok).toBe(false);
    expect(parseDesign({ ...valid, palette: undefined }).ok).toBe(false);
  });

  it('rejects a non-object and missing fields', () => {
    expect(parseDesign(null).ok).toBe(false);
    expect(parseDesign('{json}').ok).toBe(false);
    expect(parseDesign({ ...valid, title: '' }).ok).toBe(false);
    expect(parseDesign({ ...valid, note: undefined }).ok).toBe(false);
  });

  it('rejects an impossible size but clamps an extreme angle', () => {
    // A size of 9 is not a rounding problem, it is a broken answer: reject it.
    expect(parseDesign({ ...valid, cuts: [{ corner: 'inner', size: 9, angle: 0, flip: false }] }).ok).toBe(false);
    expect(parseDesign({ ...valid, cuts: [{ corner: 'inner', size: 0, angle: 0, flip: false }] }).ok).toBe(false);

    // Angle is a free parameter with a safe range, so clamping is honest here.
    const result = parseDesign({ ...valid, cuts: [{ corner: 'inner', size: 0.4, angle: 900, flip: false }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.design.cuts[0].angle).toBe(40);
      expect(result.design.cuts[0].size).toBeCloseTo(0.4, 6);
    }
  });

  it('turns every local preset into cuts the engine accepts', () => {
    for (const preset of LOCAL_PRESETS) {
      const packet = buildPacket(preset.fold);
      for (const cut of designToCuts(preset)) {
        const verdict = validateCut(packet, cut);
        expect(verdict.ok, `${preset.title}: ${verdict.message}`).toBe(true);
      }
    }
  });

  it('matches Chinese keywords to a sensible local preset', () => {
    expect(matchLocalPreset('中秋的月亮和花').title).toContain('月');
    expect(matchLocalPreset('蓝白色的雪花').title).toContain('雪');
    expect(matchLocalPreset('随便什么').title.length).toBeGreaterThan(0);
  });

  it('never returns a cut outside the packet for any fold plan', () => {
    for (const preset of LOCAL_PRESETS) {
      const packet = buildPacket(preset.fold);
      for (const cut of designToCuts(preset)) {
        const verdict = validateCut(packet, cut);
        expect(verdict.ok, `${preset.title} on ${preset.fold}`).toBe(true);
      }
    }
  });
});
