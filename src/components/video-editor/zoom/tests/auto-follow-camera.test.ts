import { describe, expect, it } from 'vitest';
import { createAutoFollowState, updateAutoFollowTarget } from '../auto-follow-camera';
import type { ZoomAutoFollowSettings } from '../zoom-types';

const settings: ZoomAutoFollowSettings = {
  safeZone: 0.5,
  responsiveness: 0.55,
  directionLock: true,
};

const center = { cx: 0.5, cy: 0.5 };

describe('auto-follow camera', () => {
  it('keeps both camera axes fixed while the cursor is inside the safe zone', () => {
    const state = createAutoFollowState(settings);
    const initial = updateAutoFollowTarget(state, center, center, 2, 1, 0);

    expect(updateAutoFollowTarget(state, { cx: 0.6, cy: 0.4 }, center, 2, 1, 16)).toEqual(initial);
  });

  it.each([
    ['x', { cx: 0.9, cy: 0.5 }, true, false],
    ['y', { cx: 0.5, cy: 0.9 }, false, true],
    ['diagonal', { cx: 0.9, cy: 0.9 }, true, true],
  ] as const)('corrects only axes outside the safe zone for a %s excursion', (_axis, cursor, movesX, movesY) => {
    const state = createAutoFollowState(settings);
    updateAutoFollowTarget(state, center, center, 2, 1, 0);
    const result = updateAutoFollowTarget(state, cursor, center, 2, 1, 64);

    expect(result.cx > 0.5).toBe(movesX);
    expect(result.cy > 0.5).toBe(movesY);
    if (!movesX) expect(result.cx).toBe(0.5);
    if (!movesY) expect(result.cy).toBe(0.5);
  });

  it('keeps a locked travel direction until the first target settles, then retargets', () => {
    const state = createAutoFollowState(settings);
    updateAutoFollowTarget(state, center, center, 2, 1, 0);

    const firstTarget = updateAutoFollowTarget(state, { cx: 0.9, cy: 0.5 }, center, 2, 1, 64);
    const retargeted = updateAutoFollowTarget(state, { cx: 0.5, cy: 0.9 }, center, 2, 1, 80);

    expect(firstTarget.cx).toBeGreaterThan(0.5);
    expect(retargeted.cx).toBeGreaterThanOrEqual(firstTarget.cx);
    expect(retargeted.cy).toBe(firstTarget.cy);

    const settled = updateAutoFollowTarget(state, { cx: 0.5, cy: 0.9 }, center, 2, 1, 2_000);
    expect(settled.cy).toBeGreaterThan(firstTarget.cy);
  });

  it('resets deterministically after a backward seek', () => {
    const state = createAutoFollowState(settings);
    updateAutoFollowTarget(state, { cx: 0.9, cy: 0.5 }, center, 2, 1, 2_000);

    expect(updateAutoFollowTarget(state, { cx: 0.5, cy: 0.5 }, center, 2, 1, 1_000)).toEqual(center);
  });

  it('does not follow when the zoom strength is inactive', () => {
    const state = createAutoFollowState(settings);

    expect(updateAutoFollowTarget(state, { cx: 0.9, cy: 0.9 }, center, 2, 0, 0)).toEqual({ cx: 0.5, cy: 0.5 });
  });
});
