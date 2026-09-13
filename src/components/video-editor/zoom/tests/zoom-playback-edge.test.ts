import { describe, expect, it } from 'vitest';
import { regionStrength, zoomAtTime } from '../zoom-playback';
import type { ZoomElement } from '../zoom-types';

const baseZoom: ZoomElement = {
  id: 'zoom',
  sessionId: 'session',
  startMs: 2_000,
  endMs: 6_000,
  focus: { cx: 0.4, cy: 0.5 },
  depth: 2,
  mode: 'manual',
};

describe('zoom playback edge cases', () => {
  it('shortens overlapping zoom-in and zoom-out curves to their shared midpoint', () => {
    const shortZoom = { ...baseZoom, startMs: 1_000, endMs: 1_100 };

    expect(regionStrength(shortZoom, 0)).toBe(0);
    expect(regionStrength(shortZoom, 1_000)).toBeGreaterThan(0);
    expect(regionStrength(shortZoom, 1_000)).toBeLessThan(1);
    expect(regionStrength(shortZoom, 1_500)).toBe(1);
    expect(regionStrength(shortZoom, 3_000)).toBe(0);
  });

  it('selects the later zoom when overlapping regions have equal strength', () => {
    const earlier = { ...baseZoom, id: 'earlier', startMs: 0, endMs: 8_000, focus: { cx: 0.4, cy: 0.4 } };
    const later = { ...baseZoom, id: 'later', startMs: 1_000, endMs: 8_000, focus: { cx: 0.65, cy: 0.6 } };

    expect(regionStrength(earlier, 4_000)).toBe(1);
    expect(regionStrength(later, 4_000)).toBe(1);
    expect(zoomAtTime([earlier, later], 4_000)?.focus).toEqual(later.focus);
  });

  it('falls back from an unresolved prior connection to the selected zoom’s connected pan', () => {
    const first = { ...baseZoom, id: 'first', startMs: 0, endMs: 10_000 };
    const current: ZoomElement = { ...baseZoom, id: 'current', startMs: 9_500, endMs: 10_500, depth: 3 };
    const next: ZoomElement = {
      ...baseZoom,
      id: 'next',
      startMs: 11_800,
      endMs: 15_000,
      depth: 4,
      focus: { cx: 0.7, cy: 0.5 },
    };
    const manualResult = zoomAtTime([first, current, next], 11_000);
    const autoResult = zoomAtTime([first, current, { ...next, mode: 'auto' }], 11_000);

    expect(manualResult?.mode).toBe('manual');
    expect(manualResult?.strength).toBeGreaterThan(0);
    expect(manualResult?.scale).toBeCloseTo(2.0628, 3);
    expect(manualResult?.focus.cx).toBeCloseTo(0.5971, 4);
    expect(autoResult?.mode).toBe('auto');
    expect(autoResult?.scale).toBeCloseTo(manualResult!.scale, 12);
  });
});
