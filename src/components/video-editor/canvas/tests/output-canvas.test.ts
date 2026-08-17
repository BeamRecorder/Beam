import { describe, expect, it } from 'vitest';
import {
  containedMediaRect,
  coverPoint,
  coverSourceRect,
  DEFAULT_OUTPUT_CANVAS,
  framedMediaRect,
  normalizeOutputCanvas,
  outputPreviewRect,
} from '../output-canvas';
import { resolveCanvasTransitionState } from '~/media/shared/clip-transitions';

describe('output canvas geometry', () => {
  it('centers a 16:9 preview in a wide editor', () => {
    const rect = outputPreviewRect(1200, 600, DEFAULT_OUTPUT_CANVAS);
    expect(rect.width / rect.height).toBeCloseTo(16 / 9);
    expect(rect.x).toBeCloseTo((1200 - rect.width) / 2);
    expect(rect.y).toBe(0);
  });
  it('centers a portrait preview in a tall editor', () =>
    expect(
      outputPreviewRect(600, 1200, {
        ...DEFAULT_OUTPUT_CANVAS,
        width: 1080,
        height: 1920,
      }),
    ).toEqual({
      x: 0,
      y: 66.66666666666663,
      width: 600,
      height: 1066.6666666666667,
    }));
  it('crops a wide source for a portrait output', () =>
    expect(coverSourceRect(1920, 1080, 1080, 1920)).toEqual({
      x: 656.25,
      y: 0,
      width: 607.5,
      height: 1080,
    }));
  it('maps source points into the covered output coordinates', () =>
    expect(coverPoint(0.5, 0.5, 1920, 1080, 1080, 1920)).toEqual({
      cx: 0.5,
      cy: 0.5,
    }));
  it('centers contained media so the background remains visible', () =>
    expect(containedMediaRect(1920, 1080, 1080, 1920)).toEqual({
      x: 0,
      y: 656.25,
      width: 1080,
      height: 607.5,
    }));
  it('adds a visible background frame around contained media', () =>
    expect(framedMediaRect(1920, 1080, 1080, 1920)).toEqual({
      x: 75.60000000000002,
      y: 698.775,
      width: 928.8,
      height: 522.45,
    }));
  it('normalizes the extended output presets', () =>
    expect(
      normalizeOutputCanvas({
        preset: '21:9',
        width: 1,
        height: 1,
        showBackground: true,
      }),
    ).toMatchObject({
      preset: '21:9',
      width: 2520,
      height: 1080,
      showBackground: true,
    }));

  it('normalizes legacy canvas settings without transitions to empty edges', () => {
    const normalized = normalizeOutputCanvas({
      preset: 'custom',
      width: 1280,
      height: 720,
      showBackground: false,
    });

    expect(normalized.transitions).toEqual({ entry: null, exit: null });
    expect(DEFAULT_OUTPUT_CANVAS.transitions).toEqual({ entry: null, exit: null });
  });

  it('preserves valid global transitions and resolves their active output state', () => {
    const normalized = normalizeOutputCanvas({
      preset: 'custom',
      width: 1280,
      height: 720,
      showBackground: false,
      transitions: {
        entry: { preset: { kind: 'fade' }, durationMs: 750 },
        exit: { preset: { kind: 'slide', direction: 'left' }, durationMs: 1_250 },
      },
    });

    expect(normalized.transitions).toEqual({
      entry: { preset: { kind: 'fade' }, durationMs: 750 },
      exit: { preset: { kind: 'slide', direction: 'left' }, durationMs: 1_250 },
    });
    expect(resolveCanvasTransitionState(normalized.transitions!, 0, 2_000)).toMatchObject({ opacity: 0 });
    expect(resolveCanvasTransitionState(normalized.transitions!, 1_000, 2_000)).toMatchObject({
      translateX: expect.any(Number),
    });
    expect(resolveCanvasTransitionState(normalized.transitions!, 2_500, 2_000)).toBeNull();
  });

  it('tolerates invalid canvas transition presets and clamps durations', () => {
    const normalized = normalizeOutputCanvas({
      preset: '16:9',
      width: 1920,
      height: 1080,
      showBackground: false,
      transitions: {
        entry: {
          preset: { kind: 'slide', direction: 'diagonal' } as never,
          durationMs: 300,
        },
        exit: { preset: { kind: 'fade' }, durationMs: 6_000 },
      },
    });

    expect(normalized.transitions).toEqual({
      entry: null,
      exit: { preset: { kind: 'fade' }, durationMs: 5_000 },
    });
  });
});
