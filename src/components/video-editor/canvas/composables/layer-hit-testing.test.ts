import { describe, expect, it } from 'vitest';
import type { ShapeClip, VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '~/media/shared/shape-layer-style';
import { topmostClipIdAtPoint } from './layer-hit-testing';

const makeShape = (rotation = 0): ShapeClip => ({
  ...DEFAULT_ANNOTATION_SHAPE_STYLE,
  id: 'shape',
  kind: 'shape',
  assetId: '',
  name: 'shape',
  enabled: true,
  order: 0,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  trackId: 'shape',
  rotation,
  transform: { x: 0, y: 0, width: 1, height: 1 },
});

const makeScreen = (): VisualClip => ({
  id: 'screen',
  kind: 'screen',
  assetId: 'screen-asset',
  name: 'Screen',
  enabled: true,
  order: 0,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
});

describe('topmostClipIdAtPoint', () => {
  it('hit-tests a rotated shape in its rotated bounds', () => {
    const shape = makeShape(90);
    const layoutFor = () => ({ left: 0, top: 0, width: 100, height: 40 });

    // This point is below the unrotated rectangle but inside the 90°-rotated one.
    expect(topmostClipIdAtPoint([shape], { x: 50, y: 60 }, layoutFor)).toBe('shape');
    expect(topmostClipIdAtPoint([shape], { x: 10, y: 20 }, layoutFor)).toBeNull();
  });

  it('keeps the screen out of normal raycasts but includes it for explicit crop hit-tests', () => {
    const screen = makeScreen();
    const layoutFor = () => ({ left: 0, top: 0, width: 100, height: 40 });
    const point = { x: 50, y: 20 };

    expect(topmostClipIdAtPoint([screen], point, layoutFor)).toBeNull();
    expect(topmostClipIdAtPoint([screen], point, layoutFor, true)).toBe('screen');
  });
});
