import { describe, expect, it } from 'vitest';
import type {
  BlurClip,
  CaptionClip,
  ClipComposition,
  ColorClip,
  NormalizedTransform,
  VisualClip,
} from '~/media/shared/composition-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { frameContentRect } from '../../../composition/appearance/frames';
import { transformClipDisplayLayout } from '../layer-display-layout';
import { projectCameraRect } from '../layer-transform-geometry';
import type { VideoWindowBounds } from '../useCameraZoom';

const transform: NormalizedTransform = { x: 0.25, y: 0.2, width: 0.5, height: 0.4 };
const bounds: VideoWindowBounds = {
  dx: 10,
  dy: 20,
  dw: 800,
  dh: 450,
  scale: 2,
  focusX: 410,
  focusY: 245,
};

const compositionFor = (assets: ClipComposition['assets'] = []): ClipComposition => ({
  schemaVersion: 6,
  keyboardCaptionSessions: [],
  assets,
  clips: [],
});

const asset = (width: number | null = 800, height: number | null = 600) => ({
  id: 'asset',
  kind: 'image' as const,
  name: 'Asset',
  fileName: 'asset.png',
  durationMs: 1_000,
  width,
  height,
  src: 'asset.png',
  origin: 'project' as const,
});

const visual = (overrides: Partial<VisualClip> = {}): VisualClip => ({
  id: 'image',
  kind: 'image',
  name: 'Image',
  assetId: 'asset',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform,
  crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
  appearance: createDefaultClipAppearance('image'),
  isMirrored: false,
  isMirroredY: false,
  cameraFramingPreset: 'custom',
  ...overrides,
});

describe('transform clip display layout', () => {
  it('uses the in-place crop for normal display and the full source box while editing', () => {
    const clip = visual();
    const composition = compositionFor([asset()]);

    expect(transformClipDisplayLayout({ composition, clip, transform, bounds, isCropping: false })).toEqual({
      left: 90,
      top: 47,
      width: 560,
      height: 216,
    });
    expect(transformClipDisplayLayout({ composition, clip, transform, bounds, isCropping: true })).toEqual({
      left: 10,
      top: -25,
      width: 800,
      height: 360,
    });
  });

  it('uses fallback dimensions for a missing visual asset and the fixed phone or desktop crop layout', () => {
    const missingAsset = visual({ cameraFramingPreset: 'fit' });
    expect(
      transformClipDisplayLayout({
        composition: compositionFor(),
        clip: missingAsset,
        transform,
        bounds,
        isCropping: false,
      }),
    ).toEqual({ left: 90, top: -25, width: 640, height: 360 });

    const phone = visual({
      appearance: { ...createDefaultClipAppearance('image'), frame: 'iphone-16-max' },
    });
    expect(
      transformClipDisplayLayout({
        composition: compositionFor([asset()]),
        clip: phone,
        transform,
        bounds,
        isCropping: true,
      }),
    ).toEqual({ left: 170, top: -25, width: 480, height: 360 });

    const desktop = visual({
      appearance: { ...createDefaultClipAppearance('image'), frame: 'safari' },
    });
    const layout = {
      x: bounds.dx + transform.x * bounds.dw,
      y: bounds.dy + transform.y * bounds.dh,
      width: transform.width * bounds.dw,
      height: transform.height * bounds.dh,
    };
    const content = frameContentRect(layout, 'safari', {
      showMenu: true,
      showScrollbars: true,
      chromeScale: 1,
    });
    const expected = projectCameraRect(bounds, {
      left: content.x,
      top: content.y,
      width: content.width,
      height: content.height,
    });
    expect(
      transformClipDisplayLayout({
        composition: compositionFor([asset(null, null)]),
        clip: desktop,
        transform,
        bounds,
        isCropping: true,
      }),
    ).toEqual(expected);
  });

  it('keeps webcam crop display and crop editing on their respective rectangles', () => {
    const clip: VisualClip = { ...visual(), kind: 'webcam', appearance: createDefaultClipAppearance('webcam') };
    const composition = compositionFor([asset(320, 240)]);

    const display = transformClipDisplayLayout({ composition, clip, transform, bounds, isCropping: false });
    expect(display.left).toBeCloseTo(430, 10);
    expect(display.top).toBeCloseTo(218, 10);
    expect(display.width).toBeCloseTo(140, 10);
    expect(display.height).toBeCloseTo(54, 10);

    const editing = transformClipDisplayLayout({ composition, clip, transform, bounds, isCropping: true });
    expect(editing.left).toBeCloseTo(410, 10);
    expect(editing.top).toBeCloseTo(200, 10);
    expect(editing.width).toBeCloseTo(200, 10);
    expect(editing.height).toBeCloseTo(90, 10);
  });

  it('projects global nonvisual layers and leaves captions in their own coordinates', () => {
    const color: ColorClip = {
      id: 'color',
      kind: 'color',
      name: 'Color',
      assetId: '',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.2 },
      fill: { kind: 'color', color: '#fff' },
    };
    const blur: BlurClip = {
      id: 'blur',
      kind: 'blur',
      name: 'Blur',
      assetId: '',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.25 },
      shape: 'circle',
      mode: 'blur',
      strength: 50,
      feather: 0,
      cornerRadius: 0,
      tintOpacity: 0,
      color: '#000',
    };
    const caption: CaptionClip = {
      id: 'caption',
      kind: 'caption',
      name: 'Caption',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      transform: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
      caption: { type: 'text', sentences: [], style: createDefaultCaptionStyle() },
    };

    expect(
      transformClipDisplayLayout({
        composition: compositionFor(),
        clip: color,
        transform: color.transform,
        bounds,
        isCropping: false,
      }),
    ).toEqual({
      left: -70,
      top: 65,
      width: 640,
      height: 180,
    });
    expect(
      transformClipDisplayLayout({
        composition: compositionFor(),
        clip: blur,
        transform: blur.transform,
        bounds,
        isCropping: false,
      }),
    ).toEqual({
      left: 137.5,
      top: 65,
      width: 225,
      height: 225,
    });
    expect(
      transformClipDisplayLayout({
        composition: compositionFor(),
        clip: caption,
        transform: caption.transform!,
        bounds,
        isCropping: false,
      }),
    ).toEqual({
      left: 90,
      top: 110,
      width: 240,
      height: 45,
    });
  });
});
