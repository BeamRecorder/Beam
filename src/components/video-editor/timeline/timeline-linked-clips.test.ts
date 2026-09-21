import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { AudioClip, ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { linkedClipNames } from './timeline-linked-clips';

const sessionAsset = (id: string, kind: MediaAsset['kind']): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  durationMs: 20_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `/media/${id}`,
  origin: 'session',
  sessionId: 'session-1',
});

const screen = (): VisualClip => ({
  id: 'screen',
  kind: 'screen',
  name: 'Screen recording',
  assetId: 'screen-asset',
  timelineStartMs: 0,
  timelineDurationMs: 5_000,
  sourceInMs: 0,
  sourceDurationMs: 5_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  groupId: 'recording-group',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
});

const microphone = (id: string, name: string, timelineStartMs: number, order: number): AudioClip => ({
  id,
  kind: 'audio',
  name,
  assetId: `${id}-asset`,
  role: 'microphone',
  timelineStartMs,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order,
  groupId: 'recording-group',
  recordingClipId: 'screen',
  volume: 100,
});

const composition = (clips: Array<VisualClip | AudioClip>): ClipComposition => ({
  schemaVersion: 14,
  assets: clips.map((clip) => sessionAsset(clip.assetId, clip.kind === 'audio' ? 'audio' : 'video')),
  clips,
  keyboardCaptionSessions: [],
});

describe('linkedClipNames', () => {
  it('names every linked microphone with its timeline position and excludes the selected clip', () => {
    const owner = screen();
    const first = microphone('microphone-1', 'Microphone 1', 0, 1);
    const second = microphone('microphone-2', 'Microphone 2', 100, 2);
    const third = microphone('microphone-3', 'Microphone 3', 200, 3);
    const next = composition([owner, first, second, third]);

    expect(linkedClipNames(next, owner)).toEqual(['Microphone 1 (0.0s)', 'Microphone 2 (0.1s)', 'Microphone 3 (0.2s)']);
    expect(linkedClipNames(next, second)).toEqual([
      'Screen recording (0.0s)',
      'Microphone 1 (0.0s)',
      'Microphone 3 (0.2s)',
    ]);
  });

  it('does not expose a detached sidecar as a linked companion', () => {
    const owner = screen();
    const detached = {
      ...microphone('detached-microphone', 'Detached microphone', 0, 1),
      groupId: undefined,
      recordingClipId: null,
    };
    const next = composition([owner, detached]);

    expect(linkedClipNames(next, owner)).toEqual([]);
  });
});
