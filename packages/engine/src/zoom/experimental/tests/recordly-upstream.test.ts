// @vitest-environment node
import { describe, expect, it } from 'vitest';
import reference from './fixtures/reference.json';
import type { CursorTelemetryPoint, ZoomRegion } from '../../recordly/types';
import type { MotionBlurFilter, ZoomBlurFilter } from '../../recordly/render-control-types';
import {
  CURSOR_MOTION_PRESETS,
  getMatchingCursorMotionPresetId,
  isCinematicCursorMotion,
  isCinematicZoomMotion,
  resolveCursorMotionPresetId,
} from '../../recordly/cursorMotionPresets';
import { DEFAULT_ZOOM_MOTION_BLUR_TUNING } from '../../recordly/types';
import { buildInteractionZoomSuggestions } from '../../recordly/timeline/zoomSuggestionUtils';
import { computeCameraTransform } from '../../recordly/videoPlayback/cameraTransform';
import { analyzeCameraStep, computeTransformQuad } from '../../recordly/videoPlayback/cameraMotionBlur';
import {
  computeCursorFollowFocus,
  createCursorFollowCameraState,
} from '../../recordly/videoPlayback/cursorFollowCamera';
import { projectCursorPositionToViewport } from '../../recordly/videoPlayback/cursorViewport';
import { projectZoomFocusToViewport } from '../../recordly/videoPlayback/focusUtils';
import { createSpringState, getZoomSpringConfig } from '../../recordly/videoPlayback/motionSmoothing';
import {
  resolvePreviewMotionMode,
  resolveSceneZoomTarget,
  shouldComposePreviewFrame,
} from '../../recordly/videoPlayback/sceneMotion';
import { findDominantRegion } from '../../recordly/videoPlayback/zoomRegionUtils';
import { applyZoomTransform, createMotionBlurState } from '../../recordly/videoPlayback/zoomTransform';

const focused = CURSOR_MOTION_PRESETS.focused;
const cinematic = CURSOR_MOTION_PRESETS.smooth;
const options = {
  connectZooms: true,
  zoomInDurationMs: focused.zoomInDurationMs,
  zoomOutDurationMs: focused.zoomOutDurationMs,
  connectedZoomGapMs: 1500,
  connectedZoomDurationMs: 1000,
};
const stageSize = { width: 1920, height: 1080 };
const baseMask = { x: 0, y: 0, width: 1920, height: 1080 };
const tuning = { stiffnessMultiplier: 1, dampingMultiplier: 1.13, massMultiplier: 1.12 };
const region: ZoomRegion = { id: 'a', startMs: 0, endMs: 10000, depth: 3, mode: 'auto', focus: { cx: 0.5, cy: 0.5 } };

function cameraSprings() {
  return { springX: createSpringState(0.5), springY: createSpringState(0.5), springScale: createSpringState(1) };
}

function blurControls() {
  const motionBlurFilter: MotionBlurFilter = { velocity: { x: 0, y: 0 }, kernelSize: 5, offset: 0 };
  const zoomBlurFilter: ZoomBlurFilter = { center: { x: 0, y: 0 }, strength: 0, innerRadius: 0, radius: -1 };
  const position = { x: 0, y: 0, scale: 1 };
  return {
    position,
    motionBlurFilter,
    zoomBlurFilter,
    motionBlurState: createMotionBlurState(),
    cameraContainer: {
      scale: {
        set: (value: number) => {
          position.scale = value;
        },
      },
      position: {
        set: (x: number, y: number) => {
          position.x = x;
          position.y = y;
        },
      },
    },
    stageSize,
    baseMask,
    zoomScale: 1,
    focusX: 0.5,
    focusY: 0.5,
    isPlaying: true,
    motionBlurAmount: 1,
  };
}

