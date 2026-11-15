// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CameraSample, CompositionCameraInputs } from '../../composition-camera-types';
import type { ZoomElement } from '../../zoom-types';
import type { ClipRegion, CursorTelemetryPoint, ZoomRegion } from '../../recordly/types';
import type { RecordlyZoomSettings } from '../../recordly-settings-types';
import type { ExperimentalGeometry } from '../experimental-camera-types';
import type { CameraComposeRequest } from '../recordly-camera-types';
import { createRecordlyCamera } from '../recordly-camera';
import { normalizeRecordlyZoom } from '../../recordly-settings';
import { mapTimelineTimeToSourceTime } from '../../recordly/types';
import { CURSOR_MOTION_PRESETS } from '../../recordly/cursorMotionPresets';
import { normalizeCursorTelemetry } from '../../recordly/timeline/zoomSuggestionUtils';
import { createCursorFollowCameraState } from '../../recordly/videoPlayback/cursorFollowCamera';
import { createSpringState } from '../../recordly/videoPlayback/motionSmoothing';
import { computeCameraTransform } from '../../recordly/videoPlayback/cameraTransform';
import {
  resolvePreviewMotionMode,
  resolveSceneZoomTarget,
  shouldComposePreviewFrame,
} from '../../recordly/videoPlayback/sceneMotion';
import { findDominantRegion } from '../../recordly/videoPlayback/zoomRegionUtils';
import {
  applyZoomTransform,
  computeZoomTransform,
  createMotionBlurState,
} from '../../recordly/videoPlayback/zoomTransform';
import { getFrameMotionSample } from '../../recordly/videoPlayback/frameMotionSample';
import { buildLoopedCursorTelemetry } from '../../recordly/videoPlayback/cursorLoopTelemetry';

const viewport = { width: 1920, height: 1080 };
const fullGeometry: ExperimentalGeometry = {
  crop: { x: 0, y: 0, width: 1, height: 1 },
  mask: { x: 0, y: 0, width: 1, height: 1 },
};
const cropGeometry: ExperimentalGeometry = {
  crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
  mask: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 },
};
const region: ZoomRegion = {
  id: 'auto',
  startMs: 0,
  endMs: 6000,
  depth: 3,
  mode: 'auto',
  focusSpace: 'source',
  focus: { cx: 0.5, cy: 0.5 },
};
const telemetry: CursorTelemetryPoint[] = [
  { timeMs: 0, cx: 0.1, cy: 0.5 },
  { timeMs: 2000, cx: 0.9, cy: 0.5 },
  { timeMs: 4000, cx: 0.2, cy: 0.8 },
  { timeMs: 6000, cx: 0.8, cy: 0.2 },
];
const fullClip: ClipRegion = { id: 'screen', startMs: 0, endMs: 10000, sourceStartMs: 0, speed: 1 };
const element = (zoom: ZoomRegion): ZoomElement => ({ ...zoom, mode: zoom.mode ?? 'auto', sessionId: 'recording' });

function inputsFor(
  settings: Partial<RecordlyZoomSettings> = {},
  extra: Partial<CompositionCameraInputs> = {},
): CompositionCameraInputs {
  return {
    zooms: [element(region)],
    telemetry,
    viewport,
    frameRate: 60,
    sourceDurationMs: 20000,
    recordlyClips: [fullClip],
    experimentalGeometryAt: () => fullGeometry,
    autoFollow: {
      experimentalZoom: true,
      enabled: true,
      safeZone: 0.5,
      responsiveness: 0.55,
      directionLock: true,
      recordly: normalizeRecordlyZoom(settings),
    },
    ...extra,
  };
}

