import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSITION_DURATION_MS,
  MAX_TRANSITION_DURATION_MS,
  TRANSITION_DEFINITIONS,
  audioTransitionGainAt,
  resolveCanvasTransitionState,
  normalizeClipTransitions,
  resolveClipTransitionState,
} from '../clip-transitions';
import type { Clip, VisualClip } from '../composition-types';
import { createDefaultClipAppearance } from '../composition-defaults';
import { activeClipsAt } from '../timeline-mapping';

const visualClip = (id: string, order: number, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order,
  trackId: id,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const timedClip = (transitions: Clip['transitions'], duration = 1_000) => ({
  timelineStartMs: 100,
  timelineDurationMs: duration,
  transitions,
});

describe('clip transition evaluator', () => {
  it('registers the four visual presets and exposes the shared default duration', () => {
    expect(Object.keys(TRANSITION_DEFINITIONS)).toEqual(['fade', 'slide', 'zoom', 'blur']);
    expect(DEFAULT_TRANSITION_DURATION_MS).toBe(500);
    expect(MAX_TRANSITION_DURATION_MS).toBe(5_000);
    expect(TRANSITION_DEFINITIONS.fade.domains).toEqual(['visual', 'audio']);
    expect(TRANSITION_DEFINITIONS.slide.domains).toEqual(['visual']);
  });

  it('evaluates fade entry at start, eased midpoint, and the settled end', () => {
    const clip = timedClip({ entry: { preset: { kind: 'fade' }, durationMs: 500 }, exit: null });
    expect(resolveClipTransitionState(clip, 100)).toEqual({
      opacity: 0,
      translateX: 0,
      translateY: 0,
      scale: 1,
      blur: 0,
    });
    expect(resolveClipTransitionState(clip, 350).opacity).toBeCloseTo(0.875);
    expect(resolveClipTransitionState(clip, 600).opacity).toBe(1);
  });

  it('evaluates slide, zoom, and blur families with their documented bounds', () => {
    const slide = timedClip({ entry: { preset: { kind: 'slide', direction: 'left' }, durationMs: 500 }, exit: null });
    const zoom = timedClip({ entry: { preset: { kind: 'zoom', direction: 'in' }, durationMs: 500 }, exit: null });
    const blur = timedClip({ entry: { preset: { kind: 'blur' }, durationMs: 500 }, exit: null });

    expect(resolveClipTransitionState(slide, 100)).toMatchObject({ opacity: 0, translateX: -0.08 });
    expect(resolveClipTransitionState(zoom, 100)).toMatchObject({ opacity: 0, scale: 0.96 });
    expect(resolveClipTransitionState(blur, 100)).toMatchObject({ opacity: 0, blur: 12 });
    expect(resolveClipTransitionState(slide, 600)).toMatchObject({ opacity: 1, translateX: 0 });
  });

  it('mirrors entry easing for exits and returns identity outside a clip', () => {
    const clip = timedClip({ entry: null, exit: { preset: { kind: 'slide', direction: 'down' }, durationMs: 500 } });
    expect(resolveClipTransitionState(clip, 99)).toEqual({
      opacity: 1,
      translateX: 0,
      translateY: 0,
      scale: 1,
      blur: 0,
    });
    expect(resolveClipTransitionState(clip, 900).opacity).toBeCloseTo(0.784);
    expect(resolveClipTransitionState(clip, 1_100).opacity).toBe(0);
  });

  it.each([30, 60])('keeps the final exit frame visible at a contiguous cut (%s fps)', (fps) => {
    const cutMs = 1_000;
    const frameMs = 1_000 / fps;
    const first = visualClip('first', 0, {
      timelineDurationMs: cutMs,
      transitions: { entry: null, exit: { preset: { kind: 'fade' }, durationMs: 500 } },
    });
    const second = visualClip('second', 1, { timelineStartMs: cutMs });
    const composition = {
      schemaVersion: 6,
      keyboardCaptionSessions: [],
      assets: [],
      clips: [first, second],
    };
    const before = cutMs - frameMs;
    const after = cutMs + frameMs;

    expect(activeClipsAt(composition, before).map((clip) => clip.id)).toEqual(['first']);
    expect(resolveClipTransitionState(first, before).opacity).toBeCloseTo(1 - (1 - frameMs / 500) ** 3, 8);
    expect(activeClipsAt(composition, cutMs).map((clip) => clip.id)).toEqual(['second']);
    expect(resolveClipTransitionState(second, cutMs).opacity).toBe(1);
    expect(activeClipsAt(composition, after).map((clip) => clip.id)).toEqual(['second']);
    expect(resolveClipTransitionState(second, after).opacity).toBe(1);
  });

  it('snaps a nominal 30 fps boundary before evaluating the outgoing transition', () => {
    const cutMs = 32_300;
    const frameTimeMs = (969 / 30) * 1_000;
    const first = visualClip('first', 0, {
      timelineDurationMs: cutMs,
      transitions: { entry: null, exit: { preset: { kind: 'fade' }, durationMs: 500 } },
    });

    expect(frameTimeMs).toBeLessThan(cutMs);
    expect(resolveClipTransitionState(first, frameTimeMs)).toEqual(resolveClipTransitionState(first, cutMs));
    expect(resolveClipTransitionState(first, frameTimeMs)).toEqual({
      opacity: 0,
      translateX: 0,
      translateY: 0,
      scale: 1,
      blur: 0,
    });
  });

  it('normalizes durations, rejects unsupported audio presets, and fits short clips', () => {
    expect(
      normalizeClipTransitions(
        {
          entry: { preset: { kind: 'slide', direction: 'up' }, durationMs: 9_999 },
          exit: { preset: { kind: 'slide', direction: 'down' }, durationMs: 1 },
        },
        40,
        'video',
      ),
    ).toEqual({
      entry: { preset: { kind: 'slide', direction: 'up' }, durationMs: 39 },
      exit: { preset: { kind: 'slide', direction: 'down' }, durationMs: 1 },
    });
    expect(
      normalizeClipTransitions(
        {
          entry: { preset: { kind: 'slide', direction: 'left' }, durationMs: 300 },
          exit: { preset: { kind: 'fade' }, durationMs: 300 },
        },
        1_000,
        'audio',
      ),
    ).toEqual({ entry: null, exit: { preset: { kind: 'fade' }, durationMs: 300 } });
    expect(
      normalizeClipTransitions(
        {
          entry: { preset: { kind: 'fade' }, durationMs: -1 },
          exit: { preset: { kind: 'fade' }, durationMs: Number.NaN },
        },
        40,
        'video',
      ),
    ).toEqual({ entry: null, exit: null });
  });

  it('keeps clip-at-zero transitions local and resolves Canvas transitions explicitly', () => {
    const clip = visualClip('clip', 10, {
      transitions: { entry: { preset: { kind: 'fade' }, durationMs: 500 }, exit: null },
    });
    expect(resolveClipTransitionState(clip, 0).opacity).toBe(0);
    expect(resolveCanvasTransitionState({ entry: null, exit: null }, 0, 1_000)).toBeNull();
    expect(
      resolveCanvasTransitionState({ entry: { preset: { kind: 'fade' }, durationMs: 500 }, exit: null }, 0, 1_000)
        ?.opacity,
    ).toBe(0);
    expect(
      resolveCanvasTransitionState({ entry: { preset: { kind: 'fade' }, durationMs: 500 }, exit: null }, 500, 1_000),
    ).toBeNull();
  });

  it('applies the same linear audio envelope at entry and exit boundaries', () => {
    const clip = timedClip({
      entry: { preset: { kind: 'fade' }, durationMs: 400 },
      exit: { preset: { kind: 'fade' }, durationMs: 400 },
    });
    expect(audioTransitionGainAt(clip, 100)).toBe(0);
    expect(audioTransitionGainAt(clip, 300)).toBe(0.5);
    expect(audioTransitionGainAt(clip, 600)).toBe(1);
    expect(audioTransitionGainAt(clip, 1_000)).toBe(0.25);
    expect(audioTransitionGainAt(clip, 1_100)).toBe(0);
    expect(audioTransitionGainAt(timedClip({ entry: null, exit: null }), 500)).toBe(1);
    expect(audioTransitionGainAt(clip, 99)).toBe(0);
    expect(audioTransitionGainAt(clip, 1_101)).toBe(0);
  });

  it('covers every directional variant and single-edge short-clip fitting', () => {
    expect(
      resolveClipTransitionState(
        timedClip({ entry: { preset: { kind: 'slide', direction: 'right' }, durationMs: 500 }, exit: null }),
        100,
      ).translateX,
    ).toBe(0.08);
    expect(
      resolveClipTransitionState(
        timedClip({ entry: { preset: { kind: 'slide', direction: 'up' }, durationMs: 500 }, exit: null }),
        100,
      ).translateY,
    ).toBe(-0.08);
    expect(
      resolveClipTransitionState(
        timedClip({ entry: { preset: { kind: 'slide', direction: 'down' }, durationMs: 500 }, exit: null }),
        100,
      ).translateY,
    ).toBe(0.08);
    expect(
      resolveClipTransitionState(
        timedClip({ entry: { preset: { kind: 'zoom', direction: 'out' }, durationMs: 500 }, exit: null }),
        100,
      ).scale,
    ).toBe(1.04);
    expect(
      normalizeClipTransitions({ entry: null, exit: { preset: { kind: 'fade' }, durationMs: 500 } }, 40, 'audio'),
    ).toEqual({ entry: null, exit: { preset: { kind: 'fade' }, durationMs: 40 } });
    expect(
      normalizeClipTransitions(
        { entry: { preset: { kind: 'fade' }, durationMs: 500 }, exit: { preset: { kind: 'fade' }, durationMs: 500 } },
        1,
        'audio',
      ),
    ).toEqual({ entry: { preset: { kind: 'fade' }, durationMs: 1 }, exit: null });
    expect(resolveClipTransitionState(visualClip('late', 0, { timelineStartMs: 1 }), -1)).toEqual({
      opacity: 1,
      translateX: 0,
      translateY: 0,
      scale: 1,
      blur: 0,
    });
  });
});
