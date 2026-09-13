import { describe, expect, it } from 'vitest';
import {
  cameraLayoutTransform,
  linkedScreenTransform,
  mapSourcePointToScreen,
  resolveCameraFraming,
  resolveScreenRenderGeometry,
} from './camera-layout';
import type { CanvasRect } from '../canvas/output-canvas';
import type { CameraFramingPreset, CameraLayoutPreset } from '~/media/shared/camera-layout-types';
import type { NormalizedCrop, VisualClip } from '~/media/shared/composition-types';

const expectRectToMatch = (actual: CanvasRect, expected: CanvasRect) => {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.y).toBeCloseTo(expected.y, 10);
  expect(actual.width).toBeCloseTo(expected.width, 10);
  expect(actual.height).toBeCloseTo(expected.height, 10);
};

const layoutCases: ReadonlyArray<{
  preset: Exclude<CameraLayoutPreset, 'custom'>;
  camera: CanvasRect;
  screen: CanvasRect;
}> = [
  {
    preset: 'floating-top-left',
    camera: { x: 0.04, y: 0.04, width: 0.28, height: 0.28 },
    screen: { x: 0, y: 0, width: 1, height: 1 },
  },
  {
    preset: 'floating-top-right',
    camera: { x: 0.68, y: 0.04, width: 0.28, height: 0.28 },
    screen: { x: 0, y: 0, width: 1, height: 1 },
  },
  {
    preset: 'floating-bottom-left',
    camera: { x: 0.04, y: 0.68, width: 0.28, height: 0.28 },
    screen: { x: 0, y: 0, width: 1, height: 1 },
  },
  {
    preset: 'floating-bottom-right',
    camera: { x: 0.68, y: 0.68, width: 0.28, height: 0.28 },
    screen: { x: 0, y: 0, width: 1, height: 1 },
  },
  {
    preset: 'floating-center',
    camera: { x: 0.18, y: 0.18, width: 0.64, height: 0.64 },
    screen: { x: 0, y: 0, width: 1, height: 1 },
  },
  {
    preset: 'fullscreen',
    camera: { x: 0, y: 0, width: 1, height: 1 },
    screen: { x: 0, y: 0, width: 1, height: 1 },
  },
  {
    preset: 'split-left',
    camera: { x: 0, y: 0, width: 0.5, height: 1 },
    screen: { x: 0.5, y: 0, width: 0.5, height: 1 },
  },
  {
    preset: 'split-right',
    camera: { x: 0.5, y: 0, width: 0.5, height: 1 },
    screen: { x: 0, y: 0, width: 0.5, height: 1 },
  },
  {
    preset: 'split-top',
    camera: { x: 0, y: 0, width: 1, height: 0.5 },
    screen: { x: 0, y: 0.5, width: 1, height: 0.5 },
  },
  {
    preset: 'split-bottom',
    camera: { x: 0, y: 0.5, width: 1, height: 0.5 },
    screen: { x: 0, y: 0, width: 1, height: 0.5 },
  },
];

