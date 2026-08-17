import { describe, expect, it } from 'vitest';
import {
  CompositionEngineError,
  createComposition,
  setCameraFraming,
  setCameraLayout,
  setCameraSplitRatio,
  setCameraSplitPadding,
  setCrop,
  setTransform,
  splitClip,
} from './clip-engine';
import type { AudioClip, ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';

const videoAsset = (id: string, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  durationMs: 2_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  origin: 'project',
});

const sessionVideoAsset = (id: string, sessionId = 'session-1'): MediaAsset => ({
  ...videoAsset(id),
  fileName: null,
  origin: 'session',
  sessionId,
  sessionPath: `${id}.webm`,
});

const visual = (
  id: string,
  kind: 'screen' | 'video' | 'webcam',
  assetId: string,
  overrides: Partial<VisualClip> = {},
): VisualClip => ({
  id,
  kind,
  name: id,
  assetId,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: kind === 'screen' ? 0 : 1,
  trackId: `${id}-track`,
  groupId: 'recording-segment',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  crop: kind === 'webcam' ? { x: 0.1, y: 0.2, width: 0.7, height: 0.6 } : undefined,
  appearance: createDefaultClipAppearance(kind === 'webcam' ? 'webcam' : kind),
  isMirrored: false,
  isMirroredY: false,
  ...(kind === 'webcam' ? { cameraLayoutPreset: 'custom' as const, cameraFramingPreset: 'custom' as const } : {}),
  ...overrides,
});

const audio = (assetId: string): AudioClip => ({
  id: 'audio',
  kind: 'audio',
  name: 'audio',
  assetId,
  role: 'microphone',
  volume: 83,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 2,
  groupId: 'recording-segment',
});

const compositionFixture = (): ClipComposition => {
  const assets = [videoAsset('screen-asset'), videoAsset('camera-asset'), videoAsset('audio-asset', 'audio')];
  return createComposition(assets, [
    visual('screen', 'screen', 'screen-asset', { trackId: 'screen-track' }),
    visual('camera', 'webcam', 'camera-asset', {
      trackId: 'camera-track',
      transform: { x: 0.65, y: 0.62, width: 0.25, height: 0.3 },
      cameraLayoutPreset: 'custom',
      cameraFramingPreset: 'custom',
    }),
    audio('audio-asset'),
  ]);
};

const ungroupedSessionComposition = (screenSession = 'session-1', cameraSession = 'session-1') =>
  createComposition(
    [sessionVideoAsset('screen-asset', screenSession), sessionVideoAsset('camera-asset', cameraSession)],
    [
      visual('screen', 'screen', 'screen-asset', { groupId: undefined, trackId: 'screen-track' }),
      visual('camera', 'webcam', 'camera-asset', {
        groupId: undefined,
        trackId: 'camera-track',
        transform: { x: 0.65, y: 0.62, width: 0.25, height: 0.3 },
      }),
    ],
  );

