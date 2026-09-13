import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { AudioClip, ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import {
  automaticZoomOwner,
  recordingMoveSelection,
  recordingSidecars,
  unlinkRecordingSidecars,
} from './recording-sidecars';
import type { RecordingSidecarUnlink } from './recording-sidecar-types';

const asset = (id: string, kind: MediaAsset['kind'], sessionId?: string): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  durationMs: 60_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `/media/${id}`,
  origin: 'session',
  ...(sessionId ? { sessionId } : {}),
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

const microphone = (id: string, overrides: Partial<AudioClip> = {}): AudioClip => ({
  id,
  kind: 'audio',
  role: 'microphone',
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

const composition = (
  clips: Array<VisualClip | AudioClip>,
  screenSessions: Record<string, string> = {},
): ClipComposition => ({
  schemaVersion: 14,
  assets: clips.map((clip) =>
    asset(
      clip.assetId,
      clip.kind === 'audio' ? 'audio' : 'video',
      clip.kind === 'screen' ? (screenSessions[clip.id] ?? 'session-1') : undefined,
    ),
  ),
  clips,
  keyboardCaptionSessions: [],
});

const zoom = (id: string, overrides: Partial<ZoomElement> = {}): ZoomElement => ({
  id,
  sessionId: 'session-1',
  startMs: 1_000,
  endMs: 2_000,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'auto',
  ...overrides,
});

const clipById = (next: ClipComposition, id: string) => {
  const clip = next.clips.find((entry) => entry.id === id);
  if (!clip) throw new Error(`Missing clip ${id}`);
  return clip;
};

describe('recording sidecars', () => {
  it('follows a default automatic zoom with its screen and expands the recording group', () => {
    const groupId = 'recording:session-1:0:5000';
    const owner = screen('screen', { groupId });
    const mic = microphone('mic', { groupId });
    const next = composition([owner, mic]);
    const auto = zoom('auto');
    const manual = zoom('manual', { mode: 'manual', linkedClipId: owner.id });
    const detached = zoom('detached', { linkedClipId: null });
    const otherSession = zoom('other-session', { sessionId: 'session-2' });
    const zooms = [auto, manual, detached, otherSession];

    expect(automaticZoomOwner(next, auto)).toBe(owner);
    expect(automaticZoomOwner(next, manual)).toBeNull();
    expect(automaticZoomOwner(next, detached)).toBeNull();
    expect(automaticZoomOwner(next, otherSession)).toBeNull();
    expect(recordingSidecars(next, zooms, owner.id)).toEqual({ clips: [mic], zooms: [auto] });

    expect(recordingMoveSelection(next, zooms, { clipIds: [owner.id], zoomIds: [] })).toEqual({
      clipIds: [owner.id, mic.id],
      zoomIds: [auto.id],
    });
    expect(recordingMoveSelection(next, zooms, { clipIds: [mic.id], zoomIds: [] })).toEqual({
      clipIds: [mic.id, owner.id],
      zoomIds: [auto.id],
    });
    expect(recordingMoveSelection(next, zooms, { clipIds: [], zoomIds: [auto.id] })).toEqual({
      clipIds: [],
      zoomIds: [auto.id],
    });
  });

  it('resolves explicit links through split screen siblings and rejects missing owners', () => {
    const owner = screen('screen-a', {
      assetId: 'shared-screen-asset',
      timelineDurationMs: 1_000,
      sourceDurationMs: 1_000,
    });
    const sibling = screen('screen-b', {
      assetId: owner.assetId,
      timelineStartMs: 2_000,
      timelineDurationMs: 1_000,
      sourceInMs: 1_000,
      sourceDurationMs: 1_000,
    });
    const next = composition([owner, sibling]);
    const splitZoom = zoom('split', { linkedClipId: owner.id, startMs: 2_100, endMs: 2_200 });
    const outsideZoom = zoom('outside', { linkedClipId: owner.id, startMs: 6_000, endMs: 6_200 });
    const missingZoom = zoom('missing', { linkedClipId: 'missing-screen', startMs: 2_100, endMs: 2_200 });

    expect(automaticZoomOwner(next, splitZoom)).toBe(sibling);
    expect(automaticZoomOwner(next, outsideZoom)).toBe(owner);
    expect(automaticZoomOwner(next, missingZoom)).toBeNull();
  });

  it('uses legacy source timing and sole-screen fallback before returning no owner', () => {
    const moved = screen('moved-screen', {
      timelineStartMs: 10_000,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 5_000,
    });
    const later = screen('later-screen', {
      timelineStartMs: 20_000,
      timelineDurationMs: 1_000,
      sourceInMs: 6_000,
      sourceDurationMs: 1_000,
    });
    const movedComposition = composition([moved, later]);
    const legacy = zoom('legacy', { startMs: 2_000, endMs: 2_500 });

    expect(automaticZoomOwner(movedComposition, legacy)).toBe(moved);

    const only = screen('only-screen', {
      timelineStartMs: 10_000,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
    });
    const outside = zoom('outside-only', { startMs: 5_000, endMs: 6_000 });
    expect(automaticZoomOwner(composition([only]), outside)).toBe(only);

    const noScreen = composition([microphone('microphone')]);
    expect(automaticZoomOwner(noScreen, zoom('no-screen'))).toBeNull();
  });

  it('unlinks only the requested sidecars and keeps every timeline time unchanged', () => {
    const groupId = 'recording:session-1:0:5000';
    const owner = screen('screen', { groupId });
    const mic = microphone('mic', { groupId, timelineStartMs: 500 });
    const webcam = visual('webcam', 'webcam', { groupId, timelineStartMs: 500 });
    const next = composition([owner, mic, webcam]);
    const target = zoom('target', { linkedClipId: owner.id, startMs: 1_500, endMs: 2_250 });
    const retained = zoom('retained', { linkedClipId: owner.id, startMs: 3_000, endMs: 3_750 });
    const zooms = [target, retained];
    const request: RecordingSidecarUnlink = {
      clipId: owner.id,
      clipIds: [mic.id],
      zoomIds: [target.id],
    };

    const result = unlinkRecordingSidecars(next, zooms, request);

    expect(clipById(result.composition, owner.id).groupId).toBe(groupId);
    expect(clipById(result.composition, mic.id).groupId).toBeUndefined();
    expect(clipById(result.composition, webcam.id).groupId).toBe(groupId);
    expect(result.zoomElements).toEqual([
      expect.objectContaining({ id: target.id, linkedClipId: null, startMs: 1_500, endMs: 2_250 }),
      expect.objectContaining({ id: retained.id, linkedClipId: owner.id, startMs: 3_000, endMs: 3_750 }),
    ]);
    expect(result.composition).not.toBe(next);
    expect(next.clips).toEqual([owner, mic, webcam]);
  });

  it.each([
    ['the owner', 'owner'],
    ['a requested clip sidecar', 'clip'],
    ['a requested zoom sidecar', 'zoom'],
  ] as const)('rejects unlinking atomically when %s is locked', (_label, lockedPart) => {
    const groupId = 'recording:session-1:0:5000';
    const owner = screen('screen', { groupId, locked: lockedPart === 'owner' });
    const freeMic = microphone('free-mic', { groupId });
    const lockedMic = microphone('locked-mic', { groupId, locked: lockedPart === 'clip' });
    const freeZoom = zoom('free-zoom', { linkedClipId: owner.id });
    const lockedZoom = zoom('locked-zoom', { linkedClipId: owner.id, locked: lockedPart === 'zoom' });
    const next = composition([owner, freeMic, lockedMic]);
    const zooms = [freeZoom, lockedZoom];
    const request: RecordingSidecarUnlink = {
      clipId: owner.id,
      clipIds: [freeMic.id, lockedMic.id],
      zoomIds: [freeZoom.id, lockedZoom.id],
    };

    const result = unlinkRecordingSidecars(next, zooms, request);

    expect(result.composition).toBe(next);
    expect(result.composition.clips).toBe(next.clips);
    expect(result.zoomElements).not.toBe(zooms);
    expect(result.zoomElements).toEqual(zooms);
    expect(clipById(result.composition, freeMic.id).groupId).toBe(groupId);
    expect(clipById(result.composition, lockedMic.id).groupId).toBe(groupId);
  });

  it.each([
    ['empty', { clipId: 'screen', clipIds: [], zoomIds: [] }],
    ['stale sidecar ids', { clipId: 'screen', clipIds: ['missing-clip'], zoomIds: ['missing-zoom'] }],
    ['unknown owner', { clipId: 'missing-owner', clipIds: ['mic'], zoomIds: ['auto'] }],
  ] as const)('treats an %s unlink request as a no-op', (_label, request) => {
    const owner = screen('screen', { groupId: 'recording:session-1:0:5000' });
    const mic = microphone('mic', { groupId: owner.groupId });
    const next = composition([owner, mic]);
    const zooms = [zoom('auto', { linkedClipId: owner.id })];

    const result = unlinkRecordingSidecars(next, zooms, request);

    expect(result.composition).toBe(next);
    expect(result.zoomElements).toEqual(zooms);
    expect(result.zoomElements).not.toBe(zooms);
  });
});

it.each(['screen', 'mic'])(
  'detaches offset microphone links from the %s properties without changing timing',
  (selected) => {
    const owner = screen('screen');
    const mic = microphone('mic', { timelineStartMs: 250, timelineDurationMs: 3000, sourceDurationMs: 3000 });
    const initial = composition([owner, mic]);
    const next = { ...initial, assets: initial.assets.map((asset) => ({ ...asset, sessionId: 'session-1' })) };
    const result = unlinkRecordingSidecars(next, [], {
      clipId: selected,
      clipIds: [selected === 'screen' ? 'mic' : 'screen'],
      zoomIds: [],
    });
    expect(result.composition.clips.find((clip) => clip.id === 'mic')).toMatchObject({
      recordingClipId: null,
      timelineStartMs: 250,
      timelineDurationMs: 3000,
    });
    expect(recordingMoveSelection(result.composition, [], { clipIds: ['screen'], zoomIds: [] })).toEqual({
      clipIds: ['screen'],
      zoomIds: [],
    });
  },
);
