import { describe, expect, it } from 'vitest';
import { applyZoomTrackProperties } from '../zoom-track-properties';
import { createManualZoom } from '../manual-zoom';
import { createGlassHighlight } from '../glass-highlight';

const zooms = () =>
  [0, 1, 2].map((i) => ({
    ...createManualZoom(`zoom-${i}`, i * 2000, i * 2000 + 1000),
    id: `zoom-${i}`,
    sessionId: `session-${i}`,
    focus: { cx: 0.2 + i * 0.2, cy: 0.3 },
    linkedClipId: `clip-${i}`,
    splitGroupId: `split-${i}`,
  }));
describe('shared zoom track appearance', () => {
  it('shares magnification and camera styling while keeping targets, timing and recording provenance', () => {
    const before = zooms();
    Object.assign(before[0]!, { depth: 5, projection: '3d', tiltIntensity: 0.9, tiltPreset: 'large' });
    const after = applyZoomTrackProperties(before, 'zoom-0');
    expect(after[1]).toMatchObject({
      ...before[1],
      depth: 5,
      projection: '3d',
      tiltIntensity: 0.9,
      tiltPreset: 'large',
    });
    expect(after[2]!.focus).toBe(before[2]!.focus);
    expect(after[2]!.startMs).toBe(4000);
    expect(before[1]!.depth).not.toBe(5);
    expect(after[0]).toBe(before[0]);
  });
  it('never changes locked zooms or applies settings from a locked source', () => {
    const before = zooms();
    before[0]!.depth = 5;
    before[1]!.locked = true;
    const next = applyZoomTrackProperties(before, 'zoom-0');
    expect(next[1]).toBe(before[1]);
    expect(next[2]!.depth).toBe(5);
    before[0]!.locked = true;
    expect(applyZoomTrackProperties(before, 'zoom-0')).toBe(before);
  });
  it('shares lens settings at each zoom’s own focus and safely constrains lens centers', () => {
    const before = zooms();
    Object.assign(before[0]!, { effect: 'glass', glass: createGlassHighlight(), mode: 'manual' });
    before[2]!.focus = { cx: 1.2, cy: -0.2 };
    const next = applyZoomTrackProperties(before, 'zoom-0');
    expect(next[1]!.focus).toEqual(before[1]!.focus);
    expect(next[1]!.glass).toEqual(before[0]!.glass);
    expect(next[2]!.focus).toEqual({ cx: 1, cy: 0 });
  });
  it('clears optional styling when the source resets it without enabling disabled zooms', () => {
    const before = zooms();
    delete before[0]!.effect;
    Object.assign(before[1]!, { effect: 'glass', glass: createGlassHighlight(), enabled: false });
    const next = applyZoomTrackProperties(before, 'zoom-0');
    expect(next[1]!.effect).toBeUndefined();
    expect(next[1]!.glass).toBeUndefined();
    expect(next[1]!.enabled).toBe(false);
    expect(applyZoomTrackProperties(next, 'zoom-0')).toBe(next);
  });
  it('ignores unknown sources and rejects invalid propagation atomically', () => {
    const before = zooms();
    expect(applyZoomTrackProperties(before, 'missing')).toBe(before);
    Object.assign(before[0]!, { depth: 99 });
    expect(() => applyZoomTrackProperties(before, 'zoom-0')).toThrow();
    expect(before[1]!.depth).not.toBe(99);
  });
});
