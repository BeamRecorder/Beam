import { describe, expect, it } from 'vitest';
import {
  clampCompositionPanelPosition,
  compositionPanelLayout,
  DEFAULT_COMPOSITION_POSITION,
  moveCompositionPanel,
  readCompositionPanelPosition,
} from '../composition-panel-position';
import type { CompositionPanelBounds, CompositionPanelLayout } from '../composition-panel-types';

const bounds: CompositionPanelBounds = {
  width: 500,
  height: 400,
  panelWidth: 200,
  headerHeight: 80,
};

describe('readCompositionPanelPosition', () => {
  it('accepts finite normalized positions, including both endpoints', () => {
    expect(readCompositionPanelPosition({ x: 0, y: 1 })).toEqual({ x: 0, y: 1 });
    expect(readCompositionPanelPosition({ x: 0.25, y: 0.75 })).toEqual({ x: 0.25, y: 0.75 });
    expect(readCompositionPanelPosition(DEFAULT_COMPOSITION_POSITION)).toEqual(DEFAULT_COMPOSITION_POSITION);
  });

  it.each([null, undefined, false, 0, '', 'position', [], [0, 1]])('rejects non-object positions: %s', (value) => {
    expect(readCompositionPanelPosition(value)).toBeNull();
  });

  it.each([{}, { x: 0.5 }, { y: 0.5 }])('rejects objects missing a coordinate: %s', (value) => {
    expect(readCompositionPanelPosition(value)).toBeNull();
  });

  it.each([
    { x: '0.5', y: 0.5 },
    { x: 0.5, y: '0.5' },
    { x: Number.NaN, y: 0.5 },
    { x: 0.5, y: Number.NaN },
    { x: Number.POSITIVE_INFINITY, y: 0.5 },
    { x: 0.5, y: Number.NEGATIVE_INFINITY },
    { x: -0.01, y: 0.5 },
    { x: 1.01, y: 0.5 },
    { x: 0.5, y: -0.01 },
    { x: 0.5, y: 1.01 },
  ])('rejects non-finite, non-numeric, and out-of-range coordinates: %s', (value) => {
    expect(readCompositionPanelPosition(value)).toBeNull();
  });
});

describe('compositionPanelLayout', () => {
  it('places the default position at the right top inset and opens the body downward', () => {
    expect(compositionPanelLayout(bounds, DEFAULT_COMPOSITION_POSITION, 100)).toEqual({
      x: 284,
      y: 16,
      travelX: 268,
      travelY: 288,
      upward: false,
      bodyHeight: 288,
    });
  });

  it('places a bottom position within the canvas and opens the body upward when the content cannot fit below', () => {
    expect(compositionPanelLayout(bounds, { x: 0, y: 1 }, 100)).toEqual({
      x: 16,
      y: 304,
      travelX: 268,
      travelY: 288,
      upward: true,
      bodyHeight: 288,
    });
  });

  it('shrinks the inset when the available travel is smaller than the normal inset', () => {
    const narrowBounds: CompositionPanelBounds = {
      width: 218,
      height: 98,
      panelWidth: 200,
      headerHeight: 80,
    };

    expect(compositionPanelLayout(narrowBounds, { x: 1, y: 1 }, 10)).toEqual({
      x: 9,
      y: 9,
      travelX: 0,
      travelY: 0,
      upward: false,
      bodyHeight: 0,
    });
  });

  it('keeps a panel at the origin when the workspace is smaller than its header', () => {
    const tinyBounds: CompositionPanelBounds = {
      width: 120,
      height: 40,
      panelWidth: 200,
      headerHeight: 80,
    };

    expect(compositionPanelLayout(tinyBounds, { x: 0.5, y: 0.5 }, 1)).toEqual({
      x: 0,
      y: 0,
      travelX: 0,
      travelY: 0,
      upward: false,
      bodyHeight: 0,
    });
  });

  it('clamps normalized fractions used for layout at either edge', () => {
    expect(compositionPanelLayout(bounds, { x: -3, y: 4 })).toMatchObject({ x: 16, y: 304 });
  });

  it('keeps the current direction when the content fits below even past the workspace midpoint', () => {
    const layout = compositionPanelLayout(bounds, { x: 0.5, y: 0.6 }, 100);

    expect(layout.y).toBeCloseTo(188.8);
    expect(layout.upward).toBe(false);
    expect(layout.bodyHeight).toBeCloseTo(115.2);
  });

  it('flips only after content no longer fits and the opposite side has more room', () => {
    const downward = compositionPanelLayout(bounds, { x: 0.5, y: 0.9 }, 100);
    const stableUpward = compositionPanelLayout(bounds, { x: 0.5, y: 0.1 }, 20, true);
    const samePositionDownward = compositionPanelLayout(bounds, { x: 0.5, y: 0.7 }, 80, false);
    const samePositionUpward = compositionPanelLayout(bounds, { x: 0.5, y: 0.7 }, 80, true);

    expect(downward.upward).toBe(true);
    expect(downward.bodyHeight).toBeCloseTo(259.2);
    expect(stableUpward.upward).toBe(true);
    expect(stableUpward.bodyHeight).toBeCloseTo(28.8);
    expect(samePositionUpward).toMatchObject({ x: samePositionDownward.x, y: samePositionDownward.y });
    expect(samePositionUpward.upward).not.toBe(samePositionDownward.upward);
  });

  it('chooses the side with more room when neither side can fit the content', () => {
    const layout = compositionPanelLayout(bounds, { x: 0.5, y: 0.7 }, 400);

    expect(layout.upward).toBe(true);
    expect(layout.bodyHeight).toBeCloseTo(201.6);
  });

  it('keeps either preferred direction inside the 8px midpoint dead zone', () => {
    const downward = compositionPanelLayout(bounds, { x: 0.5, y: 0.51 }, 400, false);
    const upward = compositionPanelLayout(bounds, { x: 0.5, y: 0.51 }, 400, true);
    const beyondDeadZone = compositionPanelLayout(bounds, { x: 0.5, y: 0.52 }, 400, false);

    expect(downward.upward).toBe(false);
    expect(upward.upward).toBe(true);
    expect(upward).toMatchObject({ x: downward.x, y: downward.y });
    expect(beyondDeadZone.upward).toBe(true);
  });
});