// Independent orchestration of the actual upstream math, with already-adapted input data.
// Tests supply upstream regions/source clocks explicitly instead of sharing Beam's conversions.
function upstreamCamera({
  regions,
  points = telemetry,
  clips = [fullClip],
  geometry = fullGeometry,
  settings = normalizeRecordlyZoom({}),
  sourceClock = (timeMs: number) => mapTimelineTimeToSourceTime(timeMs, clips),
}: {
  regions: ZoomRegion[];
  points?: CursorTelemetryPoint[];
  clips?: ClipRegion[];
  geometry?: ExperimentalGeometry;
  settings?: RecordlyZoomSettings;
  sourceClock?: (timeMs: number) => number;
}) {
  const mask = {
    x: geometry.mask.x * viewport.width,
    y: geometry.mask.y * viewport.height,
    width: geometry.mask.width * viewport.width,
    height: geometry.mask.height * viewport.height,
  };
  const springs = {
    springScale: createSpringState(1),
    springX: createSpringState(0.5),
    springY: createSpringState(0.5),
  };
  let follow = createCursorFollowCameraState(),
    resetFollowOnResume = false;
  let previousTime: number | null = null;
  const transform = { scale: 1, x: 0, y: 0 };
  const pan = { velocity: { x: 0, y: 0 }, kernelSize: 13, offset: 0 };
  const zoom = { center: { x: 0, y: 0 }, strength: 0, innerRadius: 0, radius: -1 };
  const blur = createMotionBlurState();
  const options = {
    connectZooms: settings.connectZooms,
    zoomInDurationMs: settings.zoomInDurationMs,
    zoomOutDurationMs: settings.zoomOutDurationMs,
    connectedZoomGapMs: settings.connectedZoomGapMs,
    connectedZoomDurationMs: settings.connectedZoomDurationMs,
  };
  const targetAt = (timeMs: number, camera = follow, sourceTime = sourceClock(timeMs)) =>
    resolveSceneZoomTarget({
      ...options,
      zoomRegions: regions,
      timeMs,
      cursorTimeMs: sourceTime,
      cursorFollowCamera: camera,
      cursorTelemetry: points,
      sourceCrop: geometry.crop,
      zoomClassicMode: settings.zoomClassicMode,
    });
  const current = () => structuredClone({ transform, pan, zoom });
  return (request: CameraComposeRequest) => {
    const time = request.timeMs;
    const changed = previousTime === null || Math.abs(time - previousTime) > 0.0001;
    const mode = request.exporting
      ? settings.zoomClassicMode
        ? 'snap'
        : 'spring'
      : resolvePreviewMotionMode({
          isPlaying: request.isPlaying,
          isSeeking: request.isSeeking === true,
          shouldSnapPausedFrame: request.shouldSnapPausedFrame === true,
          zoomClassicMode: settings.zoomClassicMode,
        });
    const pendingNeutral =
      mode === 'preserve' &&
      changed &&
      transform.scale > 1 &&
      findDominantRegion(regions, time, options).strength === 0;
    if (
      !request.exporting &&
      !shouldComposePreviewFrame({
        motionMode: mode,
        isSeeking: request.isSeeking,
        contentTimeChanged: changed,
        shouldSnapPausedFrame: request.shouldSnapPausedFrame === true,
        hasPendingNeutralFrame: pendingNeutral,
      })
    )
      return current();
    const frozen =
      !request.exporting && mode === 'snap' && (!request.isPlaying || request.shouldSnapPausedFrame === true);
    if (frozen) resetFollowOnResume = true;
    else if (mode === 'spring' && resetFollowOnResume) {
      follow = createCursorFollowCameraState();
      resetFollowOnResume = false;
    }
    const target = targetAt(time, frozen ? createCursorFollowCameraState() : follow);
    const camera = computeCameraTransform({
      target,
      stageSize: viewport,
      baseMask: mask,
      ...springs,
      deltaMs: previousTime === null ? 1000 / 60 : time - previousTime,
      snap: mode === 'snap',
      zoomSmoothness: settings.zoomSmoothness,
      tuning: {
        stiffnessMultiplier: settings.cameraSpringStiffnessMultiplier,
        dampingMultiplier: settings.cameraSpringDampingMultiplier,
        massMultiplier: settings.cameraSpringMassMultiplier,
      },
    });
    const previous = frozen ? getFrameMotionSample(time, clips) : null;
    const previousTarget = previous
      ? targetAt(previous.previousTimeMs, createCursorFollowCameraState(), previous.previousSourceTimeMs)
      : null;
    applyZoomTransform({
      cameraContainer: {
        scale: {
          set: (scale) => {
            transform.scale = scale;
          },
        },
        position: {
          set: (x, y) => {
            transform.x = x;
            transform.y = y;
          },
        },
      },
      motionBlurFilter: pan,
      zoomBlurFilter: zoom,
      motionBlurState: blur,
      stageSize: viewport,
      baseMask: mask,
      zoomScale: target.scale,
      zoomProgress: target.progress,
      focusX: target.focus.cx,
      focusY: target.focus.cy,
      transformOverride: camera,
      frameTimeMs: time,
      isPlaying: request.isPlaying || request.exporting === true,
      motionBlurAmount: settings.zoomMotionBlur,
      motionBlurTuning: settings.zoomMotionBlurTuning,
      ...(frozen
        ? {
            motionSample:
              previous && previousTarget
                ? {
                    deltaMs: previous.deltaMs,
                    previousTransform: computeZoomTransform({
                      stageSize: viewport,
                      baseMask: mask,
                      zoomScale: previousTarget.scale,
                      zoomProgress: previousTarget.progress,
                      focusX: previousTarget.focus.cx,
                      focusY: previousTarget.focus.cy,
                    }),
                  }
                : null,
          }
        : {}),
    });
    previousTime = time;
    return current();
  };
}

