import { expect, it } from 'vitest';
import { planVisuals } from './visualPlan';
import type { VisualPlan } from './visualTypes';
const plan: VisualPlan = { asset: { id: 'a', name: '40 minutes', durationMs: 2_400_000, width: 1920, height: 1080, hasVideo: true, hasAudio: true, hasCursor: false, zoomCount: 0, recording: false },
  clip: { startMs: 10_000, sourceInMs: 60_000, durationMs: 2_000_000 }, viewport: { startMs: 300_000, endMs: 310_000, pixels: 80 } };
it('requests only visible source times from long footage, with exact trimmed placement', () => {
  const tiles = planVisuals(plan, 'video'); expect(tiles.length).toBeLessThan(10);
  expect(tiles[0].request).toEqual({ kind: 'video', positionMs: 348160 });
  expect(tiles.at(-1)!.x).toBeLessThan((310_000 - 10_000) * .08);
  expect(tiles[0].x).toBeCloseTo((348160 - 60_000) * .08);
});
it('keeps samples stable within a zoom level, and uses bounded audio slices', () => {
  const first = planVisuals(plan, 'video');
  expect(planVisuals({ ...plan, viewport: { ...plan.viewport, pixels: 85 } }, 'video').map(t => t.request)).toEqual(first.map(t => t.request));
  for (const tile of planVisuals(plan, 'audio')) { if (tile.request.kind === 'audio') {
    expect(tile.request.endMs - tile.request.startMs).toBeLessThanOrEqual(120_000);
    expect(Math.ceil((tile.request.endMs - tile.request.startMs) / tile.request.stepMs)).toBeLessThanOrEqual(128);
  } }
});
it('shares image samples and rejects empty, offscreen and unavailable media', () => {
  expect(planVisuals({ ...plan, asset: { ...plan.asset, isImage: true } }, 'video').every(t => t.request.kind === 'video' && t.request.positionMs === 0)).toBe(true);
  for (const pixels of [0, -1, NaN, Infinity]) expect(planVisuals({ ...plan, viewport: { ...plan.viewport, pixels } }, 'video')).toEqual([]);
  expect(planVisuals({ ...plan, viewport: { startMs: 0, endMs: 1, pixels: 80 } }, 'audio')).toEqual([]);
  expect(planVisuals({ ...plan, asset: { ...plan.asset, hasVideo: false } }, 'video')).toEqual([]);
  expect(planVisuals({ ...plan, asset: { ...plan.asset, hasAudio: false } }, 'audio')).toEqual([]);
});
it('clips source requests at the end, supports deep zoom and caps oversize viewports', () => {
  const edge = { ...plan, clip: { startMs: 0, sourceInMs: 0, durationMs: plan.asset.durationMs }, viewport: { startMs: 2_399_000, endMs: 2_500_000, pixels: 5000 } };
  const tiles = planVisuals(edge, 'audio'); expect(tiles.at(-1)?.request).toMatchObject({ endMs: 2_400_000, stepMs: 1 });
  expect(planVisuals({ ...edge, viewport: { startMs: 0, endMs: 2_400_000, pixels: 5000 } }, 'video')).toHaveLength(64);
});