describe('moveCompositionPanel', () => {
  const layout: CompositionPanelLayout = compositionPanelLayout(bounds, { x: 0.5, y: 0.5 });

  it('converts pointer deltas into normalized workspace fractions', () => {
    expect(moveCompositionPanel({ x: 0.5, y: 0.5 }, layout, 67, -72)).toEqual({ x: 0.75, y: 0.25 });
  });

  it('clamps a drag that crosses every parent-canvas edge', () => {
    expect(moveCompositionPanel({ x: 0.5, y: 0.5 }, layout, -10_000, 10_000)).toEqual({ x: 0, y: 1 });
  });

  it('preserves a normalized coordinate when that axis has no available travel', () => {
    const noTravel: CompositionPanelLayout = {
      x: 0,
      y: 0,
      travelX: 0,
      travelY: 0,
      upward: false,
      bodyHeight: 0,
    };

    expect(moveCompositionPanel({ x: 0.35, y: 0.65 }, noTravel, 90, -90)).toEqual({ x: 0.35, y: 0.65 });
  });
});

describe('clampCompositionPanelPosition', () => {
  it('keeps an open downward panel and its body inside the canvas', () => {
    const position = clampCompositionPanelPosition(bounds, { x: 2, y: 1 }, 100, false);

    expect(position).toEqual({ x: 1, y: 1 - 100 / 288 });
    const layout = compositionPanelLayout(bounds, position);
    expect(layout.y + bounds.headerHeight + 100).toBeLessThanOrEqual(bounds.height - 16);
  });

  it('keeps an open upward panel and its body inside the canvas', () => {
    const position = clampCompositionPanelPosition(bounds, { x: -2, y: 0 }, 100, true);

    expect(position).toEqual({ x: 0, y: 100 / 288 });
    const layout = compositionPanelLayout(bounds, position);
    expect(layout.y - 100).toBeGreaterThanOrEqual(16);
  });

  it('lets a collapsed header use the full normalized vertical range', () => {
    expect(clampCompositionPanelPosition(bounds, { x: 0.5, y: 1 }, 0, false)).toEqual({ x: 0.5, y: 1 });
    expect(clampCompositionPanelPosition(bounds, { x: 0.5, y: 0 }, 0, true)).toEqual({ x: 0.5, y: 0 });
  });

  it('bounds a body taller than available travel to the only valid anchor', () => {
    expect(clampCompositionPanelPosition(bounds, { x: 0.5, y: 0.5 }, 1_000, false)).toEqual({
      x: 0.5,
      y: 0,
    });
    expect(clampCompositionPanelPosition(bounds, { x: 0.5, y: 0.5 }, 1_000, true)).toEqual({
      x: 0.5,
      y: 1,
    });
  });
});
