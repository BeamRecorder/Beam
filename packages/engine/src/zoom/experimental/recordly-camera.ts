import type {
  CompositionCameraInputs,
  CompositionCameraEvaluator,
  CameraSample,
  CameraCheckpointReuse,
} from '../composition-camera-types';
import type { ZoomElement } from '../zoom-types';
import type { ZoomRegion } from '../recordly/types';
import type { CameraComposeRequest, RecordlyCameraState } from './recordly-camera-types';
import { createCursorFollowCameraState } from '../recordly/videoPlayback/cursorFollowCamera';
import { createSpringState } from '../recordly/videoPlayback/motionSmoothing';
import {
  createMotionBlurState,
  applyZoomTransform,
  computeZoomTransform,
} from '../recordly/videoPlayback/zoomTransform';
import { computeCameraTransform } from '../recordly/videoPlayback/cameraTransform';
import {
  resolvePreviewMotionMode,
  shouldComposePreviewFrame,
  resolveSceneZoomTarget,
} from '../recordly/videoPlayback/sceneMotion';
import { findDominantRegion } from '../recordly/videoPlayback/zoomRegionUtils';
import { mapTimelineTimeToSourceTime } from '../recordly/types';
import { getFrameMotionSample } from '../recordly/videoPlayback/frameMotionSample';
import { normalizeCursorTelemetry } from '../recordly/timeline/zoomSuggestionUtils';
import { buildLoopedCursorTelemetry } from '../recordly/videoPlayback/cursorLoopTelemetry';
import { prepareSplitZoomContinuity } from '../zoom-split-continuity';
import { normalizeRecordlyZoom } from '../recordly-settings-schema.js';
import { recordlyTelemetry } from './recordly-inputs';
import { FULL_EXPERIMENTAL_GEOMETRY } from './experimental-camera-geometry';

const liveStates = new WeakMap<CompositionCameraEvaluator, () => RecordlyCameraState>();
const identity = (): CameraSample => ({ scale: 1, focus: { cx: 0.5, cy: 0.5 } });
function createState(): RecordlyCameraState {
  const applied = { scale: 1, x: 0, y: 0 };
  return {
    applied,
    follow: createCursorFollowCameraState(),
    scale: createSpringState(1),
    x: createSpringState(0.5),
    y: createSpringState(0.5),
    blur: createMotionBlurState(),
    panFilter: { velocity: { x: 0, y: 0 }, kernelSize: 13, offset: 0 },
    zoomFilter: { center: { x: 0, y: 0 }, strength: 0, innerRadius: 0, radius: -1 },
    container: {
      scale: {
        set: (value) => {
          applied.scale = value;
        },
      },
      position: {
        set: (x, y) => {
          applied.x = x;
          applied.y = y;
        },
      },
    },
    timeMs: null,
    resetFollowOnResume: false,
    sample: identity(),
  };
}