describe('vendored Recordly pinned numeric oracle', () => {
  it.each(reference.generation)('matches generation: $name', (input) => {
    const before = structuredClone(input);
    const result = buildInteractionZoomSuggestions({
      cursorTelemetry: input.telemetry as CursorTelemetryPoint[],
      totalMs: input.durationMs,
      defaultDurationMs: 2000,
      reservedSpans: input.reserved,
      clipRegions: ('clips' in input ? input.clips : [])?.map((clip, index) => ({ ...clip, id: `clip-${index}` })),
    });
    expect(
      result.suggestions.map((zoom) => ({ ...zoom, start: Math.round(zoom.start), end: Math.round(zoom.end) })),
    ).toEqual(input.expected);
    expect(input).toEqual(before);
  });

  it.each(reference.camera)('matches every retained camera sample: $name', (input) => {
    const geometry = 'geometry' in input ? input.geometry : undefined;
    const mask = geometry
      ? {
          x: geometry.mask.x * 1920,
          y: geometry.mask.y * 1080,
          width: geometry.mask.width * 1920,
          height: geometry.mask.height * 1080,
        }
      : baseMask;
    // The oracle stores manual targets in Beam canvas space, not upstream viewport space.
    const zoomRegions = (input.zooms as ZoomRegion[]).map((zoom) => ({
      ...zoom,
      focus:
        zoom.mode === 'manual' && geometry
          ? {
              cx: (zoom.focus.cx - geometry.mask.x) / geometry.mask.width,
              cy: (zoom.focus.cy - geometry.mask.y) / geometry.mask.height,
            }
          : zoom.focus,
    }));
    const cursorFollowCamera = createCursorFollowCameraState();
    const springs = cameraSprings();
    let retainedIndex = 0;
    const last = input.samples.at(-1)!;
    for (let frame = 0; frame <= Math.round((last[0]! * input.fps) / 1000); frame++) {
      const timeMs = (frame * 1000) / input.fps;
      const target = resolveSceneZoomTarget({
        ...options,
        zoomRegions,
        timeMs,
        cursorTelemetry: input.telemetry as CursorTelemetryPoint[],
        cursorFollowCamera,
        sourceCrop: geometry?.crop,
      });
      const transform = computeCameraTransform({
        target,
        stageSize,
        baseMask: mask,
        ...springs,
        deltaMs: 1000 / input.fps,
        zoomSmoothness: 0.5,
        tuning,
      });
      const expected = input.samples[retainedIndex];
      if (!expected || Math.abs(expected[0]! - timeMs) > 1e-6) continue;
      expect(transform.scale).toBeCloseTo(expected[1]!, 10);
      expect((960 - transform.x) / (1920 * transform.scale)).toBeCloseTo(expected[2]!, 10);
      expect((540 - transform.y) / (1080 * transform.scale)).toBeCloseTo(expected[3]!, 10);
      retainedIndex++;
    }
    expect(retainedIndex).toBe(input.samples.length);
  });
});

