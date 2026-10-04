import { describe, expect, it } from 'vitest';
import { createComposition, setCameraLayout, validateComposition } from '../commands/clip-engine';
import { createDefaultClipAppearance } from '../shared/composition-defaults';
import { sourceTimeAt } from '../shared/timeline-mapping';
import type { MediaAsset, VisualClip } from '../shared/composition-types';
import { attachWebcamRecordingOverlay, hasRecordingWebcam, webcamRecordingTarget } from './webcam-recording-overlay';
import { recordingLinkedClipIds, recordingMediaOwner } from './recording-media-links';
import { cameraScreenPartner } from './camera-screen-link';
const asset: MediaAsset = {
  id: 'screen-asset',
  kind: 'video',
  name: 'Recording',
  src: 'screen.mp4',
  fileName: null,
  width: 1920,
  height: 1080,
  durationMs: 30000,
  origin: 'session',
  sessionId: 'session-1',
};
const demo: MediaAsset = {
  ...asset,
  id: 'demo',
  src: 'demo.mp4',
  origin: 'project',
  durationMs: 8000,
  sessionId: undefined,
};
const screen: VisualClip = {
  id: 'screen',
  kind: 'screen',
  name: 'Recording',
  assetId: asset.id,
  trackId: 'screen-track',
  timelineStartMs: 2000,
  timelineDurationMs: 10000,
  sourceInMs: 0,
  sourceDurationMs: 10000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  appearance: createDefaultClipAppearance('screen'),
  transform: { x: 0, y: 0, width: 1, height: 1 },
  isMirrored: false,
  isMirroredY: false,
};
const create = (patch: Partial<VisualClip> = {}) => createComposition([asset], [{ ...screen, ...patch }]);
const request = {
  screenClipId: screen.id,
  asset: demo,
  name: 'Demo webcam',
  appearance: createDefaultClipAppearance('webcam'),
};

describe('webcam recording target', () => {
  it('prefers the selected recording, then the active recording, then the first recording', () => {
    const second = { ...screen, id: 'second', timelineStartMs: 20000 };
    const composition = createComposition([asset], [screen, second]);
    expect(webcamRecordingTarget(composition, second.id, 3000)?.id).toBe(second.id);
    expect(webcamRecordingTarget(composition, null, 20000)?.id).toBe(second.id);
    expect(webcamRecordingTarget(composition, null, 12000)?.id).toBe(screen.id);
  });
  it('ignores disabled, non-screen and non-recording sources', () => {
    expect(webcamRecordingTarget(create({ enabled: false }), null, 3000)).toBeNull();
    expect(webcamRecordingTarget(create({ kind: 'video' }), null, 3000)).toBeNull();
    expect(
      webcamRecordingTarget(createComposition([{ ...asset, sessionId: undefined }], [screen]), null, 3000),
    ).toBeNull();
  });
  it('handles empty compositions and invalid playheads', () => {
    expect(webcamRecordingTarget(createComposition(), null, 0)).toBeNull();
    expect(webcamRecordingTarget(create(), 'missing', Number.NaN)?.id).toBe(screen.id);
  });
});