/** The upstream functions own all camera and filter math. This adapter owns only Beam clocks and representation. */
export function createRecordlyCamera(
  inputs: CompositionCameraInputs,
  reuse?: CameraCheckpointReuse,
): CompositionCameraEvaluator {
  const settings = normalizeRecordlyZoom(inputs.autoFollow?.recordly);
  const elements = prepareSplitZoomContinuity(
    inputs.zooms
      .filter((zoom) => zoom.enabled !== false && zoom.effect !== 'glass')
      .sort((left, right) => left.startMs - right.startMs),
  ).elements;
  const clips = inputs.recordlyClips ?? [];
  const duration = inputs.sourceDurationMs ?? Number.MAX_SAFE_INTEGER;
  const normalized = normalizeCursorTelemetry(recordlyTelemetry(inputs.telemetry), duration);
  const clipStart = clips.length ? Math.min(...clips.map((clip) => clip.sourceStartMs ?? clip.startMs)) : 0;
  const clipEnd = clips.length
    ? Math.max(
        ...clips.map((clip) => (clip.sourceStartMs ?? clip.startMs) + (clip.endMs - clip.startMs) * (clip.speed ?? 1)),
      )
    : duration;
  const telemetry =
    settings.loopCursor && normalized.length >= 2
      ? buildLoopedCursorTelemetry(normalized, clipEnd, clipStart)
      : normalized;
  const sourceTime = (timeMs: number) =>
    inputs.recordlySourceAt?.(timeMs)?.timeMs ??
    (clips.length ? mapTimelineTimeToSourceTime(timeMs, clips) : (inputs.mapTelemetryTime?.(timeMs) ?? timeMs));
  const geometryAt = (timeMs: number) => inputs.experimentalGeometryAt?.(timeMs) ?? FULL_EXPERIMENTAL_GEOMETRY;
  const viewport = inputs.viewport ?? { width: 1920, height: 1080 };
  const regionsAt = (timeMs: number): ZoomRegion[] => {
    const { mask } = geometryAt(timeMs);
    return elements.map((zoom: ZoomElement) => ({
      ...zoom,
      focus:
        zoom.mode === 'manual' && !zoom.focusSpace
          ? { cx: (zoom.focus.cx - mask.x) / mask.width, cy: (zoom.focus.cy - mask.y) / mask.height }
          : zoom.focus,
      focusSpace: zoom.focusSpace ?? (zoom.mode === 'auto' ? 'source' : 'viewport'),
    }));
  };
  const options = {
    connectZooms: settings.connectZooms,
    zoomInDurationMs: settings.zoomInDurationMs,
    zoomOutDurationMs: settings.zoomOutDurationMs,
    connectedZoomGapMs: settings.connectedZoomGapMs,
    connectedZoomDurationMs: settings.connectedZoomDurationMs,
  };
  const targetAt = (timeMs: number, follow: RecordlyCameraState['follow']) =>
    resolveSceneZoomTarget({
      zoomRegions: regionsAt(timeMs),
      timeMs,
      cursorTimeMs: sourceTime(timeMs),
      ...options,
      zoomClassicMode: settings.zoomClassicMode,
      cursorTelemetry: inputs.autoFollow?.enabled === false ? [] : telemetry,
      cursorFollowCamera: follow,
      sourceCrop: geometryAt(timeMs).crop,
    });
  const advance = (
    state: RecordlyCameraState,
    timeMs: number,
    snap = false,
    frozen = false,
    deltaOverride?: number,
  ): CameraSample => {
    const geometry = geometryAt(timeMs);
    const mask = {
      x: geometry.mask.x * viewport.width,
      y: geometry.mask.y * viewport.height,
      width: geometry.mask.width * viewport.width,
      height: geometry.mask.height * viewport.height,
    };
    const target = targetAt(timeMs, frozen ? createCursorFollowCameraState() : state.follow);
    const delta = deltaOverride ?? (state.timeMs === null ? 1000 / 60 : timeMs - state.timeMs);
    const transform = computeCameraTransform({
      target,
      stageSize: viewport,
      baseMask: mask,
      springScale: state.scale,
      springX: state.x,
      springY: state.y,
      deltaMs: delta,
      snap,
      zoomSmoothness: settings.zoomSmoothness,
      tuning: {
        stiffnessMultiplier: settings.cameraSpringStiffnessMultiplier,
        dampingMultiplier: settings.cameraSpringDampingMultiplier,
        massMultiplier: settings.cameraSpringMassMultiplier,
      },
    });
    const currentSource = inputs.recordlySourceAt?.(timeMs);
    const visibleClip = currentSource ? clips.find((clip) => clip.id === currentSource.clipId) : undefined;
    const frameSample = frozen ? getFrameMotionSample(timeMs, visibleClip ? [visibleClip] : clips) : null;
    // A newly foregrounded/retimed recording must not borrow a different screen's shutter image.
    const previous =
      frameSample &&
      (!currentSource || inputs.recordlySourceAt?.(frameSample.previousTimeMs)?.clipId === currentSource.clipId)
        ? frameSample
        : null;
    const previousTarget = previous
      ? resolveSceneZoomTarget({
          zoomRegions: regionsAt(previous.previousTimeMs),
          timeMs: previous.previousTimeMs,
          cursorTimeMs: inputs.recordlySourceAt ? sourceTime(previous.previousTimeMs) : previous.previousSourceTimeMs,
          ...options,
          zoomClassicMode: settings.zoomClassicMode,
          cursorTelemetry: inputs.autoFollow?.enabled === false ? [] : telemetry,
          cursorFollowCamera: createCursorFollowCameraState(),
          sourceCrop: geometry.crop,
        })
      : null;
    applyZoomTransform({
      cameraContainer: state.container,
      motionBlurFilter: state.panFilter,
      zoomBlurFilter: state.zoomFilter,
      stageSize: viewport,
      baseMask: mask,
      zoomScale: target.scale,
      zoomProgress: target.progress,
      focusX: target.focus.cx,
      focusY: target.focus.cy,
      isPlaying: !frozen,
      motionBlurAmount: settings.zoomMotionBlur,
      motionBlurTuning: settings.zoomMotionBlurTuning,
      transformOverride: transform,
      motionBlurState: state.blur,
      frameTimeMs: timeMs,
      ...(frozen
        ? {
            motionSample:
              previous && previousTarget
                ? {
                    previousTransform: computeZoomTransform({
                      stageSize: viewport,
                      baseMask: mask,
                      zoomScale: previousTarget.scale,
                      zoomProgress: previousTarget.progress,
                      focusX: previousTarget.focus.cx,
                      focusY: previousTarget.focus.cy,
                    }),
                    deltaMs: previous.deltaMs,
                  }
                : null,
          }
        : {}),
    });
    state.timeMs = timeMs;
    const sample: CameraSample = {
      scale: transform.scale,
      focus:
        viewport.width > 0 && viewport.height > 0
          ? {
              cx: (viewport.width / 2 - transform.x) / (viewport.width * transform.scale),
              cy: (viewport.height / 2 - transform.y) / (viewport.height * transform.scale),
            }
          : { cx: 0.5, cy: 0.5 },
    };
    if (
      transform.scale !== 1 ||
      transform.x !== 0 ||
      transform.y !== 0 ||
      state.zoomFilter.strength > 0 ||
      state.panFilter.velocity.x !== 0 ||
      state.panFilter.velocity.y !== 0
    )
      sample.recordly = {
        transform: { ...transform },
        width: viewport.width,
        height: viewport.height,
        pan: structuredClone(state.panFilter),
        zoom: structuredClone(state.zoomFilter),
      };
    state.sample = sample;
    return structuredClone(sample);
  };
  let live = (reuse?.preserveLive ? liveStates.get(reuse.previous)?.() : undefined) ?? createState(),
    exported = createState(),
    query = createState(),
    queryFrame = -1;
  const fps = Number.isFinite(inputs.frameRate) && inputs.frameRate! > 0 ? inputs.frameRate! : 60,
    step = 1000 / fps;
  const evaluator: CompositionCameraEvaluator = {
    compose(request: CameraComposeRequest) {
      const { timeMs } = request;
      if (request.exporting) return advance(exported, timeMs, settings.zoomClassicMode);
      const changed = live.timeMs === null || Math.abs(timeMs - live.timeMs) > 0.0001;
      const refresh = request.shouldSnapPausedFrame ?? (!request.isPlaying && live.timeMs === null);
      const mode = resolvePreviewMotionMode({
        isPlaying: request.isPlaying,
        isSeeking: request.isSeeking === true,
        shouldSnapPausedFrame: refresh,
        zoomClassicMode: settings.zoomClassicMode,
      });
      const pendingNeutral =
        mode === 'preserve' &&
        changed &&
        live.sample.scale > 1 &&
        findDominantRegion(regionsAt(timeMs), timeMs, options).strength === 0;
      if (
        !shouldComposePreviewFrame({
          motionMode: mode,
          isSeeking: request.isSeeking === true,
          contentTimeChanged: changed,
          shouldSnapPausedFrame: refresh,
          hasPendingNeutralFrame: pendingNeutral,
        })
      )
        return structuredClone(live.sample);
      const frozen = mode === 'snap' && (!request.isPlaying || refresh);
      if (frozen) live.resetFollowOnResume = true;
      else if (mode === 'spring' && live.resetFollowOnResume) {
        live.follow = createCursorFollowCameraState();
        live.resetFollowOnResume = false;
      }
      return advance(live, timeMs, mode === 'snap', frozen);
    },
    sample(requestedMs) {
      const timeMs = Number.isFinite(requestedMs) ? Math.max(0, requestedMs) : 0;
      const frame = Math.floor(timeMs / step + 1e-9),
        remainder = timeMs - frame * step;
      if (remainder > 1e-7) {
        const transient = createState();
        for (let index = 0; index <= frame; index++) advance(transient, index * step, settings.zoomClassicMode);
        return advance(transient, timeMs, settings.zoomClassicMode);
      }
      if (frame < queryFrame) {
        query = createState();
        queryFrame = -1;
      }
      for (let index = queryFrame + 1; index <= frame; index++) advance(query, index * step, settings.zoomClassicMode);
      queryFrame = frame;
      return structuredClone(query.sample);
    },
    invalidate() {
      live = createState();
      exported = createState();
      query = createState();
      queryFrame = -1;
    },
  };
  liveStates.set(evaluator, () => live);
  return evaluator;
}

/** A Beam perspective dispatcher must preserve the same live 2D state when its settings change. */
export function shareRecordlyLiveState(dispatcher: CompositionCameraEvaluator, camera: CompositionCameraEvaluator) {
  const state = liveStates.get(camera);
  if (state) liveStates.set(dispatcher, state);
}