function expectParity(actual: CameraSample, expected: ReturnType<ReturnType<typeof upstreamCamera>>) {
  expect(actual.scale).toBeCloseTo(expected.transform.scale, 11);
  expect(actual.focus.cx).toBeCloseTo((960 - expected.transform.x) / (1920 * expected.transform.scale), 11);
  expect(actual.focus.cy).toBeCloseTo((540 - expected.transform.y) / (1080 * expected.transform.scale), 11);
  const moving = expected.transform.scale !== 1 || expected.transform.x !== 0 || expected.transform.y !== 0;
  const blurred = expected.pan.velocity.x !== 0 || expected.pan.velocity.y !== 0 || expected.zoom.strength !== 0;
  if (moving || blurred) {
    expect(actual.recordly, 'camera/blur data must survive even when the current transform is identity').toBeDefined();
    expect(actual.recordly!.transform).toEqual(expected.transform);
    expect(actual.recordly!.pan).toEqual(expected.pan);
    expect(actual.recordly!.zoom).toEqual(expected.zoom);
  }
}

describe('Recordly Beam adapter and direct upstream transport', () => {
  it.each([30, 60, 144])('matches sequential export at %s fps including the release boundary', (fps) => {
    const camera = createRecordlyCamera(inputsFor({}, { frameRate: fps }));
    const upstream = upstreamCamera({ regions: [region] });
    for (let frame = 0; frame <= 6 * fps; frame++) {
      const request = { timeMs: (frame * 1000) / fps, isPlaying: true, exporting: true };
      expectParity(camera.compose!(request), upstream(request));
    }
  });

  it('composes actual irregular timestamps without re-simulating an ideal frame grid', () => {
    const camera = createRecordlyCamera(inputsFor());
    const upstream = upstreamCamera({ regions: [region] });
    for (const timeMs of [0, 17, 33.3, 80, 200, 201, 567, 2019.2, 2035.8, 2099, 2100, 2200]) {
      const request = { timeMs, isPlaying: true, exporting: true };
      expectParity(camera.compose!(request), upstream(request));
    }
  });

  it('starts a mid-recording export at the upstream first-frame pose without inventing preroll', () => {
    const camera = createRecordlyCamera(inputsFor());
    const upstream = upstreamCamera({ regions: [region] });
    for (const timeMs of [4000, 4017, 4034]) {
      const request = { timeMs, isPlaying: true, exporting: true };
      expectParity(camera.compose!(request), upstream(request));
    }
  });

  it('preserves plain pause and repeated frames, defers seeks, then snaps and resumes from that frame', () => {
    const camera = createRecordlyCamera(inputsFor());
    const upstream = upstreamCamera({ regions: [region] });
    const requests: CameraComposeRequest[] = [
      { timeMs: 0, isPlaying: true },
      { timeMs: 2000, isPlaying: true },
      { timeMs: 2017, isPlaying: true },
      { timeMs: 2017, isPlaying: false, shouldSnapPausedFrame: false },
      { timeMs: 2017, isPlaying: false, shouldSnapPausedFrame: false },
      { timeMs: 4000, isPlaying: false, isSeeking: true, shouldSnapPausedFrame: true },
      { timeMs: 4000, isPlaying: false, isSeeking: false, shouldSnapPausedFrame: true },
      { timeMs: 4000, isPlaying: false, shouldSnapPausedFrame: false },
      { timeMs: 4017, isPlaying: true },
      { timeMs: 4034, isPlaying: true },
      { timeMs: 4034, isPlaying: true },
    ];
    for (const request of requests) expectParity(camera.compose!(request), upstream(request));
  });

  it('keeps export transport isolated from paused preview and query sampling', () => {
    const camera = createRecordlyCamera(inputsFor());
    const upstream = upstreamCamera({ regions: [region] });
    for (const timeMs of [0, 2000, 2017, 2100]) {
      camera.sample(4000);
      camera.compose!({ timeMs: 4000, isPlaying: false, shouldSnapPausedFrame: true });
      const request = { timeMs, isPlaying: true, exporting: true };
      expectParity(camera.compose!(request), upstream(request));
    }
    camera.invalidate();
    const fresh = createRecordlyCamera(inputsFor());
    expect(camera.compose!({ timeMs: 4017, isPlaying: true })).toEqual(
      fresh.compose!({ timeMs: 4017, isPlaying: true }),
    );
  });

  it.each([
    { zoomInDurationMs: 640, zoomOutDurationMs: 930, zoomSmoothness: 0.8 },
    { ...CURSOR_MOTION_PRESETS.smooth },
    { zoomClassicMode: true },
    { connectZooms: false },
    { connectedZoomGapMs: 20 },
    { connectedZoomDurationMs: 60 },
  ])('honors the upstream camera configuration %j', (changes) => {
    const settings = normalizeRecordlyZoom(changes);
    const regions: ZoomRegion[] = [
      { ...region, endMs: 2000 },
      { ...region, id: 'next', startMs: 2600, endMs: 6000, depth: 5 },
    ];
    const camera = createRecordlyCamera(inputsFor(settings, { zooms: regions.map(element) }));
    const upstream = upstreamCamera({ regions, settings });
    for (const timeMs of [0, 100, 200, 1000, 1983, 2000, 2017, 2150, 2500, 2600, 2617, 4000]) {
      const request = { timeMs, isPlaying: true, exporting: true };
      expectParity(camera.compose!(request), upstream(request));
    }
  });

  it('keeps the authored focus when Beam cursor follow is disabled', () => {
    const input = inputsFor();
    input.autoFollow = { ...input.autoFollow!, enabled: false };
    const camera = createRecordlyCamera(input);
    const upstream = upstreamCamera({ regions: [region], points: [] });
    const request = { timeMs: 4000, isPlaying: false, shouldSnapPausedFrame: true };
    expectParity(camera.compose!(request), upstream(request));
  });

  it('excludes disabled camera effects and glass highlights from the reference camera', () => {
    const ignored: ZoomElement[] = [
      { ...element(region), id: 'off', depth: 6, enabled: false },
      { ...element(region), id: 'glass', depth: 6, effect: 'glass' },
    ];
    const camera = createRecordlyCamera(inputsFor({}, { zooms: ignored }));
    const upstream = upstreamCamera({ regions: [] });
    for (const timeMs of [0, 200, 4000]) {
      const request = { timeMs, isPlaying: true, exporting: true };
      expectParity(camera.compose!(request), upstream(request));
    }
  });
});