describe('recording webcam attachment', () => {
  it.each([1, 2, 4, 0.25])(
    'covers the full recording at rate %s with real media bounds and one webcam lane',
    (playbackRate) => {
      const input = create({ playbackRate, sourceDurationMs: screen.timelineDurationMs * playbackRate });
      const before = JSON.stringify(input);
      const next = attachWebcamRecordingOverlay(input, request);
      const cameras = next.clips.filter((clip): clip is VisualClip => clip.kind === 'webcam');
      expect(JSON.stringify(input)).toBe(before);
      expect(cameras.length).toBe(Math.ceil((10000 * playbackRate) / 8000));
      expect(new Set(cameras.map((clip) => clip.trackId)).size).toBe(1);
      expect(new Set(cameras.map((clip) => clip.id)).size).toBe(cameras.length);
      expect(next.clips.find((clip) => clip.id === screen.id)).toMatchObject({
        ...screen,
        order: 1,
        playbackRate,
        sourceDurationMs: 10000 * playbackRate,
      });
      expect(cameras[0]?.timelineStartMs).toBe(2000);
      expect(cameras.at(-1)!.timelineStartMs + cameras.at(-1)!.timelineDurationMs).toBeCloseTo(12000);
      for (const camera of cameras) {
        expect(camera.sourceDurationMs).toBeLessThanOrEqual(demo.durationMs);
        expect(camera.sourceInMs).toBe(0);
        expect(camera.reactToZoom).toBe(true);
        expect(camera.cameraLayoutPreset).toBe('floating-bottom-right');
        expect(camera.cameraFramingPreset).toBe('squircle');
        expect(camera.appearance).toEqual(request.appearance);
        expect(recordingMediaOwner(next, camera)?.id).toBe(screen.id);
        expect(cameraScreenPartner(next, camera)?.id).toBe(screen.id);
        expect(sourceTimeAt(camera, camera.timelineStartMs + 10)).toBe(Math.round(10 * playbackRate));
      }
      expect(() => validateComposition(next)).not.toThrow();
      expect(hasRecordingWebcam(next, input.clips[0] as VisualClip)).toBe(true);
      expect(recordingLinkedClipIds(next, [screen.id])).toEqual(expect.arrayContaining(cameras.map((clip) => clip.id)));
    },
  );

  it.each([24001, 65432.1, 3600123, 54321])(
    'keeps fractional repeat boundaries contiguous for duration %s',
    (durationMs) => {
      const playbackRate = 1.37;
      const next = attachWebcamRecordingOverlay(
        create({ timelineDurationMs: durationMs, sourceDurationMs: durationMs * playbackRate, playbackRate }),
        request,
      );
      const cameras = next.clips.filter((clip): clip is VisualClip => clip.kind === 'webcam');
      for (let index = 1; index < cameras.length; index++) {
        expect(cameras[index]!.timelineStartMs).toBeCloseTo(
          cameras[index - 1]!.timelineStartMs + cameras[index - 1]!.timelineDurationMs,
        );
      }
      expect(() => validateComposition(next)).not.toThrow();
    },
  );

  it('keeps near-boundary repeats above the minimum clip duration', () => {
    const next = attachWebcamRecordingOverlay(create({ timelineDurationMs: 8001, sourceDurationMs: 8001 }), request);
    expect(next.clips.filter((clip) => clip.kind === 'webcam').map((clip) => clip.timelineDurationMs)).toEqual([
      4000.5, 4000.5,
    ]);
    const short = attachWebcamRecordingOverlay(create({ timelineDurationMs: 40, sourceDurationMs: 40 }), request);
    expect(short.clips.find((clip) => clip.kind === 'webcam')?.timelineDurationMs).toBe(40);
  });

  it('retains document extensions and creates an independent asset association on save and restore', () => {
    const input = { ...create(), customMetadata: { name: 'preserve' } };
    input.assets.push(demo);
    const next = attachWebcamRecordingOverlay(input, request);
    expect((next as typeof input).customMetadata).toEqual(input.customMetadata);
    expect(next.assets.find((entry) => entry.id === demo.id)?.sessionId).toBeUndefined();
    const restored = JSON.parse(JSON.stringify(next)) as typeof next;
    const camera = restored.clips.find((clip): clip is VisualClip => clip.kind === 'webcam')!;
    expect(recordingMediaOwner(restored, camera)?.id).toBe(screen.id);
    expect(cameraScreenPartner(restored, camera, true)?.id).toBe(screen.id);
    expect(
      setCameraLayout(restored, camera.id, 'split-left').clips.find((clip) => clip.id === camera.id),
    ).toMatchObject({ cameraLayoutPreset: 'split-left' });
    expect(cameraScreenPartner(restored, { ...camera, recordingClipId: null }, true)).toBeUndefined();
    expect(cameraScreenPartner(restored, { ...camera, kind: 'video' }, true)).toBeUndefined();
  });

  it.each([{ locked: true }, { enabled: false }, { id: 'missing' }])('rejects unavailable recordings: %j', (patch) => {
    expect(() => attachWebcamRecordingOverlay(create(patch), request)).toThrow('cannot accept');
  });
  it.each([0, 40, Number.NaN, Number.POSITIVE_INFINITY])('rejects unusable video durations: %s', (durationMs) => {
    expect(() => attachWebcamRecordingOverlay(create(), { ...request, asset: { ...demo, durationMs } })).toThrow(
      'playable video',
    );
  });
  it('rejects images, missing session identities and duplicate webcam attachments', () => {
    expect(() => attachWebcamRecordingOverlay(create(), { ...request, asset: { ...demo, kind: 'image' } })).toThrow(
      'playable video',
    );
    const unlinked = createComposition([{ ...asset, sessionId: undefined }], [screen]);
    expect(() => attachWebcamRecordingOverlay(unlinked, request)).toThrow('cannot accept');
    const next = attachWebcamRecordingOverlay(create(), request);
    expect(() => attachWebcamRecordingOverlay(next, request)).toThrow('cannot accept');
  });
  it('distinguishes attached webcams from detached and unrelated webcam clips', () => {
    const input = create();
    expect(hasRecordingWebcam(input, screen)).toBe(false);
    const next = attachWebcamRecordingOverlay(input, request);
    const camera = next.clips.find((clip): clip is VisualClip => clip.kind === 'webcam')!;
    expect(hasRecordingWebcam({ ...next, clips: [screen, { ...camera, recordingClipId: null }] }, screen)).toBe(false);
    expect(cameraScreenPartner(next, { ...camera, recordingClipId: 'removed' }, true)).toBeUndefined();
  });
});
