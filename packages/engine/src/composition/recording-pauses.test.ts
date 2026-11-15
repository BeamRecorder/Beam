import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '../shared/composition-defaults';
import { createComposition } from '../commands/clip-engine';
import type { AudioClip, MediaAsset, VisualClip } from '../shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import { removeRecordingPauseGaps } from './recording-pauses';
import { sessionTimeAt } from '../shared/timeline-mapping';

const screen = (id: string, timelineStartMs: number, patch: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'screen',
  name: id,
  assetId: id,
  trackId: 'screen',
  timelineStartMs,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  isMirrored: false,
  isMirroredY: false,
  appearance: createDefaultClipAppearance('screen'),
  ...patch,
});
const recording = (clips: (VisualClip | AudioClip)[]) =>
  createComposition(
    clips.map((clip): MediaAsset => ({
      id: clip.assetId,
      kind: clip.kind === 'audio' ? 'audio' : 'video',
      name: clip.id,
      fileName: null,
      src: '/recording',
      durationMs: 1000,
      width: null,
      height: null,
      origin: 'session',
      sessionId: 'session',
      sessionStartMs: clip.timelineStartMs,
    })),
    clips,
  );
const zoom = (id: string, startMs: number, endMs: number): ZoomElement => ({
  id,
  sessionId: 'session',
  startMs,
  endMs,
  mode: 'manual',
  depth: 2,
  focus: { cx: 0.5, cy: 0.5 },
});

describe('recording pause cleanup', () => {
  it('closes multiple ten-minute pauses as one result and retains immutable source clocks', () => {
    const original = recording([screen('a', 0), screen('b', 601000), screen('c', 1202000)]);
    const result = removeRecordingPauseGaps(original, 'session');
    expect(result.composition.clips.map((clip) => clip.timelineStartMs)).toEqual([0, 1000, 2000]);
    expect(result.removedCount).toBe(2);
    expect(result.removedDurationMs).toBe(1200000);
    expect(original.clips.map((clip) => clip.timelineStartMs)).toEqual([0, 601000, 1202000]);
    const last = result.composition.clips[2]!;
    expect(last.sourceInMs).toBe(0);
    expect(sessionTimeAt(last, 2500, result.composition)).toBe(1202500);
    expect(removeRecordingPauseGaps(result.composition, 'session').removedCount).toBe(0);
  });
  it('ripples webcam, microphone, system audio and zooms with their screen segments', () => {
    const clips: (VisualClip | AudioClip)[] = [screen('a', 0), screen('b', 601000)];
    for (const [id, start, owner] of [
      ['cam-a', 0, 'a'],
      ['cam-b', 601000, 'b'],
    ] as const)
      clips.push(screen(id, start, { kind: 'webcam', trackId: 'webcam', recordingClipId: owner }));
    for (const role of ['microphone', 'system'] as const)
      for (const [owner, start] of [
        ['a', 0],
        ['b', 601000],
      ] as const) {
        const base = screen(`${role}-${owner}`, start);
        const audio: AudioClip = { ...base, kind: 'audio', role, volume: 100, recordingClipId: owner };
        clips.push(audio);
      }
    const result = removeRecordingPauseGaps(recording(clips), 'session', [
      zoom('later', 601100, 601800),
      zoom('paused', 2000, 3000),
    ]);
    expect(
      result.composition.clips.filter((clip) => clip.id.endsWith('b')).map((clip) => clip.timelineStartMs),
    ).toEqual([1000, 1000, 1000, 1000]);
    expect(result.zoomElements).toEqual([expect.objectContaining({ id: 'later', startMs: 1100, endMs: 1800 })]);
  });
  it('keeps leading delays and gaps in imported or unrelated recordings', () => {
    const original = recording([screen('a', 500), screen('b', 2500)]);
    expect(removeRecordingPauseGaps(original, 'other-session').composition).toBe(original);
    const result = removeRecordingPauseGaps(original, 'session');
    expect(result.composition.clips.map((clip) => clip.timelineStartMs)).toEqual([500, 1500]);
    const imported = {
      ...original,
      assets: original.assets.map((asset) => ({ ...asset, origin: 'project' as const })),
    };
    expect(removeRecordingPauseGaps(imported, 'session').composition).toBe(imported);
  });
  it.each(['locked', 'occupied'] as const)('does not alter a %s gap', (mode) => {
    const clips: (VisualClip | AudioClip)[] = [screen('a', 0), screen('b', 3000, { locked: mode === 'locked' })];
    if (mode === 'occupied') clips.push(screen('other', 1500, { kind: 'video', trackId: 'other' }));
    const original = recording(clips);
    const result = removeRecordingPauseGaps(original, 'session');
    expect(result.composition).toBe(original);
    expect(result.removedCount).toBe(0);
  });
  it('is inert for empty and uninterrupted recordings', () => {
    for (const clips of [[], [screen('only', 0)], [screen('a', 0), screen('b', 1000)]]) {
      const original = recording(clips);
      expect(removeRecordingPauseGaps(original, 'session')).toMatchObject({
        composition: original,
        removedCount: 0,
        removedDurationMs: 0,
      });
    }
  });
});