describe('camera layout geometry', () => {
  it.each(layoutCases)('resolves the camera and linked-screen rectangles for $preset', ({ preset, camera, screen }) => {
    expectRectToMatch(cameraLayoutTransform(preset), camera);
    expectRectToMatch(linkedScreenTransform(preset), screen);
  });

  it.each(['split-left', 'split-right', 'split-top', 'split-bottom'] as const)(
    'keeps camera and screen complementary at an adjusted ratio for %s',
    (preset) => {
      const camera = cameraLayoutTransform(preset, 0.7);
      const screen = linkedScreenTransform(preset, 0.7);
      expect(
        (camera.width === 1 ? camera.height : camera.width) + (screen.width === 1 ? screen.height : screen.width),
      ).toBeCloseTo(1);
    },
  );

  const source = { width: 1920, height: 1080 };
  const canvasCases: ReadonlyArray<{ name: string; bounds: CanvasRect }> = [
    { name: 'landscape', bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    { name: 'portrait', bounds: { x: 30, y: 40, width: 1080, height: 1920 } },
    { name: 'square', bounds: { x: 12, y: 24, width: 1080, height: 1080 } },
  ];
  const framingCases: ReadonlyArray<{
    preset: Exclude<CameraFramingPreset, 'custom'>;
    aspect: (bounds: CanvasRect) => number;
    circular: boolean;
  }> = [
    { preset: 'fill', aspect: (bounds) => bounds.width / bounds.height, circular: false },
    { preset: 'fit', aspect: () => source.width / source.height, circular: false },
    { preset: 'square', aspect: () => 1, circular: false },
    { preset: 'portrait', aspect: () => 9 / 16, circular: false },
    { preset: 'landscape', aspect: () => 16 / 9, circular: false },
    { preset: 'squircle', aspect: () => 1, circular: false },
    { preset: 'circle', aspect: () => 1, circular: true },
  ];

  it.each(framingCases)(
    'resolves $preset without distortion on several canvas formats',
    ({ preset, aspect, circular }) => {
      for (const { bounds } of canvasCases) {
        const result = resolveCameraFraming(preset, bounds, source.width, source.height);

        expect(result.rect.x).toBeGreaterThanOrEqual(bounds.x - 1e-8);
        expect(result.rect.y).toBeGreaterThanOrEqual(bounds.y - 1e-8);
        expect(result.rect.x + result.rect.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-8);
        expect(result.rect.y + result.rect.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1e-8);
        expect(result.rect.width / result.rect.height).toBeCloseTo(aspect(bounds), 10);
        expect(result.circular).toBe(circular);

        if (preset === 'fit') {
          expect(result.sourceRect).toBeUndefined();
          expect(result.rect.x).toBeCloseTo(bounds.x + (bounds.width - result.rect.width) / 2, 10);
          expect(result.rect.y).toBeCloseTo(bounds.y + (bounds.height - result.rect.height) / 2, 10);
          continue;
        }

        const sourceRect = result.sourceRect;
        expect(sourceRect).toBeDefined();
        expect(sourceRect!.x).toBeCloseTo((source.width - sourceRect!.width) / 2, 10);
        expect(sourceRect!.y).toBeCloseTo((source.height - sourceRect!.height) / 2, 10);
        expect(sourceRect!.width / sourceRect!.height).toBeCloseTo(result.rect.width / result.rect.height, 10);
      }
    },
  );

  it('uses centered source crops for fill and square framing', () => {
    const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
    expect(resolveCameraFraming('fill', bounds, source.width, source.height)).toEqual({
      rect: bounds,
      sourceRect: { x: 0, y: 0, width: 1920, height: 1080 },
      circular: false,
    });
    expect(resolveCameraFraming('square', bounds, source.width, source.height)).toEqual({
      rect: { x: 420, y: 0, width: 1080, height: 1080 },
      sourceRect: { x: 420, y: 0, width: 1080, height: 1080 },
      circular: false,
    });
  });

  it.each([
    [false, false, { x: 180, y: 320 }],
    [true, false, { x: 420, y: 320 }],
    [false, true, { x: 180, y: 530 }],
    [true, true, { x: 420, y: 530 }],
  ] as const)(
    'projects a custom crop into its destination bounds with mirrorX=%s and mirrorY=%s',
    (mirrorX, mirrorY, origin) => {
      const bounds = { x: 100, y: 200, width: 800, height: 600 };
      const crop: NormalizedCrop = { x: 0.1, y: 0.2, width: 0.5, height: 0.25 };
      const framing = resolveCameraFraming('custom', bounds, 2_000, 1_000, crop, mirrorX, mirrorY);

      expectRectToMatch(framing.rect, { ...origin, width: 400, height: 150 });
      expect(framing.sourceRect).toEqual({ x: 200, y: 200, width: 1_000, height: 250 });
      expect(framing.circular).toBe(false);
    },
  );

  it('keeps a bottom strip as a destination slice and the complete source crop', () => {
    const bounds = { x: 80, y: 40, width: 640, height: 360 };
    const crop: NormalizedCrop = { x: 0, y: 0.75, width: 1, height: 0.25 };
    const framing = resolveCameraFraming('custom', bounds, 1_920, 1_080, crop);

    expectRectToMatch(framing.rect, { x: 80, y: 310, width: 640, height: 90 });
    expect(framing.sourceRect).toEqual({ x: 0, y: 810, width: 1_920, height: 270 });
  });

  it('keeps custom framing unzoomed for no crop and a full crop', () => {
    const bounds = { x: 160, y: 60, width: 480, height: 300 };
    const clip = { transform: { x: 0.2, y: 0.1, width: 0.6, height: 0.5 } } as VisualClip;
    const fullSource = { x: 0, y: 0, width: 1_920, height: 1_080 };
    const noCrop = resolveScreenRenderGeometry(
      clip,
      1_920,
      1_080,
      800,
      600,
      false,
      clip.transform,
      undefined,
      'custom',
    );
    const fullCrop = resolveScreenRenderGeometry(
      clip,
      1_920,
      1_080,
      800,
      600,
      false,
      clip.transform,
      { x: 0, y: 0, width: 1, height: 1 },
      'custom',
    );

    expect(noCrop.source).toEqual(fullSource);
    expect(fullCrop.source).toEqual(fullSource);
    expectRectToMatch(noCrop.positioned, bounds);
    expectRectToMatch(fullCrop.positioned, bounds);
    expectRectToMatch(noCrop.media, { x: 0, y: 0, width: 800, height: 600 });
    expectRectToMatch(fullCrop.media, { x: 0, y: 0, width: 800, height: 600 });
  });

  it.each([false, true] as const)(
    'projects a custom crop within uncropped media geometry when showBackground=%s',
    (showBackground) => {
      const sourceWidth = 1_920;
      const sourceHeight = 1_080;
      const canvasWidth = 800;
      const canvasHeight = 600;
      const transform = { x: 0.2, y: 0.1, width: 0.6, height: 0.5 };
      const crop: NormalizedCrop = { x: 0.25, y: 0.125, width: 0.5, height: 0.75 };
      const clip = { transform, isMirrored: false, isMirroredY: false } as VisualClip;
      const geometry = resolveScreenRenderGeometry(
        clip,
        sourceWidth,
        sourceHeight,
        canvasWidth,
        canvasHeight,
        showBackground,
        transform,
        crop,
        'custom',
      );

      expect(geometry.source).toEqual({ x: 480, y: 135, width: 960, height: 810 });
      if (showBackground) {
        expectRectToMatch(geometry.media, { x: 56, y: 106.5, width: 688, height: 387 });
        expectRectToMatch(geometry.positioned, { x: 296.8, y: 169.3875, width: 206.4, height: 145.125 });
      } else {
        expectRectToMatch(geometry.media, { x: 0, y: 0, width: 800, height: 600 });
        expectRectToMatch(geometry.positioned, { x: 280, y: 97.5, width: 240, height: 225 });
      }
    },
  );

  it.each([false, true] as const)(
    'preserves source point scale when a custom crop is projected with showBackground=%s',
    (showBackground) => {
      const sourceWidth = 1_920;
      const sourceHeight = 1_080;
      const canvasWidth = 800;
      const canvasHeight = 600;
      const transform = { x: 0.2, y: 0.1, width: 0.6, height: 0.5 };
      const clip = { transform } as VisualClip;
      const crop: NormalizedCrop = { x: 0.25, y: 0.125, width: 0.5, height: 0.75 };
      const uncropped = resolveScreenRenderGeometry(
        clip,
        sourceWidth,
        sourceHeight,
        canvasWidth,
        canvasHeight,
        showBackground,
        transform,
        undefined,
        'custom',
      );
      const cropped = resolveScreenRenderGeometry(
        clip,
        sourceWidth,
        sourceHeight,
        canvasWidth,
        canvasHeight,
        showBackground,
        transform,
        crop,
        'custom',
      );
      const point = { cx: 0.375, cy: 0.2 };
      const uncroppedPoint = mapSourcePointToScreen(
        point,
        sourceWidth,
        sourceHeight,
        canvasWidth,
        canvasHeight,
        uncropped,
      );
      const croppedPoint = mapSourcePointToScreen(point, sourceWidth, sourceHeight, canvasWidth, canvasHeight, cropped);

      expect(croppedPoint.cx).toBeCloseTo(uncroppedPoint.cx, 10);
      expect(croppedPoint.cy).toBeCloseTo(uncroppedPoint.cy, 10);
      const expectedPoint = showBackground ? { cx: 0.4355, cy: 0.3065 } : { cx: 0.425, cy: 0.2 };
      expect(croppedPoint.cx).toBeCloseTo(expectedPoint.cx, 10);
      expect(croppedPoint.cy).toBeCloseTo(expectedPoint.cy, 10);
    },
  );

  it('keeps a screen squircle in the full transform box while preserving its resized ratio', () => {
    const transform = { x: 0.2, y: 0.1, width: 0.6, height: 0.5 };
    const clip = { transform, cameraFramingPreset: 'squircle' } as VisualClip;
    const geometry = resolveScreenRenderGeometry(clip, 1_920, 1_080, 800, 600, false, transform, undefined, 'squircle');

    expectRectToMatch(geometry.positioned, { x: 160, y: 60, width: 480, height: 300 });
    expect(geometry.positioned.width / geometry.positioned.height).toBeCloseTo(1.6, 10);
    expect(geometry.mask).toBe('squircle');
    expect(geometry.source.width / geometry.source.height).toBeCloseTo(1.6, 10);
    expect(geometry.source.x).toBeCloseTo(240, 10);
    expect(geometry.source.y).toBeCloseTo(90, 10);
  });

  const splitMappingCases: ReadonlyArray<{
    preset: Extract<CameraLayoutPreset, `split-${string}`>;
    expectedCenter: { cx: number; cy: number };
  }> = [
    { preset: 'split-left', expectedCenter: { cx: 0.75, cy: 0.5 } },
    { preset: 'split-right', expectedCenter: { cx: 0.25, cy: 0.5 } },
    { preset: 'split-top', expectedCenter: { cx: 0.5, cy: 0.75 } },
    { preset: 'split-bottom', expectedCenter: { cx: 0.5, cy: 0.25 } },
  ];

  it.each(splitMappingCases)(
    'maps cropped screen coordinates into the $preset screen half',
    ({ preset, expectedCenter }) => {
      const transform = linkedScreenTransform(preset);
      const clip = { transform } as VisualClip;
      const crop: NormalizedCrop = { x: 0.25, y: 0.125, width: 0.5, height: 0.75 };
      const geometry = resolveScreenRenderGeometry(clip, 1920, 1080, 1920, 1080, false, transform, crop);

      expect(geometry.source).toEqual({ x: 480, y: 135, width: 960, height: 810 });
      expectRectToMatch(geometry.media, { x: 0, y: 0, width: 1920, height: 1080 });
      expectRectToMatch(geometry.positioned, {
        x: transform.x * 1920 + crop.x * transform.width * 1920,
        y: transform.y * 1080 + crop.y * transform.height * 1080,
        width: transform.width * crop.width * 1920,
        height: transform.height * crop.height * 1080,
      });

      const mappedCenter = mapSourcePointToScreen({ cx: 0.5, cy: 0.5 }, 1920, 1080, 1920, 1080, geometry);
      expect(mappedCenter.cx).toBeCloseTo(expectedCenter.cx, 10);
      expect(mappedCenter.cy).toBeCloseTo(expectedCenter.cy, 10);
    },
  );

  it('keeps the crop offset when mapping a point at the visible source edge', () => {
    const transform = linkedScreenTransform('split-left');
    const clip = { transform } as VisualClip;
    const crop: NormalizedCrop = { x: 0.25, y: 0.125, width: 0.5, height: 0.75 };
    const geometry = resolveScreenRenderGeometry(clip, 1920, 1080, 1920, 1080, false, transform, crop);
    const mapped = mapSourcePointToScreen({ cx: 0.25, cy: 0.5 }, 1920, 1080, 1920, 1080, geometry);

    expect(mapped).toEqual({ cx: 0.625, cy: 0.5 });
  });
});
