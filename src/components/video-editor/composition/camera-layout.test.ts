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

      expect(geometry.source).toEqual({ x: 480, y: 270, width: 960, height: 540 });
      expectRectToMatch(geometry.media, { x: 0, y: 0, width: 1920, height: 1080 });
      expectRectToMatch(geometry.positioned, {
        x: transform.x * 1920,
        y: transform.y * 1080,
        width: transform.width * 1920,
        height: transform.height * 1080,
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

    expect(mapped).toEqual({ cx: 0.5, cy: 0.5 });
  });
});
