import { describe, expect, it } from 'vitest';
import type { ClipComposition, NormalizedTransform, VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { VideoWindowBounds } from '../useCameraZoom';
import {
  clampEditedWebcamTransform,
  editableWebcamTransform,
  webcamDisplayLayout,
  webcamResizePointerScale,
} from '../webcam-transform-editing';

const transform: NormalizedTransform = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };
const crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
const bounds: VideoWindowBounds = { dx: 10, dy: 20, dw: 1_000, dh: 800, scale: 1 };

const compositionFor = (assets: ClipComposition['assets'] = []): ClipComposition => ({
  schemaVersion: 6,
  keyboardCaptionSessions: [],
  assets,
  clips: [],
});

const asset = (width: number | null = 320, height: number | null = 240) => ({
  id: 'webcam-asset',
  kind: 'video' as const,
  name: 'Webcam',
  fileName: 'webcam.mp4',
  durationMs: 1_000,
  width,
  height,
  src: 'webcam.mp4',
  origin: 'session' as const,
});

const webcam = (overrides: Partial<VisualClip> = {}): VisualClip => ({
  id: 'webcam',
  kind: 'webcam',
  name: 'Webcam',
  assetId: 'webcam-asset',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform,
  crop,
  appearance: createDefaultClipAppearance('webcam'),
  isMirrored: false,
  isMirroredY: false,
  cameraLayoutPreset: 'custom',
  ...overrides,
});

describe('webcam transform editing helpers', () => {
  it('shrinks regular custom crops while keeping a phone frame opening fixed', () => {
    const composition = compositionFor([asset()]);
    const regular = webcam();
    const phone = webcam({ appearance: { ...regular.appearance, frame: 'iphone-16-max' } });

    expect(webcamDisplayLayout(composition, regular, bounds, transform, 'custom')).toEqual({
      left: 150,
      top: 204,
      width: 320,
      height: 192,
    });
    expect(webcamDisplayLayout(composition, phone, bounds, transform, 'custom')).toEqual({
      left: 110,
      top: 180,
      width: 400,
      height: 240,
    });
  });

  it.each([[[]], [[asset(null, null)]]])(
    'uses layout dimensions when the webcam asset or its dimensions are missing',
    (assets) => {
      const clip = webcam({ cameraFramingPreset: 'fit' });
      const composition = compositionFor(assets);

      expect(webcamDisplayLayout(composition, clip, bounds, transform, 'fit')).toEqual({
        left: 110,
        top: 180,
        width: 400,
        height: 240,
      });
      const normalized = editableWebcamTransform(composition, clip, bounds, transform);
      expect(normalized.x).toBeCloseTo(0.15, 10);
      expect(normalized.y).toBeCloseTo(0.2, 10);
      expect(normalized.width).toBeCloseTo(0.3, 10);
      expect(normalized.height).toBeCloseTo(0.3, 10);
    },
  );

  it('uses custom framing when the persisted framing preset is omitted', () => {
    const clip = webcam({ cameraFramingPreset: undefined });
    const malformed = { x: 1.2, y: -0.2, width: 1.5, height: 0.01 };

    expect(editableWebcamTransform(compositionFor([asset()]), clip, bounds, malformed)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 0.02,
    });
  });

  it('uses zoom reaction settings for pointer scaling and visible-bound clamping', () => {
    const reacting = webcam({ cameraLayoutPreset: 'custom' });
    const fixed = webcam({ cameraLayoutPreset: 'split-left' });
    const malformed = { x: -1, y: -1, width: 0.5, height: 0.5 };

    expect(webcamResizePointerScale(reacting, 2)).toBeCloseTo(0.5);
    expect(webcamResizePointerScale(fixed, 2)).toBe(1);
    expect(clampEditedWebcamTransform(reacting, malformed, 2)).toEqual({
      x: -0.25,
      y: -0.25,
      width: 0.5,
      height: 0.5,
    });
    expect(clampEditedWebcamTransform(fixed, malformed, 2)).toEqual({
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.5,
    });
  });
});
