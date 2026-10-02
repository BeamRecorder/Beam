import { describe, expect, it } from 'vitest';
import { createCurrentScreenResolver } from '../current-screen-resolver';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { ClipComposition, VisualClip } from '~/media/shared/composition-types';

const screen: VisualClip = {
  kind: 'screen',
  id: 'screen',
  name: 'Screen',
  assetId: 'video',
  order: 0,
  enabled: true,
  timelineStartMs: 0,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
};
const composition = (clips: VisualClip[] = [screen]): ClipComposition => ({
  schemaVersion: 14,
  assets: [],
  clips,
  keyboardCaptionSessions: [],
});

describe('createCurrentScreenResolver', () => {
  it('reuses the screen index between queries and respects interval boundaries', () => {
    const current = composition();
    const resolve = createCurrentScreenResolver(() => current);
    expect(resolve.at(0)).toBe(screen);
    expect(resolve.at(999)).toBe(screen);
    expect(resolve.at(1000)).toBeNull();
  });
  it('rebuilds when the immutable composition changes', () => {
    let current = composition();
    const resolve = createCurrentScreenResolver(() => current);
    current = composition([{ ...screen, timelineStartMs: 1000 }]);
    expect(resolve.at(0)).toBeNull();
    expect(resolve.at(1000)?.id).toBe(screen.id);
    current = composition([]);
    expect(resolve.at(1000)).toBeNull();
  });
  it('invalidates in-place timing changes when the camera is reset', () => {
    const clip = { ...screen };
    const current = composition([clip]);
    const resolve = createCurrentScreenResolver(() => current);
    clip.timelineStartMs = 1000;
    resolve.invalidate();
    expect(resolve.at(0)).toBeNull();
    expect(resolve.at(1000)).toBe(clip);
  });
});
