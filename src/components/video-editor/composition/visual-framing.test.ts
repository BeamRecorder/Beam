import { describe, expect, it } from 'vitest';
import type { MediaAsset, NormalizedTransform, VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { createComposition } from './engine/clip-engine';
import {
  editableVisualClipTransform,
  resolveVisualClipFraming,
  resizePhoneFrameTransform,
  visualClipDisplayLayout,
} from './visual-framing';

const source: MediaAsset = {
  id: 'asset',
  kind: 'video',
  name: 'asset',
  fileName: 'asset.mp4',
  durationMs: 1_000,
  width: 1_920,
  height: 1_080,
  src: 'asset.mp4',
  origin: 'project',
};

const transform: NormalizedTransform = { x: 0.2, y: 0.1, width: 0.6, height: 0.5 };
const bounds = { dx: 100, dy: 80, dw: 800, dh: 600 };

const clipFor = (kind: VisualClip['kind'], preset: VisualClip['cameraFramingPreset']): VisualClip => ({
  id: 'clip',
  kind,
  name: 'clip',
  assetId: source.id,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  trackId: 'clip-track',
  transform,
  crop: undefined,
  appearance: createDefaultClipAppearance(kind),
  isMirrored: false,
  isMirroredY: false,
  cameraLayoutPreset: 'custom',
  cameraFramingPreset: preset,
});

const expectRect = (actual: { x: number; y: number; width: number; height: number }, expected: typeof transform) => {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.y).toBeCloseTo(expected.y, 10);
  expect(actual.width).toBeCloseTo(expected.width, 10);
  expect(actual.height).toBeCloseTo(expected.height, 10);
};

