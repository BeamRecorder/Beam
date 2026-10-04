import { describe, expect, it } from 'vitest';
import { buildAutomaticGlassElements, isAutomaticZoom } from './glass-generation';
import { createManualZoom } from './manual-zoom';
import { ZOOM_DEPTH_SCALES } from './zoom-types';
import type { GlassGenerationInputs } from './glass-generation-types';
const click = (
  timeMs: number,
  cx = 0.5,
  cy = 0.5,
  interactionType: GlassGenerationInputs['telemetry'][number]['interactionType'] = 'click',
): GlassGenerationInputs['telemetry'][number] => ({ timeMs, cx, cy, interactionType });
const inputs = (telemetry: GlassGenerationInputs['telemetry']): GlassGenerationInputs => ({
  telemetry,
  sessionId: 'test',
  durationMs: 10000,
  width: 1920,
  height: 1080,
  reserved: [],
});
describe('automatic glass suggestions', () => {
  it('produces deterministic manual-editable lenses over real clicks, with readable defaults', () => {
    const data = inputs([click(2000)]),
      result = buildAutomaticGlassElements(data);
    expect(result).toEqual(buildAutomaticGlassElements(data));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      mode: 'manual',
      generation: 'automatic',
      effect: 'glass',
      focus: { cx: 0.5, cy: 0.5 },
      depth: 4,
    });
    expect(result[0]!.glass!.size).toBe(0.6);
    expect(result[0]!.endMs - result[0]!.startMs).toBe(1600);
    expect(isAutomaticZoom(result[0]!)).toBe(true);
    expect(isAutomaticZoom(createManualZoom('manual', 0, 1000))).toBe(false);
    expect(isAutomaticZoom({ ...createManualZoom('old', 0, 1000), mode: 'auto' })).toBe(true);
  });
  it('clusters nearby clicks, weights double-clicks and scales diameter/depth together to preserve context', () => {
    const result = buildAutomaticGlassElements(inputs([click(2000, 0.4, 0.5), click(2300, 0.5, 0.5, 'double-click')]));
    expect(result).toHaveLength(1);
    const lens = result[0]!;
    expect(lens.focus.cx).toBeCloseTo((0.4 + 0.5 * 2) / 3);
    const radius = (lens.glass!.size * 1080) / 2 / ZOOM_DEPTH_SCALES[lens.depth];
    expect(radius).toBeGreaterThan(Math.abs(0.4 - lens.focus.cx) * 1920 + 0.1 * 1080 - 0.001);
    expect(lens.glass!.size).toBeLessThanOrEqual(0.85);
  });
  it('separates distant areas, long sequences and temporal gaps without overlapping suggestions', () => {
    for (const samples of [
      [click(2000, 0.2), click(2500, 0.8)],
      [click(2000), click(4000)],
      Array.from({ length: 6 }, (_, i) => click(1000 + i * 1000)),
    ]) {
      const result = buildAutomaticGlassElements(inputs(samples));
      expect(result.length).toBeGreaterThan(1);
      for (let i = 1; i < result.length; i++) expect(result[i]!.startMs).toBeGreaterThanOrEqual(result[i - 1]!.endMs);
      expect(result.every((zoom) => zoom.endMs - zoom.startMs <= 4600)).toBe(true);
    }
  });
  it('skips irrelevant, invalid, cropped-out and reserved interactions and bounds fades in short recordings', () => {
    for (const data of [
      inputs([]),
      inputs([click(1000, 0.5, 0.5, 'move')]),
      inputs([click(-1), click(10001), click(1000, -1), click(1000, 0.5, NaN)]),
      { ...inputs([click(1000)]), width: 0 },
      { ...inputs([click(1000)]), height: Infinity },
      { ...inputs([click(1000)]), durationMs: 0 },
      { ...inputs([click(1000)]), reserved: [createManualZoom('reserved', 0, 10000)] },
    ])
      expect(buildAutomaticGlassElements(data)).toEqual([]);
    const short = buildAutomaticGlassElements({ ...inputs([click(100)]), durationMs: 800 })[0]!;
    expect(short.startMs).toBe(0);
    expect(short.endMs).toBe(800);
    expect(short.glass!.transitionMs).toBe(160);
    expect(buildAutomaticGlassElements({ ...inputs([click(100)]), durationMs: 200 })).toEqual([]);
  });
});
