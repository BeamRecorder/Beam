import { describe, expect, it } from 'vitest';
import { createComposition } from '@beam/engine/commands/clip-engine';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import type { AudioClip, MediaAsset, VisualClip } from '@beam/engine/shared/composition-types';
import { removeTimelineGap, timelineGaps } from '@beam/engine/composition/timeline-gaps';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';

const recorded = () => {
  const assets: MediaAsset[] = [
    'screen-before',
    'screen-after',
    'camera-before',
    'camera-after',
    'mic-before',
    'mic-after',
  ].map((id) => ({
    id,
    kind: id.startsWith('mic') ? 'audio' : 'video',
    name: id,
    fileName: id,
    durationMs: 30_000,
    width: id.startsWith('mic') ? null : 640,
    height: id.startsWith('mic') ? null : 480,
    src: `/media/${id}`,
    origin: 'session',
    sessionId: 'recording',
    sessionStartMs: id.endsWith('after') ? 42_000 : 0,
  }));
  const screen = (id: string, start: number, duration: number): VisualClip => ({
    id,
    assetId: id,
    name: id,
    kind: 'screen',
    trackId: 'screen',
    timelineStartMs: start,
    timelineDurationMs: duration,
    sourceInMs: 0,
    sourceDurationMs: duration,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    enabled: true,
    order: 0,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance('screen'),
    isMirrored: false,
    isMirroredY: false,
  });
  const before = screen('screen-before', 0, 27_005);
  const after = screen('screen-after', 42_000, 10_000);
  const cameraBefore: VisualClip = {
    ...screen('camera-before', 2, 26_998),
    kind: 'webcam',
    trackId: 'camera',
    order: 1,
    recordingClipId: before.id,
  };
  const cameraAfter: VisualClip = {
    ...screen('camera-after', 42_015, 9_985),
    kind: 'webcam',
    trackId: 'camera',
    order: 1,
    recordingClipId: after.id,
  };
  const mic = (id: string, start: number, duration: number, owner: string): AudioClip => ({
    id,
    assetId: id,
    name: id,
    kind: 'audio',
    role: 'microphone',
    volume: 100,
    timelineStartMs: start,
    timelineDurationMs: duration,
    sourceInMs: 0,
    sourceDurationMs: duration,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    enabled: true,
    order: 2,
    recordingClipId: owner,
  });
  return createComposition(assets, [
    before,
    after,
    cameraBefore,
    cameraAfter,
    mic('mic-before', 1, 27_009, before.id),
    mic('mic-after', 42_003, 9_997, after.id),
  ]);
};