describe('camera layout engine operations', () => {
  it('mutates only the camera and linked screen atomically for a split layout', () => {
    const composition = compositionFixture();
    const beforeAudio = composition.clips.find((clip): clip is AudioClip => clip.kind === 'audio');
    const beforeScreen = composition.clips.find((clip): clip is VisualClip => clip.id === 'screen');
    const next = setCameraLayout(composition, 'camera', 'split-right');
    const nextScreen = next.clips.find((clip): clip is VisualClip => clip.id === 'screen');

    expect(next).not.toBe(composition);
    expect(next.clips.find((clip) => clip.id === 'camera')).toMatchObject({
      transform: { x: 0.5, y: 0, width: 0.5, height: 1 },
      crop: undefined,
      cameraLayoutPreset: 'split-right',
      cameraFramingPreset: 'fill',
    });
    expect(nextScreen?.transform).toEqual({
      x: 0,
      y: 0,
      width: 0.5,
      height: 1,
    });
    expect(next.clips.find((clip) => clip.kind === 'audio')).toEqual(beforeAudio);
    expect(nextScreen?.appearance).toEqual(beforeScreen?.appearance);
    expect(nextScreen?.crop).toEqual(beforeScreen?.crop);
  });

  it('sets framing without changing transform or any linked clip', () => {
    const composition = compositionFixture();
    const before = composition.clips.map((clip) => ({ id: clip.id, clip: JSON.parse(JSON.stringify(clip)) }));
    const next = setCameraFraming(composition, 'camera', 'circle');
    const camera = next.clips.find((clip) => clip.id === 'camera') as VisualClip;

    expect(camera.transform).toEqual({ x: 0.65, y: 0.62, width: 0.25, height: 0.3 });
    expect(camera.crop).toBeUndefined();
    expect(camera.cameraFramingPreset).toBe('circle');
    expect(next.clips.find((clip) => clip.id === 'screen')).toEqual(before.find(({ id }) => id === 'screen')?.clip);
    expect(next.clips.find((clip) => clip.id === 'audio')).toEqual(before.find(({ id }) => id === 'audio')?.clip);
  });

  it('adjusts the camera share and complementary screen area for a split', () => {
    const split = setCameraLayout(compositionFixture(), 'camera', 'split-right');
    const beforeAudio = split.clips.find((clip): clip is AudioClip => clip.kind === 'audio');
    const next = setCameraSplitRatio(split, 'camera', 0.7);

    const camera = next.clips.find((clip): clip is VisualClip => clip.id === 'camera');
    expect(camera).toMatchObject({
      cameraSplitRatio: 0.7,
      cameraLayoutPreset: 'split-right',
    });
    expect(camera?.transform.x).toBeCloseTo(0.3);
    expect(camera?.transform.width).toBeCloseTo(0.7);
    const screen = next.clips.find((clip): clip is VisualClip => clip.id === 'screen');
    expect(screen?.transform.width).toBeCloseTo(0.3);
    expect(next.clips.find((clip) => clip.kind === 'audio')).toEqual(beforeAudio);
  });

  it('adds background spacing to both split regions and protects the layout from position edits', () => {
    const split = setCameraLayout(compositionFixture(), 'camera', 'split-left');
    const padded = setCameraSplitPadding(split, 'camera', 0.04);
    const camera = padded.clips.find((clip): clip is VisualClip => clip.id === 'camera')!;
    const screen = padded.clips.find((clip): clip is VisualClip => clip.id === 'screen')!;

    expect(camera.cameraSplitPadding).toBe(0.04);
    expect(camera.transform).toEqual({ x: 0.04, y: 0.04, width: 0.42, height: 0.92 });
    expect(screen.transform).toEqual({ x: 0.54, y: 0.04, width: 0.42, height: 0.92 });
    expect(setTransform(padded, 'camera', camera.transform).clips.find((clip) => clip.id === 'camera')).toEqual(camera);
    const moved = setTransform(padded, 'camera', { ...camera.transform, x: 0.05 });
    const movedCamera = moved.clips.find((clip): clip is VisualClip => clip.id === 'camera');
    const movedScreen = moved.clips.find((clip): clip is VisualClip => clip.id === 'screen');
    expect(movedCamera).toMatchObject({ cameraLayoutPreset: 'split-left' });
    expect(movedCamera?.cameraSplitRatio).toBeCloseTo(camera.cameraSplitRatio ?? 0.5);
    expect(movedCamera?.cameraSplitPadding).toBeCloseTo(camera.cameraSplitPadding ?? 0.04);
    expect(movedCamera?.transform.x).toBeCloseTo(camera.transform.x);
    expect(movedCamera?.transform.y).toBeCloseTo(camera.transform.y);
    expect(movedCamera?.transform.width).toBeCloseTo(camera.transform.width);
    expect(movedCamera?.transform.height).toBeCloseTo(camera.transform.height);
    expect(movedScreen?.transform.x).toBeCloseTo(screen.transform.x);
    expect(movedScreen?.transform.y).toBeCloseTo(screen.transform.y);
    expect(movedScreen?.transform.width).toBeCloseTo(screen.transform.width);
    expect(movedScreen?.transform.height).toBeCloseTo(screen.transform.height);
  });

  it('converts a split-camera resize into ratio and padding while updating the linked screen', () => {
    const split = setCameraLayout(compositionFixture(), 'camera', 'split-right');
    const beforeAudio = split.clips.find((clip): clip is AudioClip => clip.kind === 'audio');
    const resized = setTransform(split, 'camera', {
      x: 0.64,
      y: 0.03,
      width: 0.33,
      height: 0.94,
    });
    const camera = resized.clips.find((clip): clip is VisualClip => clip.id === 'camera');
    const screen = resized.clips.find((clip): clip is VisualClip => clip.id === 'screen');

    expect(camera).toMatchObject({
      cameraLayoutPreset: 'split-right',
      cameraFramingPreset: 'fill',
    });
    expect(camera?.cameraSplitRatio).toBeCloseTo(0.39);
    expect(camera?.cameraSplitPadding).toBeCloseTo(0.03);
    expect(camera?.transform.x).toBeCloseTo(0.64);
    expect(camera?.transform.y).toBeCloseTo(0.03);
    expect(camera?.transform.width).toBeCloseTo(0.33);
    expect(camera?.transform.height).toBeCloseTo(0.94);
    expect(screen?.transform.x).toBeCloseTo(0.03);
    expect(screen?.transform.y).toBeCloseTo(0.03);
    expect(screen?.transform.width).toBeCloseTo(0.55);
    expect(screen?.transform.height).toBeCloseTo(0.94);
    expect(resized.clips.find((clip) => clip.kind === 'audio')).toEqual(beforeAudio);
  });

  it('requires a linked screen for split layouts and leaves the composition untouched on failure', () => {
    const composition = compositionFixture();
    const detached = createComposition(
      composition.assets,
      composition.clips.filter((clip) => clip.id !== 'screen').map((clip) => ({ ...clip, groupId: undefined })),
      composition.keyboardCaptionSessions,
    );

    expect(() => setCameraLayout(detached, 'camera', 'split-left')).toThrow(CompositionEngineError);
    expect(detached.clips.find((clip) => clip.id === 'camera')).toMatchObject({
      transform: { x: 0.65, y: 0.62, width: 0.25, height: 0.3 },
      cameraLayoutPreset: 'custom',
      cameraFramingPreset: 'custom',
    });
  });

  it('infers and persists a same-session screen partner atomically for an ungrouped split', () => {
    const composition = ungroupedSessionComposition();
    expect(composition.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'screen-asset', origin: 'session', sessionId: 'session-1' }),
        expect.objectContaining({ id: 'camera-asset', origin: 'session', sessionId: 'session-1' }),
      ]),
    );
    const beforeAudio = audio('unused-audio-asset');
    const overlayAsset = videoAsset('overlay-asset');
    const overlay = visual('overlay', 'video', overlayAsset.id, {
      groupId: undefined,
      trackId: 'overlay-track',
      order: 3,
      transform: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    });
    const withUnchangedLayers = createComposition(
      [...composition.assets, videoAsset('unused-audio-asset', 'audio'), overlayAsset],
      [...composition.clips, { ...beforeAudio, groupId: undefined }, overlay],
    );
    const before = JSON.parse(JSON.stringify(withUnchangedLayers)) as ClipComposition;
    const originalAudio = withUnchangedLayers.clips.find((clip): clip is AudioClip => clip.kind === 'audio');
    const originalOverlay = withUnchangedLayers.clips.find((clip): clip is VisualClip => clip.id === 'overlay');

    const next = setCameraLayout(withUnchangedLayers, 'camera', 'split-right');
    const camera = next.clips.find((clip): clip is VisualClip => clip.id === 'camera');
    const screen = next.clips.find((clip): clip is VisualClip => clip.id === 'screen');

    expect(camera?.groupId).toBeTruthy();
    expect(screen?.groupId).toBe(camera?.groupId);
    expect(camera).toMatchObject({
      transform: { x: 0.5, y: 0, width: 0.5, height: 1 },
      crop: undefined,
      cameraLayoutPreset: 'split-right',
      cameraFramingPreset: 'fill',
    });
    expect(screen?.transform).toEqual({ x: 0, y: 0, width: 0.5, height: 1 });
    expect(next.clips.find((clip) => clip.kind === 'audio')).toEqual(originalAudio);
    expect(next.clips.find((clip) => clip.id === 'overlay')).toEqual(originalOverlay);
    expect(withUnchangedLayers).toEqual(before);

    let id = 0;
    const split = splitClip(next, 'camera', 400, () => `generated-${++id}`);
    const leftCamera = split.clips.find(
      (clip): clip is VisualClip => clip.kind === 'webcam' && clip.timelineStartMs === 0,
    );
    const rightCamera = split.clips.find(
      (clip): clip is VisualClip => clip.kind === 'webcam' && clip.timelineStartMs === 400,
    );
    const leftScreen = split.clips.find(
      (clip): clip is VisualClip => clip.kind === 'screen' && clip.timelineStartMs === 0,
    );
    const rightScreen = split.clips.find(
      (clip): clip is VisualClip => clip.kind === 'screen' && clip.timelineStartMs === 400,
    );

    expect(leftCamera?.groupId).toBe(leftScreen?.groupId);
    expect(rightCamera?.groupId).toBe(rightScreen?.groupId);
    expect(leftCamera?.groupId).not.toBe(rightCamera?.groupId);
    expect(split.clips.find((clip) => clip.kind === 'audio')).toEqual(originalAudio);
    expect(split.clips.find((clip) => clip.id === 'overlay')).toEqual(originalOverlay);
  });

  it('supports a unique overlapping screen fragment without creating an invalid timing group', () => {
    const cameraGroupId = 'legacy-camera-audio-group';
    const composition = createComposition(
      [sessionVideoAsset('screen-asset'), sessionVideoAsset('camera-asset'), videoAsset('audio-asset', 'audio')],
      [
        visual('screen', 'screen', 'screen-asset', {
          groupId: undefined,
          timelineDurationMs: 2_573,
          sourceInMs: 7_875,
          sourceDurationMs: 2_573,
        }),
        visual('camera', 'webcam', 'camera-asset', {
          groupId: cameraGroupId,
          timelineDurationMs: 10_810,
          sourceDurationMs: 10_810,
        }),
        {
          ...audio('audio-asset'),
          groupId: cameraGroupId,
          timelineDurationMs: 10_810,
          sourceDurationMs: 10_810,
        },
      ],
    );
    const originalAudio = composition.clips.find((clip): clip is AudioClip => clip.kind === 'audio');

    const split = setCameraLayout(composition, 'camera', 'split-left');
    const splitCamera = split.clips.find((clip): clip is VisualClip => clip.id === 'camera');
    const splitScreen = split.clips.find((clip): clip is VisualClip => clip.id === 'screen');
    expect(splitCamera?.groupId).toBe(cameraGroupId);
    expect(splitScreen?.groupId).toBeUndefined();
    expect(splitCamera?.transform).toEqual({ x: 0, y: 0, width: 0.5, height: 1 });
    expect(splitScreen?.transform).toEqual({ x: 0.5, y: 0, width: 0.5, height: 1 });
    expect(split.clips.find((clip) => clip.kind === 'audio')).toEqual(originalAudio);

    const floating = setCameraLayout(split, 'camera', 'floating-top-left');
    expect(floating.clips.find((clip): clip is VisualClip => clip.id === 'screen')?.transform).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    expect(floating.clips.find((clip) => clip.kind === 'audio')).toEqual(originalAudio);
  });

  it.each([
    ['different sessions', ungroupedSessionComposition('session-screen', 'session-camera')],
    [
      'ambiguous screen candidates',
      createComposition(
        [sessionVideoAsset('screen-a-asset'), sessionVideoAsset('screen-b-asset'), sessionVideoAsset('camera-asset')],
        [
          visual('screen-a', 'screen', 'screen-a-asset', { groupId: undefined, trackId: 'screen-a-track' }),
          visual('screen-b', 'screen', 'screen-b-asset', { groupId: undefined, trackId: 'screen-b-track' }),
          visual('camera', 'webcam', 'camera-asset', { groupId: undefined, trackId: 'camera-track' }),
        ],
      ),
    ],
  ])('rejects a split when there is no unique compatible screen (%s)', (_reason, composition) => {
    const before = JSON.parse(JSON.stringify(composition)) as ClipComposition;

    expect(() => setCameraLayout(composition, 'camera', 'split-left')).toThrow(CompositionEngineError);
    expect(composition).toEqual(before);
  });

  it('marks manual camera transform and crop edits as custom presets', () => {
    const composition = setCameraLayout(compositionFixture(), 'camera', 'floating-bottom-right');
    const transformed = setTransform(composition, 'camera', { x: 0.2, y: 0.3, width: 0.4, height: 0.25 });
    const cropped = setCrop(transformed, 'camera', { x: 0.1, y: 0.1, width: 0.8, height: 0.7 });
    const camera = cropped.clips.find((clip) => clip.id === 'camera') as VisualClip;

    expect(camera.cameraLayoutPreset).toBe('custom');
    expect(camera.cameraFramingPreset).toBe('custom');
    expect(camera.transform).toEqual({ x: 0.2, y: 0.3, width: 0.4, height: 0.25 });
    expect(camera.crop).toEqual({ x: 0.1, y: 0.1, width: 0.8, height: 0.7 });
  });

  it('inherits layout and framing on both split fragments, then keeps later changes independent', () => {
    const initial = setCameraLayout(compositionFixture(), 'camera', 'split-right');
    let id = 0;
    const split = splitClip(initial, 'camera', 400, () => `generated-${++id}`);
    const leftCamera = split.clips.find((clip) => clip.kind === 'webcam' && clip.timelineStartMs === 0) as VisualClip;
    const rightCamera = split.clips.find(
      (clip) => clip.kind === 'webcam' && clip.timelineStartMs === 400,
    ) as VisualClip;
    const leftScreen = split.clips.find((clip) => clip.kind === 'screen' && clip.timelineStartMs === 0) as VisualClip;
    const rightScreen = split.clips.find(
      (clip) => clip.kind === 'screen' && clip.timelineStartMs === 400,
    ) as VisualClip;

    expect(leftCamera).toMatchObject({ cameraLayoutPreset: 'split-right', cameraFramingPreset: 'fill' });
    expect(rightCamera).toMatchObject({ cameraLayoutPreset: 'split-right', cameraFramingPreset: 'fill' });
    expect(leftCamera.transform).toEqual(rightCamera.transform);
    expect(leftScreen.transform).toEqual(rightScreen.transform);
    expect(leftCamera.groupId).not.toBe(rightCamera.groupId);

    const changed = setCameraLayout(split, rightCamera.id, 'split-top');
    expect(changed.clips.find((clip) => clip.id === leftCamera.id)).toMatchObject({
      transform: { x: 0.5, y: 0, width: 0.5, height: 1 },
      cameraLayoutPreset: 'split-right',
    });
    const changedLeftScreen = changed.clips.find((clip): clip is VisualClip => clip.id === leftScreen.id);
    const changedRightScreen = changed.clips.find((clip): clip is VisualClip => clip.id === rightScreen.id);
    expect(changedLeftScreen?.transform).toEqual({
      x: 0,
      y: 0,
      width: 0.5,
      height: 1,
    });
    expect(changed.clips.find((clip) => clip.id === rightCamera.id)).toMatchObject({
      transform: { x: 0, y: 0, width: 1, height: 0.5 },
      cameraLayoutPreset: 'split-top',
      cameraFramingPreset: 'fill',
    });
    expect(changedRightScreen?.transform).toEqual({
      x: 0,
      y: 0.5,
      width: 1,
      height: 0.5,
    });
  });
});
