import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { AudioClip, ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { prepareTimelineSelectionMove } from './timeline-selection-move';
import { recordingLinkedClipIds, recordingMediaOwner } from './recording-media-links';

const asset = (id: string, kind: MediaAsset['kind'], sessionId: string): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  durationMs: 60_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `/media/${id}`,
  origin: 'session',
  sessionId,
});

const visual = (id: string, kind: VisualClip['kind'], overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind,
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: 0,
  timelineDurationMs: 5_000,
  sourceInMs: 0,
  sourceDurationMs: 5_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  trackId: `${id}-track`,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance(kind),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const screen = (id: string, overrides: Partial<VisualClip> = {}) => visual(id, 'screen', overrides);
const webcam = (id: string, overrides: Partial<VisualClip> = {}) => visual(id, 'webcam', overrides);

const audio = (id: string, role: AudioClip['role'], overrides: Partial<AudioClip> = {}): AudioClip => ({
  id,
  kind: 'audio',
  role,
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: 0,
  timelineDurationMs: 5_000,
  sourceInMs: 0,
  sourceDurationMs: 5_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  volume: 100,
  ...overrides,
});

const composition = (clips: Array<VisualClip | AudioClip>, sessions: Record<string, string> = {}): ClipComposition => ({
  schemaVersion: 14,
  assets: clips.map((clip) =>
    asset(clip.assetId, clip.kind === 'audio' ? 'audio' : 'video', sessions[clip.id] ?? 'session-1'),
  ),
  clips,
  keyboardCaptionSessions: [],
});

describe('recording media links', () => {
  it('associates offset microphone, system, and webcam clips with the screen in their asset session', () => {
    const groupId = 'recording:session-1:5000:5000';
    const owner = screen('screen', { groupId, timelineStartMs: 5_000, timelineDurationMs: 5_000 });
    const microphone = audio('microphone', 'microphone', {
      groupId,
      timelineStartMs: 6_000,
      timelineDurationMs: 2_000,
    });
    const system = audio('system', 'system', { groupId, timelineStartMs: 6_500, timelineDurationMs: 1_000 });
    const camera = webcam('webcam', { groupId, timelineStartMs: 6_500, timelineDurationMs: 1_000 });
    const next = composition([owner, microphone, system, camera]);

    expect(recordingMediaOwner(next, microphone)).toBe(owner);
    expect(recordingMediaOwner(next, system)).toBe(owner);
    expect(recordingMediaOwner(next, camera)).toBe(owner);
    expect(recordingLinkedClipIds(next, [owner.id])).toEqual([owner.id, microphone.id, system.id, camera.id]);
    expect(recordingLinkedClipIds(next, [camera.id])).toEqual([camera.id, owner.id, microphone.id, system.id]);
    expect(recordingLinkedClipIds(next, ['unrelated'])).toEqual(['unrelated']);
  });

  it('excludes detached, unsupported, and other-session media sidecars', () => {
    const owner = screen('screen');
    const detached = webcam('detached', { recordingClipId: null });
    const voiceover = audio('voiceover', 'voiceover');
    const foreign = webcam('foreign', { timelineStartMs: 1_000, timelineDurationMs: 1_000 });
    const noSession = audio('no-session', 'microphone');
    const next = composition([owner, detached, voiceover, foreign, noSession], {
      foreign: 'session-2',
      'no-session': '',
    });

    expect(recordingMediaOwner(next, detached)).toBeNull();
    expect(recordingMediaOwner(next, voiceover)).toBeNull();
    expect(recordingMediaOwner(next, foreign)).toBeNull();
    expect(recordingMediaOwner(next, noSession)).toBeNull();
    expect(recordingLinkedClipIds(next, [owner.id])).toEqual([owner.id]);
  });

  it('gives an explicit owner priority after the screen moved away from the sidecar time', () => {
    const movedOwner = screen('moved-owner', {
      timelineStartMs: 10_000,
      timelineDurationMs: 1_000,
      assetId: 'screen-asset',
    });
    const timelineCandidate = screen('timeline-candidate', {
      timelineStartMs: 0,
      timelineDurationMs: 5_000,
      assetId: 'candidate-asset',
    });
    const camera = webcam('camera', {
      timelineStartMs: 1_000,
      timelineDurationMs: 1_000,
      recordingClipId: movedOwner.id,
    });
    const next = composition([movedOwner, timelineCandidate, camera]);

    expect(recordingMediaOwner(next, camera)).toBe(movedOwner);
    const missingOwner = webcam('missing-owner', { recordingClipId: 'missing-screen', timelineStartMs: 1_000 });
    expect(recordingMediaOwner(composition([movedOwner, timelineCandidate, missingOwner]), missingOwner)).toBeNull();
  });

  it('uses the sidecar midpoint, then the sole screen fallback, and otherwise returns no owner', () => {
    const first = screen('first', { timelineStartMs: 0, timelineDurationMs: 1_000 });
    const second = screen('second', { timelineStartMs: 3_000, timelineDurationMs: 1_000 });
    const timedCamera = webcam('timed-camera', { timelineStartMs: 3_200, timelineDurationMs: 200 });
    const multiple = composition([first, second, timedCamera]);
    expect(recordingMediaOwner(multiple, timedCamera)).toBe(second);

    const ambiguousCamera = webcam('ambiguous-camera', { timelineStartMs: 1_500, timelineDurationMs: 200 });
    expect(recordingMediaOwner(composition([first, second, ambiguousCamera]), ambiguousCamera)).toBeNull();

    const only = screen('only', { timelineStartMs: 10_000, timelineDurationMs: 1_000 });
    const outsideCamera = webcam('outside-camera', { timelineStartMs: 0, timelineDurationMs: 500 });
    expect(recordingMediaOwner(composition([only, outsideCamera]), outsideCamera)).toBe(only);
    expect(
      recordingMediaOwner(composition([audio('microphone', 'microphone')]), audio('other', 'microphone')),
    ).toBeNull();
  });

  it('blocks a linked media move atomically when the expanded selection contains a lock', () => {
    const owner = screen('screen', { timelineStartMs: 1_000 });
    const camera = webcam('camera', {
      timelineStartMs: 1_000,
      recordingClipId: owner.id,
      locked: true,
    });
    const next = composition([owner, camera]);
    const move = prepareTimelineSelectionMove({
      composition: next,
      zoomElements: [],
      selection: { clipIds: [owner.id], zoomIds: [] },
    });

    const result = move(500);

    expect(result.deltaMs).toBe(0);
    expect(result.composition).toBe(next);
    expect(next.clips.map((clip) => clip.timelineStartMs)).toEqual([1_000, 1_000]);
  });
});