describe('editable visual framing transforms', () => {
  it.each([
    ['fit', { x: 0.2, y: 0.125, width: 0.6, height: 0.45 }],
    ['portrait', { x: 0.39453125, y: 0.1, width: 0.2109375, height: 0.5 }],
    ['circle', { x: 0.3125, y: 0.1, width: 0.375, height: 0.5 }],
  ] as const)('normalizes %s to its visible rectangle before resize', (preset, expected) => {
    const clip = clipFor('video', preset);
    const composition = createComposition([source], [clip]);
    const normalized = editableVisualClipTransform(composition, composition.clips[0] as VisualClip, transform, bounds);
    const before = visualClipDisplayLayout(
      clip,
      transform,
      { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh },
      source.width!,
      source.height!,
      preset,
    );
    const after = visualClipDisplayLayout(
      clip,
      normalized,
      { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh },
      source.width!,
      source.height!,
      preset,
    );

    expectRect(normalized, expected);
    expect(after.left).toBeCloseTo(before.left, 10);
    expect(after.top).toBeCloseTo(before.top, 10);
    expect(after.width).toBeCloseTo(before.width, 10);
    expect(after.height).toBeCloseTo(before.height, 10);
  });

  it.each(['custom', 'fill'] as const)('leaves %s transforms unchanged', (preset) => {
    const clip = clipFor('video', preset);
    const composition = createComposition([source], [clip]);
    const normalized = editableVisualClipTransform(composition, composition.clips[0] as VisualClip, transform, bounds);

    expect(normalized).toBe(transform);
  });

  it('keeps a custom crop inside the regular visual bounds while a phone keeps its screen opening', () => {
    const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    const visualBounds = { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh };
    const regular = clipFor('video', 'custom');
    regular.crop = crop;
    const regularFraming = resolveVisualClipFraming(
      regular,
      visualBounds,
      source.width!,
      source.height!,
      crop,
      'custom',
    );

    expectRect(regularFraming.rect, { x: 180, y: 200, width: 400, height: 240 });
    expectRect(regularFraming.sourceRect!, { x: 192, y: 216, width: 960, height: 432 });

    const phone = clipFor('video', 'custom');
    phone.crop = crop;
    phone.appearance = { ...phone.appearance, frame: 'iphone-16-max' };
    const phoneFraming = resolveVisualClipFraming(phone, visualBounds, source.width!, source.height!, crop, 'custom');

    expectRect(phoneFraming.rect, visualBounds);
    expectRect(phoneFraming.sourceRect!, regularFraming.sourceRect!);
    expect(
      visualClipDisplayLayout(
        phone,
        transform,
        { x: 0, y: 0, width: 1_000, height: 800 },
        source.width!,
        source.height!,
        'custom',
        'none',
      ),
    ).toEqual({ left: 200, top: 80, width: 600, height: 400 });

    const content = visualClipDisplayLayout(
      phone,
      transform,
      { x: 0, y: 0, width: 1_000, height: 800 },
      source.width!,
      source.height!,
      'custom',
      'content',
    );
    expect(content.left).toBeGreaterThan(200);
    expect(content.top).toBeGreaterThan(80);
    expect(content.width).toBeLessThan(600);
    expect(content.height).toBeLessThan(400);
  });

  it('uses custom framing when the clip framing preset is omitted', () => {
    const clip = clipFor('video', undefined);
    const composition = createComposition([source], [clip]);
    const visualBounds = { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh };

    expectRect(resolveVisualClipFraming(clip, visualBounds, source.width!, source.height!).rect, visualBounds);
    expect(editableVisualClipTransform(composition, clip, transform, bounds)).toBe(transform);

    const phone = { ...clip, appearance: { ...clip.appearance, frame: 'iphone-16-max' as const } };
    const resized = resizePhoneFrameTransform(composition, phone, transform, bounds, { x: 0, y: 0 });
    expectRect(resized, transform);
  });

  it('keeps a phone transform unchanged while editing its framing', () => {
    const clip = clipFor('video', 'fit');
    clip.appearance = { ...clip.appearance, frame: 'iphone-16-max' };
    const composition = createComposition([source], [clip]);

    expect(editableVisualClipTransform(composition, clip, transform, bounds)).toBe(transform);
  });

  it('falls back to the viewport dimensions when an editable visual has no asset metadata', () => {
    const clip = clipFor('video', 'fit');
    const composition = createComposition([source], [clip]);
    const missingAssetClip = { ...clip, assetId: 'missing-asset' };

    const normalized = editableVisualClipTransform(composition, missingAssetClip, transform, bounds);

    expectRect(normalized, { x: 0.25, y: 0.1, width: 0.5, height: 0.5 });
  });

  it('mirrors the in-place custom crop destination without moving its source crop', () => {
    const clip = clipFor('video', 'custom');
    const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    clip.crop = crop;
    clip.isMirrored = true;
    clip.isMirroredY = true;

    const framing = resolveVisualClipFraming(
      clip,
      { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh },
      source.width!,
      source.height!,
      crop,
      'custom',
    );

    expectRect(framing.rect, { x: 420, y: 320, width: 400, height: 240 });
    expectRect(framing.sourceRect!, { x: 192, y: 216, width: 960, height: 432 });
  });

  it.each(['screen', 'video', 'image'] as const)(
    'uses the complete transform box and a resized squircle mask for %s',
    (kind) => {
      const clip = clipFor(kind, 'squircle');
      const composition = createComposition([source], [clip]);
      const visibleBounds = {
        x: bounds.dx + transform.x * bounds.dw,
        y: bounds.dy + transform.y * bounds.dh,
        width: transform.width * bounds.dw,
        height: transform.height * bounds.dh,
      };
      const framing = resolveVisualClipFraming(
        clip,
        visibleBounds,
        source.width!,
        source.height!,
        undefined,
        'squircle',
      );
      const display = visualClipDisplayLayout(
        clip,
        transform,
        { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh },
        source.width!,
        source.height!,
        'squircle',
      );

      expectRect(framing.rect, visibleBounds);
      expect(display.left).toBeCloseTo(visibleBounds.x, 10);
      expect(display.top).toBeCloseTo(visibleBounds.y, 10);
      expect(display.width).toBeCloseTo(visibleBounds.width, 10);
      expect(display.height).toBeCloseTo(visibleBounds.height, 10);
      expect(framing.mask).toBe('squircle');
      expect(framing.rect.width / framing.rect.height).toBeCloseTo(visibleBounds.width / visibleBounds.height, 10);
      expect(framing.sourceRect).toBeDefined();
      expect(framing.sourceRect!.width / framing.sourceRect!.height).toBeCloseTo(
        visibleBounds.width / visibleBounds.height,
        10,
      );
      expect(composition.clips[0]).toMatchObject({ cameraFramingPreset: 'squircle' });
    },
  );

  it.each(['screen', 'video', 'image'] as const)('does not rewrite the %s transform for squircle editing', (kind) => {
    const clip = clipFor(kind, 'squircle');
    const composition = createComposition([source], [clip]);

    expect(editableVisualClipTransform(composition, clip, transform, bounds)).toBe(transform);
  });

  it('keeps webcam squircles constrained to a square', () => {
    const clip = clipFor('webcam', 'squircle');
    const visibleBounds = {
      x: bounds.dx + transform.x * bounds.dw,
      y: bounds.dy + transform.y * bounds.dh,
      width: transform.width * bounds.dw,
      height: transform.height * bounds.dh,
    };
    const framing = resolveVisualClipFraming(clip, visibleBounds, source.width!, source.height!, undefined, 'squircle');

    expect(framing.mask).toBe('squircle');
    expect(framing.rect.width).toBeCloseTo(framing.rect.height, 10);
    expect(framing.rect.width).toBeLessThan(visibleBounds.width);
    expect(framing.rect.height).toBeCloseTo(visibleBounds.height, 10);
  });

  it.each(['iphone-16-max', 'pixel-9-pro'] as const)(
    'keeps the native media aspect when the %s phone frame is selected',
    (frame) => {
      const portraitSource = { ...source, width: 1_080, height: 1_920 };
      const clip = clipFor('video', 'fit');
      clip.appearance = { ...clip.appearance, frame };
      const composition = createComposition([portraitSource], [clip]);
      const display = visualClipDisplayLayout(
        clip,
        transform,
        { x: 0, y: 0, width: 800, height: 450 },
        portraitSource.width!,
        portraitSource.height!,
        'fit',
      );
      const nativeAspect = frame === 'iphone-16-max' ? 415 / 843 : 353 / 745;

      expect(display.width / display.height).toBeCloseTo(nativeAspect, 10);
      expect(display.width).toBeLessThan(transform.width * 800);
      expect(display.height).toBeLessThanOrEqual(transform.height * 450);
      expect(composition.clips[0]).toMatchObject({ appearance: { frame } });
    },
  );

  it.each(['iphone-16-max', 'pixel-9-pro'] as const)(
    'keeps the top-left anchor stable while resizing a fitted %s phone from the bottom-right',
    (frame) => {
      const clip = clipFor('video', 'fit');
      clip.appearance = { ...clip.appearance, frame };
      const composition = createComposition([source], [clip]);
      const viewport = { x: 0, y: 0, width: 800, height: 450 };
      const initial = visualClipDisplayLayout(clip, transform, viewport, source.width!, source.height!, 'fit');
      const resizedTransform = resizePhoneFrameTransform(
        composition,
        clip,
        transform,
        { dx: viewport.x, dy: viewport.y, dw: viewport.width, dh: viewport.height },
        { x: 0.1, y: 0.1 },
        'bottom-right',
      );
      const resized = visualClipDisplayLayout(clip, resizedTransform, viewport, source.width!, source.height!, 'fit');

      expect(resized.left).toBeCloseTo(initial.left, 10);
      expect(resized.top).toBeCloseTo(initial.top, 10);
      expect(resized.width).toBeGreaterThan(initial.width);
      expect(resized.height).toBeGreaterThan(initial.height);
    },
  );

  it.each(['iphone-16-max', 'pixel-9-pro'] as const)(
    'keeps the bottom-right anchor stable while resizing a fitted %s phone from the top-left',
    (frame) => {
      const clip = clipFor('video', 'fit');
      clip.appearance = { ...clip.appearance, frame };
      const composition = createComposition([source], [clip]);
      const viewport = { x: 0, y: 0, width: 800, height: 450 };
      const initial = visualClipDisplayLayout(clip, transform, viewport, source.width!, source.height!, 'fit');
      const resized = visualClipDisplayLayout(
        clip,
        resizePhoneFrameTransform(
          composition,
          clip,
          transform,
          { dx: viewport.x, dy: viewport.y, dw: viewport.width, dh: viewport.height },
          { x: -0.1, y: -0.1 },
          'top-left',
        ),
        viewport,
        source.width!,
        source.height!,
        'fit',
      );

      expect(resized.left + resized.width).toBeCloseTo(initial.left + initial.width, 10);
      expect(resized.top + resized.height).toBeCloseTo(initial.top + initial.height, 10);
      expect(resized.width).toBeGreaterThan(initial.width);
      expect(resized.height).toBeGreaterThan(initial.height);
    },
  );

  it('leaves a non-phone resize request unchanged', () => {
    const clip = clipFor('video', 'custom');
    const composition = createComposition([source], [clip]);

    expect(
      resizePhoneFrameTransform(
        composition,
        clip,
        transform,
        { dx: bounds.dx, dy: bounds.dy, dw: bounds.dw, dh: bounds.dh },
        { x: 0.1, y: 0.1 },
        'bottom-right',
      ),
    ).toBe(transform);
  });

  it.each([
    ['top', { x: 0, y: -0.05 }],
    ['left', { x: -0.05, y: 0 }],
    [undefined, { x: 0, y: 0 }],
  ] as const)('handles a custom phone resize from the %s edge', (edge, delta) => {
    const clip = clipFor('video', 'custom');
    clip.appearance = { ...clip.appearance, frame: 'iphone-16-max' };
    const composition = createComposition([source], [clip]);

    const resized = resizePhoneFrameTransform(composition, clip, transform, bounds, delta, edge);

    const viewport = { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh };
    const before = visualClipDisplayLayout(clip, transform, viewport, source.width!, source.height!, 'custom');
    const after = visualClipDisplayLayout(clip, resized, viewport, source.width!, source.height!, 'custom');
    expect(after.width / after.height).toBeCloseTo(before.width / before.height, 10);
    if (edge === 'top') expect(after.top + after.height).toBeCloseTo(before.top + before.height, 10);
    else if (edge === 'left') expect(after.left + after.width).toBeCloseTo(before.left + before.width, 10);
    else expectRect(resized, transform);
  });

  it('falls back to the viewport dimensions when resizing a phone without asset metadata', () => {
    const clip = clipFor('video', 'fit');
    clip.appearance = { ...clip.appearance, frame: 'iphone-16-max' };
    const composition = createComposition([source], [clip]);
    const missingAssetClip = { ...clip, assetId: 'missing-asset' };

    const resized = resizePhoneFrameTransform(composition, missingAssetClip, transform, bounds, { x: 0, y: 0 });

    const explicitMetadata = createComposition([{ ...source, width: bounds.dw, height: bounds.dh }], [clip]);
    expectRect(resized, resizePhoneFrameTransform(explicitMetadata, clip, transform, bounds, { x: 0, y: 0 }));
  });

  it.each(['iphone-16-max', 'pixel-9-pro'] as const)(
    'resizes a cropped custom %s phone through its transform branch',
    (frame) => {
      const clip = clipFor('video', 'custom');
      clip.crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
      clip.appearance = { ...clip.appearance, frame };
      const composition = createComposition([source], [clip]);
      const viewport = { x: 0, y: 0, width: 800, height: 450 };
      const initial = visualClipDisplayLayout(clip, transform, viewport, source.width!, source.height!, 'custom');
      const resizedTransform = resizePhoneFrameTransform(
        composition,
        clip,
        transform,
        { dx: viewport.x, dy: viewport.y, dw: viewport.width, dh: viewport.height },
        { x: 0.1, y: 0.01 },
        'right',
      );
      const resized = visualClipDisplayLayout(
        clip,
        resizedTransform,
        viewport,
        source.width!,
        source.height!,
        'custom',
      );

      expect(resized.width).toBeGreaterThan(initial.width);
      expect(resized.height).toBeGreaterThan(initial.height);
    },
  );

  it('contains a very tall source in a fitted phone when the height branch wins', () => {
    const tallSource = { ...source, width: 300, height: 1_920 };
    const clip = clipFor('video', 'fit');
    clip.appearance = { ...clip.appearance, frame: 'iphone-16-max' };
    const composition = createComposition([tallSource], [clip]);
    const viewport = { x: 0, y: 0, width: 800, height: 450 };
    const resized = resizePhoneFrameTransform(
      composition,
      clip,
      transform,
      { dx: viewport.x, dy: viewport.y, dw: viewport.width, dh: viewport.height },
      { x: 0.01, y: 0.1 },
      'bottom-right',
    );

    expect(resized.width).toBeGreaterThan(0);
    expect(resized.height).toBeGreaterThan(0);
    expect(resized.width / resized.height).toBeCloseTo(tallSource.width / tallSource.height, 10);
  });
});