describe('upstream presets and coordinate spaces', () => {
  it('retains the exact Focused and Cinematic tuples and independent camera inertia', () => {
    expect([focused.zoomInDurationMs, focused.zoomOutDurationMs]).toEqual([200, 200 / 0.7]);
    expect([cinematic.zoomInDurationMs, cinematic.zoomOutDurationMs]).toEqual([200 / 0.7, 200 / 0.7 ** 2]);
    expect(cinematic.cursorSpringStiffnessMultiplier).toBe(1.35 * 0.7 ** 2);
    expect(cinematic.cursorSpringDampingMultiplier).toBe(0.79 * 0.7);
    const normal = getZoomSpringConfig(0.5, tuning);
    const heavy = getZoomSpringConfig(0.5, tuning, true);
    expect(heavy.mass).toBe(normal.mass * 1.6);
    expect(heavy.damping).toBe(normal.damping * Math.sqrt(1.6));
    expect(heavy.stiffness).toBe(normal.stiffness);
  });

  it.each([focused, cinematic])('identifies exact persisted preset $label', (preset) => {
    expect(getMatchingCursorMotionPresetId(preset)).toBe(preset.id);
    expect(isCinematicZoomMotion(preset)).toBe(preset.id === 'smooth');
    expect(
      isCinematicCursorMotion(preset.cursorSmoothing, {
        stiffnessMultiplier: preset.cursorSpringStiffnessMultiplier,
        dampingMultiplier: preset.cursorSpringDampingMultiplier,
        massMultiplier: preset.cursorSpringMassMultiplier,
      }),
    ).toBe(preset.id === 'smooth');
  });

  it('recognizes legacy Smooth without treating its zoom envelope as current Cinematic', () => {
    const legacy = {
      ...cinematic,
      zoomInDurationMs: 1522.575,
      zoomOutDurationMs: 1015.05,
      cursorSpringStiffnessMultiplier: 0.92,
      cursorSpringDampingMultiplier: 1.36,
      cursorClickBounce: 2,
      cursorClickBounceDuration: 350,
    };
    expect(getMatchingCursorMotionPresetId(legacy)).toBe('smooth');
    expect(isCinematicZoomMotion(legacy)).toBe(false);
    expect(getMatchingCursorMotionPresetId({ ...legacy, cursorSize: 2.6 })).toBeNull();
    expect(resolveCursorMotionPresetId({ ...legacy, cursorSize: 2.6 }, 'focused')).toBe('focused');
    expect(isCinematicZoomMotion({ ...cinematic, zoomInDurationMs: cinematic.zoomInDurationMs + 1e-8 })).toBe(false);
  });

  it.each([
    ['manual', 'source', { cx: 0.2, cy: 0.4 }],
    ['auto', 'viewport', { cx: 0.35, cy: 0.45 }],
    ['manual', undefined, { cx: 0.35, cy: 0.45 }],
  ] as const)('respects explicit/legacy focus space for %s/%s', (mode, focusSpace, expected) => {
    const projected = projectZoomFocusToViewport(
      { ...region, mode, focusSpace, focus: { cx: 0.35, cy: 0.45 } },
      { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    );
    expect(projected.cx).toBeCloseTo(expected.cx, 12);
    expect(projected.cy).toBeCloseTo(expected.cy, 12);
  });

  it.each([
    [-0.0000005, true],
    [-0.000001, true],
    [-0.0000011, false],
    [1.0000005, true],
    [1.0000011, false],
  ])('keeps the viewport epsilon at %s', (x, visible) => {
    expect(
      projectCursorPositionToViewport({ cx: x as number, cy: 0.5 }, { x: 0, y: 0, width: 1, height: 1 }).visible,
    ).toBe(visible);
  });

  it('follows a cursor just outside the crop within epsilon instead of freezing the previous edge', () => {
    const state = createCursorFollowCameraState();
    const points = [
      { timeMs: 0, cx: 0.65, cy: 0.5 },
      { timeMs: 1000, cx: 0.24999975, cy: 0.5 },
    ];
    const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const first = computeCursorFollowFocus(state, points, 0, 1.8, 1, region.focus, {
      sourceCrop: crop,
      snapToEdgesRatio: 0.5,
    });
    const second = computeCursorFollowFocus(state, points, 1000, 1.8, 1, region.focus, {
      sourceCrop: crop,
      snapToEdgesRatio: 0.5,
    });
    expect(first.cx).toBeCloseTo(0.7222222222222222, 12);
    expect(second.cx).toBeCloseTo(0.2777777777777778, 12);
  });
});

describe('upstream connections and preview transport', () => {
  const regions: ZoomRegion[] = [
    { ...region, id: 'left', startMs: 0, endMs: 2000, mode: 'manual', focus: { cx: 0.3, cy: 0.5 } },
    { ...region, id: 'right', startMs: 3000, endMs: 6000, mode: 'manual', focus: { cx: 0.7, cy: 0.5 } },
  ];

  it('can disable connections or restrict their maximum gap', () => {
    expect(findDominantRegion(regions, 2500, { ...options, connectZooms: false }).strength).toBe(0);
    expect(findDominantRegion(regions, 2500, { ...options, connectedZoomGapMs: 999 }).strength).toBe(0);
    expect(findDominantRegion(regions, 2500, options).transition).not.toBeNull();
  });

  it('uses the custom pan duration rather than stretching the move across the whole gap', () => {
    const fast = findDominantRegion(regions, 2200, { ...options, connectedZoomDurationMs: 100 });
    const slow = findDominantRegion(regions, 2200, { ...options, connectedZoomDurationMs: 1000 });
    expect(fast.transition).toBeNull();
    expect(fast.completedTransition).not.toBeNull();
    expect(slow.transition).not.toBeNull();
    expect(slow.transition!.progress).toBeGreaterThan(0);
    expect(slow.transition!.progress).toBeLessThan(1);
  });

  it('Classic suppresses automatic cursor follow while preserving the selected focus', () => {
    const args = {
      ...options,
      zoomRegions: [region],
      timeMs: 4000,
      cursorTelemetry: [{ timeMs: 0, cx: 0.9, cy: 0.5 }],
    };
    const classic = resolveSceneZoomTarget({
      ...args,
      cursorFollowCamera: createCursorFollowCameraState(),
      zoomClassicMode: true,
    });
    const followed = resolveSceneZoomTarget({ ...args, cursorFollowCamera: createCursorFollowCameraState() });
    expect(classic.focus).toEqual(region.focus);
    expect(followed.focus.cx).toBeGreaterThan(classic.focus.cx);
  });

  it('a paused seek snaps directly to the current follow target, then seeds resumed springs', () => {
    const target = resolveSceneZoomTarget({
      ...options,
      zoomRegions: [region],
      timeMs: 4000,
      cursorTelemetry: [
        { timeMs: 0, cx: 0.1, cy: 0.5 },
        { timeMs: 4000, cx: 0.8, cy: 0.5 },
      ],
      cursorFollowCamera: createCursorFollowCameraState(),
    });
    const springs = cameraSprings();
    const transform = computeCameraTransform({
      target,
      stageSize,
      baseMask,
      ...springs,
      deltaMs: 1000 / 60,
      snap: true,
      zoomSmoothness: 0.5,
      tuning,
    });
    expect(target.focus.cx).toBeCloseTo(0.7222222222222222, 12);
    expect(transform.x).toBeCloseTo(960 - 1920 * 1.8 * target.focus.cx, 10);
    expect(springs.springX).toMatchObject({ value: target.focus.cx, velocity: 0, initialized: true });
    const resumed = computeCameraTransform({
      target: { ...target, focus: { cx: 0.6, cy: 0.5 } },
      stageSize,
      baseMask,
      ...springs,
      deltaMs: 17,
      tuning,
    });
    expect(resumed.x).not.toBeCloseTo(960 - 1920 * 1.8 * 0.6, 6);
  });

  it.each([
    [false, false, false, false, 'preserve'],
    [true, false, false, false, 'spring'],
    [false, false, true, false, 'snap'],
    [true, true, false, false, 'snap'],
    [true, false, false, true, 'snap'],
  ] as const)(
    'resolves transport %s/%s/%s/%s to %s',
    (isPlaying, isSeeking, shouldSnapPausedFrame, zoomClassicMode, expected) => {
      expect(resolvePreviewMotionMode({ isPlaying, isSeeking, shouldSnapPausedFrame, zoomClassicMode })).toBe(expected);
    },
  );

  it('holds paused and repeated frames; defers seek composition until decoded media is ready', () => {
    expect(
      shouldComposePreviewFrame({ motionMode: 'preserve', contentTimeChanged: true, shouldSnapPausedFrame: false }),
    ).toBe(false);
    expect(
      shouldComposePreviewFrame({
        motionMode: 'snap',
        isSeeking: true,
        contentTimeChanged: true,
        shouldSnapPausedFrame: true,
      }),
    ).toBe(false);
    expect(
      shouldComposePreviewFrame({ motionMode: 'spring', contentTimeChanged: false, shouldSnapPausedFrame: false }),
    ).toBe(false);
    expect(
      shouldComposePreviewFrame({ motionMode: 'snap', contentTimeChanged: false, shouldSnapPausedFrame: true }),
    ).toBe(true);
    expect(
      shouldComposePreviewFrame({
        motionMode: 'preserve',
        contentTimeChanged: true,
        shouldSnapPausedFrame: false,
        hasPendingNeutralFrame: true,
      }),
    ).toBe(true);
  });

  it('subdivides an irregular media interval without truncating its elapsed time', () => {
    const target = { scale: 1.8, focus: { cx: 0.7, cy: 0.5 }, progress: 1, connected: true };
    const long = cameraSprings(),
      split = cameraSprings();
    for (const springs of [long, split])
      Object.values(springs).forEach((spring) => {
        spring.initialized = true;
      });
    const run = (springs: ReturnType<typeof cameraSprings>, deltaMs: number) =>
      computeCameraTransform({ target, stageSize, baseMask, ...springs, deltaMs, tuning });
    const delayed = run(long, 160);
    run(split, 80);
    expect(run(split, 80)).toEqual(delayed);
    expect(long.springX.value).toBeGreaterThan(0.5);
    expect(long.springX.value).toBeLessThan(0.7);
  });

  it('returns to neutral immediately outside the envelope and clears follow history', () => {
    const follow = createCursorFollowCameraState();
    const args = {
      ...options,
      zoomRegions: [region],
      cursorFollowCamera: follow,
      cursorTelemetry: [{ timeMs: 0, cx: 0.9, cy: 0.9 }],
    };
    resolveSceneZoomTarget({ ...args, timeMs: 4000 });
    expect(follow.initialized).toBe(true);
    const target = resolveSceneZoomTarget({ ...args, timeMs: region.endMs });
    expect(target).toEqual({ scale: 1, focus: { cx: 0.5, cy: 0.5 }, progress: 0 });
    expect(follow.initialized).toBe(false);
    const springs = cameraSprings();
    Object.values(springs).forEach((spring) => Object.assign(spring, { value: 0.9, velocity: 1, initialized: true }));
    expect(computeCameraTransform({ target, stageSize, baseMask, ...springs, deltaMs: 17 })).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
    expect(springs.springX.velocity).toBe(0);
  });
});

describe('upstream spatial camera blur controls', () => {
  it.each([
    [{ scale: 1, x: 10, y: 0 }, 'move'],
    [{ scale: 1.1, x: -96, y: -54 }, 'zoom'],
    [{ scale: 1, x: 0, y: 0 }, null],
  ] as const)('classifies a camera step %j as %s', (transform, mode) => {
    const analysis = analyzeCameraStep({
      previousQuad: computeTransformQuad(baseMask, { scale: 1, x: 0, y: 0 }),
      currentQuad: computeTransformQuad(baseMask, transform),
      stageSize,
      motionBlurAmount: 1,
      motionBlurTuning: DEFAULT_ZOOM_MOTION_BLUR_TUNING,
      deltaSeconds: 1 / 60,
    });
    expect(analysis.mode).toBe(mode);
    expect(analysis.moveBlurVelocity.x).toBe(mode === 'move' ? 30 : 0);
    expect(analysis.zoomStrength).toBeCloseTo(mode === 'zoom' ? 0.4 : 0, 12);
    if (mode === 'zoom') expect(analysis.zoomCenter).toEqual({ x: 960, y: 540 });
  });

  it('retains blur on a repeated media frame instead of inventing a second step', () => {
    const controls = blurControls();
    applyZoomTransform({ ...controls, frameTimeMs: 0 });
    expect(controls.motionBlurFilter.velocity.x).toBe(0);
    const current = { scale: 1, x: 10, y: 0 };
    applyZoomTransform({ ...controls, frameTimeMs: 1000 / 60, transformOverride: current });
    expect(controls.motionBlurFilter.velocity.x).toBe(30);
    const filter = structuredClone(controls.motionBlurFilter);
    applyZoomTransform({ ...controls, frameTimeMs: 1000 / 60, transformOverride: current });
    expect(controls.motionBlurFilter).toEqual(filter);
    expect(controls.motionBlurState.lastFrameTimeMs).toBe(1000 / 60);
  });

  it.each([0, -1, 101, Number.NaN])('resets an invalid explicit frozen-frame interval %s', (deltaMs) => {
    const controls = blurControls();
    controls.motionBlurFilter.velocity.x = 100;
    controls.zoomBlurFilter.strength = 2;
    applyZoomTransform({
      ...controls,
      frameTimeMs: 500,
      motionSample: { previousTransform: { scale: 1, x: -10, y: 0 }, deltaMs },
    });
    expect(controls.motionBlurFilter.velocity).toEqual({ x: 0, y: 0 });
    expect(controls.zoomBlurFilter.strength).toBe(0);
    expect(controls.motionBlurState.initialized).toBe(false);
  });

  it('supports a paused frozen-frame shutter with an explicit previous transform', () => {
    const controls = blurControls();
    applyZoomTransform({
      ...controls,
      isPlaying: false,
      frameTimeMs: 1000,
      motionSample: { previousTransform: { scale: 1, x: -10, y: 0 }, deltaMs: 1000 / 60 },
    });
    expect(controls.motionBlurFilter.velocity.x).toBe(30);
    expect(controls.motionBlurFilter.kernelSize).toBe(13);
    expect(controls.motionBlurFilter.offset).toBe(-30 / 32);
    expect(controls.motionBlurState.initialized).toBe(true);
  });

  it.each([101, -1])('clears discontinuous playback at delta %s rather than clamping its shutter', (deltaMs) => {
    const controls = blurControls();
    applyZoomTransform({ ...controls, frameTimeMs: 100 });
    applyZoomTransform({ ...controls, frameTimeMs: 100 + deltaMs, transformOverride: { scale: 1, x: 10, y: 0 } });
    expect(controls.motionBlurFilter.velocity).toEqual({ x: 0, y: 0 });
    expect(controls.motionBlurState.lastFrameTimeMs).toBe(100 + deltaMs);
  });

  it('clears an altered pose at the same timestamp, and clears an explicit absent frozen-frame sample', () => {
    const controls = blurControls();
    applyZoomTransform({ ...controls, frameTimeMs: 100 });
    applyZoomTransform({ ...controls, frameTimeMs: 100, transformOverride: { scale: 1, x: 10, y: 0 } });
    expect(controls.motionBlurFilter.velocity).toEqual({ x: 0, y: 0 });
    controls.motionBlurFilter.velocity.x = 10;
    applyZoomTransform({ ...controls, frameTimeMs: 120, motionSample: null });
    expect(controls.motionBlurState.initialized).toBe(false);
    expect(controls.motionBlurFilter.velocity).toEqual({ x: 0, y: 0 });
  });

  it('resets transforms and blur for invalid geometry and resets effects when disabled', () => {
    const controls = blurControls();
    controls.motionBlurFilter.velocity.x = 100;
    controls.zoomBlurFilter.strength = 2;
    expect(applyZoomTransform({ ...controls, stageSize: { width: 0, height: 1080 } })).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
    expect(controls.position).toEqual({ x: 0, y: 0, scale: 1 });
    expect(controls.motionBlurState.initialized).toBe(false);
    applyZoomTransform({
      ...controls,
      motionBlurAmount: 0,
      frameTimeMs: 1000,
      transformOverride: { scale: 2, x: -10, y: -20 },
    });
    expect(controls.motionBlurFilter.velocity).toEqual({ x: 0, y: 0 });
    expect(controls.zoomBlurFilter.strength).toBe(0);
    expect(controls.position).toEqual({ x: -10, y: -20, scale: 2 });
  });
});
