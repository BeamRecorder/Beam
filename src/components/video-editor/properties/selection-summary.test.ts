import { describe, expect, it } from 'vitest';
import { fitSelectionNameCount, tooltipSelectionItems } from './selection-summary';

describe('selection summary geometry', () => {
  it('returns zero visible names for an empty selection', () => {
    expect(fitSelectionNameCount([], 200, 8, 30)).toBe(0);
  });

  it('keeps every name when the complete list fits', () => {
    expect(fitSelectionNameCount([42, 48, 36], 142, 8, 30)).toBe(3);
  });

  it('leaves room for the overflow badge when names do not fit', () => {
    expect(fitSelectionNameCount([58, 58, 58], 140, 8, 30)).toBe(1);
  });
});

describe('selection summary tooltip items', () => {
  it('caps the tooltip list at ten names and reports the remainder', () => {
    const names = Array.from({ length: 12 }, (_, index) => `Track ${index + 1}`);

    expect(tooltipSelectionItems(names)).toEqual({
      visible: names.slice(0, 10),
      remaining: 2,
    });
  });
});
