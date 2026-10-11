import { describe, expect, it } from 'vitest';
import { snapDisplayedLayerTranslation } from '../layer-alignment';

const viewport = { dx: 100, dy: 50, dw: 800, dh: 400, scale: 1 };

describe('displayed layer alignment', () => {
  it('normalizes visible bounds in the output viewport and returns a pixel delta', () => {
    const result = snapDisplayedLayerTranslation([{ left: 420, top: 171, width: 160, height: 160 }], [], viewport);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(-1);
    expect(result.guides).toContainEqual({ type: 'vertical', position: 0.5 });
    expect(result.guides).toContainEqual({ type: 'horizontal', position: 0.5 });
  });

  it('snaps a union against another displayed layer', () => {
    const result = snapDisplayedLayerTranslation(
      [
        { left: 220, top: 100, width: 80, height: 80 },
        { left: 380, top: 180, width: 78, height: 80 },
      ],
      [{ left: 460, top: 300, width: 100, height: 80 }],
      viewport,
    );
    expect(result.x).toBeCloseTo(2);
    expect(result.guides).toContainEqual({ type: 'vertical', position: 0.45 });
  });

  it('does not move layers when their bounds are outside snap tolerance', () => {
    const result = snapDisplayedLayerTranslation([{ left: 280, top: 140, width: 88, height: 64 }], [], viewport);
    expect(result).toEqual({ x: 0, y: 0, guides: [] });
  });

  it.each([null, { ...viewport, dw: 0 }, { ...viewport, dh: 0 }])(
    'does not snap without a valid viewport',
    (bounds) => {
      expect(snapDisplayedLayerTranslation([{ left: 0, top: 0, width: 100, height: 100 }], [], bounds)).toEqual({
        x: 0,
        y: 0,
        guides: [],
      });
    },
  );

  it('does not snap an empty selection', () => {
    expect(snapDisplayedLayerTranslation([], [], viewport)).toEqual({ x: 0, y: 0, guides: [] });
  });
});
