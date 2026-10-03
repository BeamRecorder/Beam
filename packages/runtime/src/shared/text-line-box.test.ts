import { describe, expect, it } from 'vitest';
import { lineBoxBaselineOffset } from './text-line-box';

describe('lineBoxBaselineOffset', () => {
  it('moves the baseline down when more of the font box lies above it', () => {
    expect(lineBoxBaselineOffset({ fontBoundingBoxAscent: 32, fontBoundingBoxDescent: 24 })).toBe(4);
  });
  it('moves it up for a font box with a larger descent', () => {
    expect(lineBoxBaselineOffset({ fontBoundingBoxAscent: 15.5, fontBoundingBoxDescent: 24 })).toBe(-4.25);
  });
  it('keeps an already centered font box unchanged, including an empty box', () => {
    expect(lineBoxBaselineOffset({ fontBoundingBoxAscent: 24, fontBoundingBoxDescent: 24 })).toBe(0);
    expect(lineBoxBaselineOffset({ fontBoundingBoxAscent: 0, fontBoundingBoxDescent: 0 })).toBe(0);
  });
});
