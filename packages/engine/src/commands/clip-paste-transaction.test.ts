import { describe, expect, it } from 'vitest';
import { createClipPasteTransaction } from '@beam/engine/commands/clip-paste';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { COMPOSITION_SCHEMA_VERSION } from '@beam/engine/shared/composition-types';
import type { ClipComposition, VisualClip } from '@beam/engine/shared/composition-types';

const clip = (id: string, start = 0, duration = 1000): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId: 'media',
  trackId: id,
  order: 0,
  enabled: true,
  transitions: { entry: null, exit: null },
  timelineStartMs: start,
  timelineDurationMs: duration,
  sourceInMs: 0,
  sourceDurationMs: duration,
  playbackRate: 1,
  appearance: createDefaultClipAppearance('video'),
  transform: { x: 0, y: 0, width: 1, height: 1 },
  isMirrored: false,
  isMirroredY: false,
});
const composition = (clips: VisualClip[] = []): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  keyboardCaptionSessions: [],
  clips,
  assets: [
    {
      id: 'media',
      kind: 'video',
      name: 'media',
      fileName: 'media.webm',
      src: 'media.webm',
      origin: 'project',
      durationMs: 10000,
      width: 1920,
      height: 1080,
    },
  ],
});
describe('atomic bulk clip paste', () => {
  it('appends 10000 ordered fragments to one lane without repeatedly reading preceding clips', () => {
    const first = clip('one-lane', 0, 80);
    let timingReads = 0;
    Object.defineProperty(first, 'timelineStartMs', {
      get: () => {
        timingReads++;
        return 0;
      },
    });
    const batch = createClipPasteTransaction(composition([first]));
    for (let i = 1; i < 10000; i++) {
      const copied = clip(`copied-${i}`, 0, 80);
      batch.paste(copied, {
        timelineStartMs: i * 100,
        timelineDurationMs: 1000000,
        targetTrackId: 'one-lane',
        idFactory: () => `paste-${i}`,
      });
    }
    expect(batch.finish().clips).toHaveLength(10000);
    expect(timingReads).toBeLessThan(100);
  });
  it('commits 10000 new layers without mutating the source or sharing mutable clipboard fields', () => {
    const original = composition();
    const copied = clip('copied');
    const batch = createClipPasteTransaction(original);
    for (let i = 0; i < 10000; i++)
      batch.paste(copied, {
        timelineStartMs: 0,
        timelineDurationMs: 2000,
        targetTrackId: `lane-${i}`,
        idFactory: () => `paste-${i}`,
      });
    const result = batch.finish();
    expect(result.clips).toHaveLength(10000);
    expect(original.clips).toEqual([]);
    expect(new Set(result.clips.map((c) => c.order)).size).toBe(10000);
    expect((result.clips[0] as VisualClip).transform).not.toBe(copied.transform);
    expect(result.assets).toHaveLength(1);
  });
  it('trims overlapping stages in the same lane while keeping source offsets and transition edges', () => {
    const original = composition([clip('target', 0, 3000)]);
    const batch = createClipPasteTransaction(original);
    let next = 0;
    const idFactory = () => `id-${next++}`;
    batch.paste(clip('copied', 0, 500), {
      timelineStartMs: 500,
      timelineDurationMs: 3000,
      targetTrackId: 'target',
      idFactory,
    });
    batch.paste(clip('copied', 0, 500), {
      timelineStartMs: 1500,
      timelineDurationMs: 3000,
      targetTrackId: 'target',
      idFactory,
    });
    const result = batch.finish();
    expect(result.clips.map((c) => [c.timelineStartMs, c.timelineDurationMs, c.sourceInMs])).toEqual([
      [0, 500, 0],
      [500, 500, 0],
      [1000, 500, 1000],
      [1500, 500, 0],
      [2000, 1000, 2000],
    ]);
    expect(original.clips[0]!.timelineDurationMs).toBe(3000);
  });
  it('leaves the live composition intact when a later entry fails validation', () => {
    const original = composition([clip('target')]);
    const before = JSON.stringify(original);
    const batch = createClipPasteTransaction(original);
    batch.paste(clip('copied'), {
      timelineStartMs: 0,
      timelineDurationMs: 2000,
      targetTrackId: 'new',
      idFactory: () => 'valid',
    });
    expect(() => batch.paste(clip('invalid'), { timelineStartMs: 1500, timelineDurationMs: 2000 })).toThrow(
      'does not fit',
    );
    expect(JSON.stringify(original)).toBe(before);
  });
});