describe('Recordly Beam coordinates and source clocks', () => {
  it.each([
    ['manual', 'source'],
    ['auto', 'viewport'],
    ['manual', 'viewport'],
  ] as const)('keeps explicit %s/%s coordinates', (mode, focusSpace) => {
    const zoom: ZoomRegion = { ...region, mode, focusSpace, focus: { cx: 0.7, cy: 0.45 } };
    const camera = createRecordlyCamera(
      inputsFor({}, { zooms: [element(zoom)], experimentalGeometryAt: () => cropGeometry }),
    );
    const upstream = upstreamCamera({ regions: [zoom], geometry: cropGeometry });
    const request = { timeMs: 4000, isPlaying: false, shouldSnapPausedFrame: true };
    expectParity(camera.compose!(request), upstream(request));
  });

  it('converts a legacy manual Beam canvas focus exactly once', () => {
    const expected: ZoomRegion = { ...region, mode: 'manual', focusSpace: 'viewport', focus: { cx: 0.7, cy: 0.45 } };
    const legacy: ZoomElement = {
      ...element(expected),
      focusSpace: undefined,
      focus: {
        cx: cropGeometry.mask.x + expected.focus.cx * cropGeometry.mask.width,
        cy: cropGeometry.mask.y + expected.focus.cy * cropGeometry.mask.height,
      },
    };
    const camera = createRecordlyCamera(inputsFor({}, { zooms: [legacy], experimentalGeometryAt: () => cropGeometry }));
    const upstream = upstreamCamera({ regions: [expected], geometry: cropGeometry });
    const request = { timeMs: 4000, isPlaying: false, shouldSnapPausedFrame: true };
    expectParity(camera.compose!(request), upstream(request));
  });

  it('keeps legacy automatic focus in source space and normalizes telemetry before following', () => {
    const zoom = { ...region, focusSpace: undefined };
    const points: CursorTelemetryPoint[] = [
      telemetry[3]!,
      telemetry[1]!,
      telemetry[0]!,
      telemetry[2]!,
      { timeMs: Number.NaN, cx: 0, cy: 0 },
    ];
    const camera = createRecordlyCamera(
      inputsFor({}, { zooms: [element(zoom)], telemetry: points, experimentalGeometryAt: () => cropGeometry }),
    );
    const upstream = upstreamCamera({
      regions: [zoom],
      points: normalizeCursorTelemetry(points, 20000),
      geometry: cropGeometry,
    });
    const request = { timeMs: 4000, isPlaying: false, shouldSnapPausedFrame: true };
    expectParity(camera.compose!(request), upstream(request));
  });

  it('preserves upstream crop epsilon follow instead of retaining the previous edge', () => {
    const points = [
      { timeMs: 0, cx: 0.65, cy: 0.5 },
      { timeMs: 1000, cx: 0.24999975, cy: 0.5 },
    ];
    const camera = createRecordlyCamera(
      inputsFor({}, { telemetry: points, experimentalGeometryAt: () => cropGeometry }),
    );
    const upstream = upstreamCamera({ regions: [region], points, geometry: cropGeometry });
    for (const timeMs of [500, 1000, 1017]) {
      const request = { timeMs, isPlaying: true, exporting: true };
      expectParity(camera.compose!(request), upstream(request));
    }
  });

  it('projects trimmed, sped-up, duplicated and reordered source intervals including fractional timestamps', () => {
    const clips: ClipRegion[] = [
      { id: 'first', startMs: 0, endMs: 2000, sourceStartMs: 8000, speed: 2 },
      { id: 'second', startMs: 3000, endMs: 5000, sourceStartMs: 1000, speed: 0.5 },
      { id: 'repeat', startMs: 5000, endMs: 7000, sourceStartMs: 8000, speed: 2 },
    ];
    const points = Array.from({ length: 121 }, (_, index) => ({
      timeMs: index * 100,
      cx: 0.5 + Math.sin(index / 4) * 0.4,
      cy: 0.5,
    }));
    const zoom = { ...region, endMs: 7000 };
    const camera = createRecordlyCamera(
      inputsFor({}, { recordlyClips: clips, telemetry: points, zooms: [element(zoom)] }),
    );
    const upstream = upstreamCamera({ regions: [zoom], points: normalizeCursorTelemetry(points, 20000), clips });
    for (const timeMs of [0, 200.49, 200.51, 1900, 2000, 2500, 2999, 3000, 4000, 4999.7, 5000, 6000]) {
      const request = { timeMs, isPlaying: false, shouldSnapPausedFrame: true };
      expectParity(camera.compose!(request), upstream(request));
    }
  });

  it('uses the explicit telemetry clock when no clip projection is supplied', () => {
    const sourceClock = (timeMs: number) => 1000 + timeMs * 0.5;
    const camera = createRecordlyCamera(inputsFor({}, { recordlyClips: [], mapTelemetryTime: sourceClock }));
    const upstream = upstreamCamera({ regions: [region], clips: [], sourceClock });
    for (const timeMs of [0, 200, 1500, 3000, 4000]) {
      const request = { timeMs, isPlaying: true, exporting: true };
      expectParity(camera.compose!(request), upstream(request));
    }
  });

  it('applies the upstream cursor loop to a whole recording', () => {
    const settings = normalizeRecordlyZoom({ loopCursor: true });
    const clips = [{ ...fullClip, endMs: 6000 }];
    const camera = createRecordlyCamera(inputsFor(settings, { recordlyClips: clips }));
    const points = buildLoopedCursorTelemetry(normalizeCursorTelemetry(telemetry, 20000), 6000, 0);
    const upstream = upstreamCamera({ regions: [region], settings, clips, points });
    for (const timeMs of [4000, 5000, 5400, 5600, 5800]) {
      const request = { timeMs, isPlaying: false, shouldSnapPausedFrame: true };
      expectParity(camera.compose!(request), upstream(request));
    }
  });

  it('loops a left-trimmed recording in retained source coordinates, as upstream displayed-window trimming does', () => {
    const settings = normalizeRecordlyZoom({ loopCursor: true });
    const clips = [{ ...fullClip, endMs: 6000, sourceStartMs: 10000 }];
    const points = telemetry.map((point) => ({ ...point, timeMs: point.timeMs + 10000 }));
    const camera = createRecordlyCamera(inputsFor(settings, { recordlyClips: clips, telemetry: points }));
    // Upstream useCursorTelemetry computes displayedWindow from source trim regions.
    const looped = buildLoopedCursorTelemetry(normalizeCursorTelemetry(points, 20000), 16000, 10000);
    const upstream = upstreamCamera({ regions: [region], settings, clips, points: looped });
    for (const timeMs of [4000, 5000, 5400, 5600, 5800]) {
      const request = { timeMs, isPlaying: false, shouldSnapPausedFrame: true };
      expectParity(camera.compose!(request), upstream(request));
    }
  });
});
