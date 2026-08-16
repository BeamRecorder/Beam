import { describe, expect, it } from 'vitest';
import {
  addDemoCaption,
  createDemoComposition,
  createDemoZooms,
  DEMO_DURATION_MS,
  updateClip,
} from './website-demo-fixture';

describe('website demo fixture', () => {
  it('uses one real video asset for the screen recording', () => {
    const composition = createDemoComposition();
    expect(composition.assets).toHaveLength(1);
    expect(composition.assets[0]).toMatchObject({
      kind: 'video',
      fileName: 'BeamDemo.webm',
      durationMs: DEMO_DURATION_MS,
      width: 1920,
      height: 1080,
    });
    expect(composition.assets[0]?.src).toMatch(/BeamDemo.*\.webm/);
    expect(composition.clips[0]).toMatchObject({
      kind: 'screen',
      assetId: composition.assets[0]?.id,
      timelineDurationMs: DEMO_DURATION_MS,
    });
  });

  it('creates fresh fixture state for each preview', () => {
    const first = createDemoComposition();
    const second = createDemoComposition();
    first.clips[0]!.enabled = false;
    expect(second.clips[0]?.enabled).toBe(true);
  });

  it('updates only the selected clip', () => {
    const composition = createDemoComposition();
    const updated = updateClip(composition, 'beam-demo-screen', (clip) => ({ ...clip, enabled: false }));
    expect(updated.clips[0]?.enabled).toBe(false);
    expect(composition.clips[0]?.enabled).toBe(true);
  });

  it('keeps demo captions inside the media duration', () => {
    const composition = addDemoCaption(createDemoComposition(), DEMO_DURATION_MS + 10_000);
    const caption = composition.clips.at(-1);
    expect(caption?.kind).toBe('caption');
    expect((caption?.timelineStartMs ?? 0) + (caption?.timelineDurationMs ?? 0)).toBeLessThanOrEqual(DEMO_DURATION_MS);
  });

  it('provides a deterministic product zoom', () => {
    expect(createDemoZooms()).toEqual([
      expect.objectContaining({
        id: 'beam-demo-zoom',
        startMs: 2_200,
        endMs: 5_100,
        mode: 'manual',
      }),
    ]);
  });
});