describe('recorded pause gaps', () => {
  it.each(['screen', 'webcam', 'audio'])(
    'removes the shared pause from the %s lane despite different capture boundaries',
    (kind) => {
      const composition = recorded();
      const original = JSON.stringify(composition);
      const clips = composition.clips.filter((clip) => clip.kind === kind);
      const gap = timelineGaps(clips).find((entry) => entry.startMs > 1_000)!;
      const result = removeTimelineGap(composition, gap);
      expect(result.rippleRange).toEqual({ startMs: 27_010, endMs: 42_000 });
      expect(result.deltaMs).toBe(-14_990);
      const joined = result.composition;
      expect(joined).not.toBe(composition);
      expect(joined.clips.find((clip) => clip.id === 'screen-after')?.timelineStartMs).toBe(27_010);
      expect(joined.clips.find((clip) => clip.id === 'camera-after')?.timelineStartMs).toBe(27_025);
      expect(joined.clips.find((clip) => clip.id === 'mic-after')?.timelineStartMs).toBe(27_013);
      for (const clip of composition.clips.filter((entry) => entry.id.endsWith('before'))) {
        expect(joined.clips.find((entry) => entry.id === clip.id)).toBe(clip);
      }
      expect(joined.assets).toBe(composition.assets);
      expect(JSON.stringify(composition)).toBe(original);
    },
  );

  it('shifts later automatic and manual zooms by the same effective pause duration', () => {
    const composition = recorded();
    const gap = timelineGaps(composition.clips.filter((clip) => clip.kind === 'webcam')).find(
      (entry) => entry.startMs > 1000,
    )!;
    const zooms: ZoomElement[] = [
      {
        id: 'auto',
        sessionId: 'recording',
        startMs: 42_003,
        endMs: 42_500,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 2,
        mode: 'auto',
        linkedClipId: 'screen-after',
      },
      {
        id: 'manual',
        sessionId: 'recording',
        startMs: 45_000,
        endMs: 46_000,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 2,
        mode: 'manual',
      },
    ];
    const original = JSON.stringify(zooms);
    const result = removeTimelineGap(composition, gap, zooms);
    expect(result.zoomElements.map(({ id, startMs, endMs }) => ({ id, startMs, endMs }))).toEqual([
      { id: 'auto', startMs: 27_013, endMs: 27_510 },
      { id: 'manual', startMs: 30_010, endMs: 31_010 },
    ]);
    expect(JSON.stringify(zooms)).toBe(original);
  });

  it('does not remove a camera-only opening delay while the linked screen is already recording', () => {
    const composition = recorded();
    const gap = timelineGaps(composition.clips.filter((clip) => clip.kind === 'webcam'))[0]!;
    expect(gap).toMatchObject({ startMs: 0, endMs: 2 });
    expect(removeTimelineGap(composition, gap)).toMatchObject({ composition, deltaMs: 0, rippleRange: null });
  });

  it('removes pauses in older sessions whose recording companions have no explicit owner yet', () => {
    const base = recorded();
    const composition = { ...base, clips: base.clips.map((clip) => ({ ...clip, recordingClipId: undefined })) };
    const gap = timelineGaps(composition.clips.filter((clip) => clip.kind === 'webcam')).find(
      (entry) => entry.startMs > 1000,
    )!;
    const result = removeTimelineGap(composition, gap);
    expect(result.deltaMs).toBe(-14_990);
    expect(result.composition.clips.find((clip) => clip.id === 'camera-after')).toMatchObject({
      timelineStartMs: 27_025,
      recordingClipId: 'screen-after',
    });
  });

  it('still blocks removal when an unrelated clip occupies the shared recording pause', () => {
    const base = recorded();
    const screen = base.clips.find((clip): clip is VisualClip => clip.kind === 'screen')!;
    const composition = createComposition(base.assets, [
      ...base.clips,
      {
        ...screen,
        id: 'unrelated',
        kind: 'video',
        trackId: 'other',
        timelineStartMs: 30_000,
        timelineDurationMs: 1000,
        sourceDurationMs: 1000,
      },
    ]);
    const gap = timelineGaps(composition.clips.filter((clip) => clip.kind === 'webcam')).find(
      (entry) => entry.startMs > 1000,
    )!;
    expect(removeTimelineGap(composition, gap).composition).toBe(composition);
  });

  it.each(['microphone', 'zoom'])('keeps the pause unchanged when a later linked %s is locked', (lockedKind) => {
    const base = recorded();
    const composition = {
      ...base,
      clips: base.clips.map((clip) =>
        lockedKind === 'microphone' && clip.id === 'mic-after' ? { ...clip, locked: true } : clip,
      ),
    };
    const zooms: ZoomElement[] = [
      {
        id: 'auto',
        sessionId: 'recording',
        startMs: 42_003,
        endMs: 42_500,
        focus: { cx: 0.5, cy: 0.5 },
        depth: 2,
        mode: 'auto',
        linkedClipId: 'screen-after',
        locked: lockedKind === 'zoom',
      },
    ];
    const gap = timelineGaps(composition.clips.filter((clip) => clip.kind === 'screen'))[0]!;
    const result = removeTimelineGap(composition, gap, zooms);
    expect(result.composition).toBe(composition);
    expect(result.zoomElements).toEqual(zooms);
    expect(result.deltaMs).toBe(0);
  });
});
