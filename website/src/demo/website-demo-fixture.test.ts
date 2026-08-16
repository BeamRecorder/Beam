import { describe, expect, it } from 'vitest';
import { emptyComposition } from '~/media/shared/composition-types';
import { addDemoCaption, demoCapturePreviews, demoCaptureSources } from './website-demo-fixture';

describe('website demo fixture', () => {
  it('provides capture data for the real HUD component', () => {
    expect(demoCaptureSources.some((source) => source.kind === 'display')).toBe(true);
    expect(demoCapturePreviews[0]?.displayBounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('keeps new editor captions inside the loaded media duration', () => {
    const durationMs = 8_000;
    const composition = addDemoCaption(emptyComposition(), durationMs + 10_000, durationMs);
    const caption = composition.clips.at(-1);
    expect(caption?.kind).toBe('caption');
    expect((caption?.timelineStartMs ?? 0) + (caption?.timelineDurationMs ?? 0)).toBeLessThanOrEqual(durationMs);
  });
});
