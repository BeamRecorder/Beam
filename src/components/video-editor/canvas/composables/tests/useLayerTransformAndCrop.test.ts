import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayerTransformAndCrop, type UseLayerTransformAndCropOptions } from '../useLayerTransformAndCrop';
import type {
  BlurClip,
  CaptionClip,
  ClipComposition,
  NormalizedTransform,
  VisualClip,
} from '~/media/shared/composition-types';
import type { VideoWindowBounds } from '../useCameraZoom';
import { DEFAULT_OUTPUT_CANVAS } from '../../output-canvas';
import { computeWebcamLayout, webcamSettingsForAppearance } from '../../../composition/webcam/webcam-zoom';
import { resolveCameraFraming } from '../../../composition/camera-layout';
import { frameOuterRect } from '../../../composition/appearance/frames';
import { projectCameraRect } from '../layer-transform-geometry';
import {
  perspectiveCoverScale,
  projectPerspectivePoint,
  unprojectPerspectivePoint,
} from '../../../zoom/perspective-projection';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';

const screenClip = (): VisualClip => ({
  id: 'screen',
  kind: 'screen',
  name: 'Screen',
  assetId: 'screen-asset',
  timelineStartMs: 0,
  timelineDurationMs: 10_000,
  sourceInMs: 0,
  sourceDurationMs: 10_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
});

const webcamClip = (): VisualClip => ({
  id: 'webcam',
  kind: 'webcam',
  name: 'Webcam',
  assetId: 'webcam-asset',
  timelineStartMs: 0,
  timelineDurationMs: 10_000,
  sourceInMs: 0,
  sourceDurationMs: 10_000,
  playbackRate: 1,
  enabled: true,
  order: 1,
  transform: { x: 0.1, y: 0.1, width: 0.25, height: 0.25 },
  appearance: createDefaultClipAppearance('webcam'),
  isMirrored: true,
  isMirroredY: false,
});

const squircleWebcamClip = (overrides: Partial<VisualClip> = {}): VisualClip => ({
  ...webcamClip(),
  cameraLayoutPreset: 'custom',
  cameraFramingPreset: 'squircle',
  ...overrides,
});

const imageClip = (): VisualClip => ({
  id: 'image',
  kind: 'image',
  name: 'Image',
  assetId: 'image-asset',
  timelineStartMs: 0,
  timelineDurationMs: 10_000,
  sourceInMs: 0,
  sourceDurationMs: 10_000,
  playbackRate: 1,
  enabled: true,
  order: 2,
  transform: { x: 0.25, y: 0.2, width: 0.5, height: 0.4 },
  crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
  appearance: createDefaultClipAppearance('image'),
  isMirrored: false,
  isMirroredY: false,
});

const phoneImageClip = (
  frame: 'iphone-16-max' | 'pixel-9-pro' = 'iphone-16-max',
  cameraFramingPreset: VisualClip['cameraFramingPreset'] = 'fit',
): VisualClip => ({
  ...imageClip(),
  id: 'phone-image',
  transform: { x: 0.25, y: 0.2, width: 0.5, height: 0.4 },
  appearance: { ...createDefaultClipAppearance('image'), frame },
  ...(cameraFramingPreset === undefined ? {} : { cameraFramingPreset }),
});

const blurClip = (overrides: Partial<BlurClip> = {}): BlurClip => ({
  id: 'blur',
  kind: 'blur',
  assetId: '',
  name: 'Blur',
  timelineStartMs: 0,
  timelineDurationMs: 10_000,
  sourceInMs: 0,
  sourceDurationMs: 10_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.25 },
  shape: 'rectangle',
  mode: 'blur',
  strength: 60,
  feather: 0,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#000000',
  ...overrides,
});

const captionClip = (): CaptionClip => ({
  id: 'caption',
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: 0,
  timelineDurationMs: 10_000,
  sourceInMs: 0,
  sourceDurationMs: 10_000,
  playbackRate: 1,
  enabled: true,
  order: 3,
  caption: {
    type: 'text',
    sentences: [],
    style: { ...createDefaultCaptionStyle(32), color: '#fff', shadowColor: '#000', shadowBlur: 2, placement: 'center' },
  },
});

const composition = (): ClipComposition => ({
  schemaVersion: 6,
  keyboardCaptionSessions: [],
  assets: [
    {
      id: 'screen-asset',
      kind: 'video',
      name: 'Screen',
      fileName: null,
      durationMs: 10_000,
      width: 1920,
      height: 1080,
      src: 'screen.mp4',
      origin: 'session',
    },
    {
      id: 'webcam-asset',
      kind: 'video',
      name: 'Webcam',
      fileName: null,
      durationMs: 10_000,
      width: 1280,
      height: 720,
      src: 'webcam.mp4',
      origin: 'session',
    },
    {
      id: 'image-asset',
      kind: 'image',
      name: 'Image',
      fileName: null,
      durationMs: 10_000,
      width: 800,
      height: 600,
      src: 'image.png',
      origin: 'project',
    },
  ],
  clips: [screenClip(), webcamClip(), imageClip(), captionClip()],
});

const bounds = (): VideoWindowBounds => ({ dx: 10, dy: 20, dw: 800, dh: 450, scale: 2, focusX: 410, focusY: 245 });

let wrapper: VueWrapper | undefined;

const pointer = (target: HTMLElement, overrides: Partial<PointerEvent> = {}) =>
  ({
    clientX: 100,
    clientY: 100,
    button: 0,
    pointerId: 1,
    shiftKey: false,
    currentTarget: target,
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
    ...overrides,
  }) as unknown as PointerEvent;

const mountComposable = (
  selected: VisualClip | BlurClip | CaptionClip | null,
  cropping = false,
  initialComposition: ClipComposition = composition(),
) => {
  const selectedRef = ref<VisualClip | BlurClip | CaptionClip | null>(selected);
  const croppingRef = ref(cropping);
  const compositionRef = ref(initialComposition);
  const currentTime = ref(1);
  const selectedBounds = ref<VideoWindowBounds | null>(bounds());
  const overlayBounds = ref<VideoWindowBounds | null>(bounds());
  const outputCanvas = ref({ ...DEFAULT_OUTPUT_CANVAS, width: 800, height: 450 });
  const options: UseLayerTransformAndCropOptions = {
    composition: () => compositionRef.value,
    currentTime: () => currentTime.value,
    selectedTransformClip: () => selectedRef.value,
    videoWindowBounds: () => selectedBounds.value,
    overlayWindowBounds: () => overlayBounds.value,
    isCropping: () => croppingRef.value,
    outputCanvas: () => outputCanvas.value,
    onUpdateTransform: vi.fn(),
    onUpdateCrop: vi.fn(),
    onSelectTransformClip: vi.fn(),
  };
  let state!: ReturnType<typeof useLayerTransformAndCrop>;
  const Harness = defineComponent({
    setup: () => {
      state = useLayerTransformAndCrop(options);
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
  return {
    selectedRef,
    compositionRef,
    currentTime,
    croppingRef,
    selectedBounds,
    overlayBounds,
    outputCanvas,
    options,
    get state() {
      return state;
    },
  };
};

const squircleTransformForVisibleFrame = (clip: VisualClip, windowBounds: VideoWindowBounds): NormalizedTransform => {
  const settings = webcamSettingsForAppearance(clip.appearance, clip.isMirrored, clip.isMirroredY);
  const layout = computeWebcamLayout(windowBounds.dw, windowBounds.dh, windowBounds.scale, settings, clip.transform);
  const framing = resolveCameraFraming(
    'squircle',
    { x: layout.x, y: layout.y, width: layout.width, height: layout.height },
    1_280,
    720,
  );
  const zoomFactor = settings.reactToZoom ? 1 / Math.max(1, windowBounds.scale) : 1;
  const width = framing.rect.width / (windowBounds.dw * zoomFactor);
  const height = framing.rect.height / (windowBounds.dh * zoomFactor);
  return {
    x: (framing.rect.x + framing.rect.width) / windowBounds.dw - width,
    y: (framing.rect.y + framing.rect.height) / windowBounds.dh - height,
    width,
    height,
  };
};

type SelectionStyle = {
  display?: string;
  left?: string;
  top?: string;
  width?: string;
  height?: string;
};
const stylePixels = (style: SelectionStyle, property: keyof SelectionStyle) => Number.parseFloat(style[property] ?? '');
const selectionRect = (style: SelectionStyle) => ({
  left: stylePixels(style, 'left'),
  top: stylePixels(style, 'top'),
  width: stylePixels(style, 'width'),
  height: stylePixels(style, 'height'),
});

beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

describe('useLayerTransformAndCrop', () => {
  it('computes hidden, projected, webcam and mirrored crop styles', async () => {
    const mounted = mountComposable(null);
    expect(mounted.state.transformHandleStyle.value).toEqual({ display: 'none' });
    expect(mounted.state.cropOverlayStyle.value).toEqual({ display: 'none' });

    mounted.selectedRef.value = imageClip();
    await nextTick();
    expect(mounted.state.transformHandleStyle.value).toMatchObject({
      left: '0px',
      top: '-45px',
      width: '800px',
      height: '360px',
    });
    expect(mounted.state.transformSelectionViewportStyle.value).toEqual({
      left: '10px',
      top: '20px',
      width: '800px',
      height: '450px',
    });

    const video = { ...imageClip(), id: 'video', kind: 'video' as const };
    mounted.compositionRef.value = {
      ...mounted.compositionRef.value,
      clips: [...mounted.compositionRef.value.clips, video],
    };
    mounted.selectedRef.value = video;
    await nextTick();
    expect(mounted.state.transformHandleStyle.value).toMatchObject({
      left: '0px',
      top: '-45px',
      width: '800px',
      height: '360px',
    });

    mounted.croppingRef.value = true;
    await nextTick();
    expect(mounted.state.cropContainerStyle.value).toMatchObject({
      left: '10px',
      top: '-25px',
      width: '800px',
      height: '360px',
    });
    expect(mounted.state.cropOverlayStyle.value).toEqual({
      left: '10%',
      top: '20%',
      width: '70%',
      height: '60%',
    });

    mounted.selectedRef.value = webcamClip();
    await nextTick();
    expect(mounted.state.transformHandleStyle.value).toMatchObject({ width: '100px', height: '56.25px' });
    expect(mounted.state.cropOverlayStyle.value).not.toEqual({ display: 'none' });

    mounted.selectedRef.value = captionClip();
    mounted.overlayBounds.value = null;
    mounted.selectedBounds.value = null;
    await nextTick();
    expect(mounted.state.transformHandleStyle.value).toEqual({ display: 'none' });
  });

  it('exposes a projected bbox, corners and all eight anchors for tilted selections while preserving the 2D path', async () => {
    const clip = blurClip();
    const scene = composition();
    scene.clips = [screenClip(), clip];
    const mounted = mountComposable(clip, false, scene);
    const flatViewport = bounds();

    await nextTick();
    const flatStyle = selectionRect(mounted.state.transformHandleStyle.value);
    expect(mounted.state.transformHandlePositions.value).toBeUndefined();
    expect(mounted.state.transformPerspectiveCorners.value).toBeUndefined();

    const layout = {
      left: flatStyle.left + flatViewport.dx,
      top: flatStyle.top + flatViewport.dy,
      width: flatStyle.width,
      height: flatStyle.height,
    };
    const tiltedViewport = { ...flatViewport, tiltX: 0.32, tiltY: -0.24 };
    const perspective = { tiltX: tiltedViewport.tiltX, tiltY: tiltedViewport.tiltY };
    mounted.overlayBounds.value = tiltedViewport;
    await nextTick();

    const projectedStyle = selectionRect(mounted.state.transformHandleStyle.value);
    const positions = mounted.state.transformHandlePositions.value;
    const corners = mounted.state.transformPerspectiveCorners.value;
    const anchors = ['top-left', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left'] as const;
    expect(Object.keys(positions ?? {}).sort()).toEqual([...anchors].sort());
    expect(corners).toHaveLength(4);

    const viewportRect = {
      x: tiltedViewport.dx,
      y: tiltedViewport.dy,
      width: tiltedViewport.dw,
      height: tiltedViewport.dh,
    };
    const coverScale = perspectiveCoverScale(viewportRect.width, viewportRect.height, perspective);
    const pointFor = (anchor: (typeof anchors)[number]) => {
      const horizontal = anchor.includes('left') ? 0 : anchor.includes('right') ? 1 : 0.5;
      const vertical = anchor.includes('top') ? 0 : anchor.includes('bottom') ? 1 : 0.5;
      return projectPerspectivePoint(
        { x: layout.left + layout.width * horizontal, y: layout.top + layout.height * vertical },
        viewportRect,
        perspective,
        coverScale,
      );
    };
    const projected = Object.fromEntries(anchors.map((anchor) => [anchor, pointFor(anchor)])) as Record<
      (typeof anchors)[number],
      { x: number; y: number }
    >;
    const projectedCorners = [
      projected['top-left'],
      projected['top-right'],
      projected['bottom-right'],
      projected['bottom-left'],
    ];
    const left = Math.min(...projectedCorners.map((point) => point.x));
    const top = Math.min(...projectedCorners.map((point) => point.y));
    const right = Math.max(...projectedCorners.map((point) => point.x));
    const bottom = Math.max(...projectedCorners.map((point) => point.y));

    expect(projectedStyle.left).toBeCloseTo(left - tiltedViewport.dx);
    expect(projectedStyle.top).toBeCloseTo(top - tiltedViewport.dy);
    expect(projectedStyle.width).toBeCloseTo(right - left);
    expect(projectedStyle.height).toBeCloseTo(bottom - top);
    anchors.forEach((anchor) => {
      expect(positions?.[anchor]?.x).toBeCloseTo(projected[anchor].x - left);
      expect(positions?.[anchor]?.y).toBeCloseTo(projected[anchor].y - top);
    });
    projectedCorners.forEach((point, index) => {
      expect(corners?.[index]?.x).toBeCloseTo(point.x - left);
      expect(corners?.[index]?.y).toBeCloseTo(point.y - top);
    });

    mounted.overlayBounds.value = flatViewport;
    await nextTick();
    expect(mounted.state.transformHandleStyle.value).toEqual({
      left: `${flatStyle.left}px`,
      top: `${flatStyle.top}px`,
      width: `${flatStyle.width}px`,
      height: `${flatStyle.height}px`,
    });
    expect(mounted.state.transformHandlePositions.value).toBeUndefined();
    expect(mounted.state.transformPerspectiveCorners.value).toBeUndefined();
  });

  it('deprojects a tilted resize delta before updating the transform instead of treating the screen delta as axis-aligned', async () => {
    const clip = blurClip();
    const scene = composition();
    scene.clips = [screenClip(), clip];
    const mounted = mountComposable(clip, false, scene);
    mounted.selectedBounds.value = { ...bounds(), dx: 0, dy: 0, dw: 800, dh: 450 };
    const flatOverlay = { ...bounds(), dx: 50, dy: 25, dw: 900, dh: 500, scale: 1, focusX: 500, focusY: 275 };
    mounted.overlayBounds.value = flatOverlay;
    await nextTick();

    const flatStyle = selectionRect(mounted.state.transformHandleStyle.value);
    const layout = {
      left: flatStyle.left + flatOverlay.dx,
      top: flatStyle.top + flatOverlay.dy,
      width: flatStyle.width,
      height: flatStyle.height,
    };
    const tiltedOverlay = { ...flatOverlay, tiltX: 0.5, tiltY: -0.35 };
    mounted.overlayBounds.value = tiltedOverlay;
    await nextTick();

    const target = document.createElement('div');
    Object.assign(target, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn().mockReturnValue(true),
      releasePointerCapture: vi.fn(),
    });
    const start = { clientX: 300, clientY: 200 };
    const screenDelta = { x: 44, y: 27 };
    mounted.state.beginTransformDrag(pointer(target, start), 'resize', 'bottom-right');
    const initial = mounted.state.transformDraft.value!;
    mounted.state.moveTransformDrag(
      pointer(target, { clientX: start.clientX + screenDelta.x, clientY: start.clientY + screenDelta.y }),
    );

    const perspective = { tiltX: tiltedOverlay.tiltX, tiltY: tiltedOverlay.tiltY };
    const viewport = {
      x: tiltedOverlay.dx,
      y: tiltedOverlay.dy,
      width: tiltedOverlay.dw,
      height: tiltedOverlay.dh,
    };
    const coverScale = perspectiveCoverScale(viewport.width, viewport.height, perspective);
    const source = { x: layout.left + layout.width, y: layout.top + layout.height };
    const projectedSource = projectPerspectivePoint(source, viewport, perspective, coverScale);
    const deprojectedTarget = unprojectPerspectivePoint(
      { x: projectedSource.x + screenDelta.x, y: projectedSource.y + screenDelta.y },
      viewport,
      perspective,
      coverScale,
    );
    const pointerDelta = { x: deprojectedTarget.x - source.x, y: deprojectedTarget.y - source.y };
    const expectedWidth = initial.width + pointerDelta.x / (tiltedOverlay.dw * tiltedOverlay.scale);
    const expectedHeight = initial.height + pointerDelta.y / (tiltedOverlay.dh * tiltedOverlay.scale);
    const axisAlignedWidth = initial.width + screenDelta.x / (tiltedOverlay.dw * tiltedOverlay.scale);
    const axisAlignedHeight = initial.height + screenDelta.y / (tiltedOverlay.dh * tiltedOverlay.scale);
    const resized = mounted.state.transformDraft.value!;

    expect(projectPerspectivePoint(deprojectedTarget, viewport, perspective, coverScale).x).toBeCloseTo(
      projectedSource.x + screenDelta.x,
      5,
    );
    expect(projectPerspectivePoint(deprojectedTarget, viewport, perspective, coverScale).y).toBeCloseTo(
      projectedSource.y + screenDelta.y,
      5,
    );
    expect(resized.width).toBeCloseTo(expectedWidth, 5);
    expect(resized.height).toBeCloseTo(expectedHeight, 5);
    expect(resized.width).not.toBeCloseTo(axisAlignedWidth, 3);
    expect(resized.height).not.toBeCloseTo(axisAlignedHeight, 3);
  });

  it('uses an unframed source-fit crop layout for phone frames and restores the outer frame outside crop mode', async () => {
    const clip = phoneImageClip();
    const scene = composition();
    scene.clips = [screenClip(), clip];
    const mounted = mountComposable(clip, false, scene);
    const windowBounds = bounds();
    const layout = {
      left: windowBounds.dx + clip.transform.x * windowBounds.dw,
      top: windowBounds.dy + clip.transform.y * windowBounds.dh,
      width: clip.transform.width * windowBounds.dw,
      height: clip.transform.height * windowBounds.dh,
    };
    const phoneOuter = frameOuterRect(
      { x: layout.left, y: layout.top, width: layout.width, height: layout.height },
      'iphone-16-max',
    );
    const expectedOuter = projectCameraRect(windowBounds, {
      left: phoneOuter.x,
      top: phoneOuter.y,
      width: phoneOuter.width,
      height: phoneOuter.height,
    });

    expect(mounted.state.transformHandleStyle.value).toMatchObject({
      left: `${expectedOuter.left - windowBounds.dx}px`,
      top: `${expectedOuter.top - windowBounds.dy}px`,
      width: `${expectedOuter.width}px`,
      height: `${expectedOuter.height}px`,
    });

    mounted.croppingRef.value = true;
    await nextTick();
    const fit = resolveCameraFraming(
      'fit',
      { x: layout.left, y: layout.top, width: layout.width, height: layout.height },
      800,
      600,
    ).rect;
    const expectedFit = projectCameraRect(windowBounds, {
      left: fit.x,
      top: fit.y,
      width: fit.width,
      height: fit.height,
    });

    expect(mounted.state.cropContainerStyle.value).toEqual({
      left: `${expectedFit.left}px`,
      top: `${expectedFit.top}px`,
      width: `${expectedFit.width}px`,
      height: `${expectedFit.height}px`,
    });
    expect(mounted.state.cropOverlayStyle.value).toEqual({
      left: '10%',
      top: '20%',
      width: '70%',
      height: '60%',
    });

    mounted.croppingRef.value = false;
    await nextTick();
    expect(mounted.state.transformHandleStyle.value).toMatchObject({
      left: `${expectedOuter.left - windowBounds.dx}px`,
      top: `${expectedOuter.top - windowBounds.dy}px`,
      width: `${expectedOuter.width}px`,
      height: `${expectedOuter.height}px`,
    });
  });

  it.each([
    ['iphone-16-max', 'bottom-right'],
    ['iphone-16-max', 'top-left'],
    ['pixel-9-pro', 'bottom-right'],
    ['pixel-9-pro', 'top-left'],
  ] as const)(
    'keeps the opposite anchor stable and preserves the preview after committing a %s fit resize from %s',
    async (frame, corner) => {
      const clip = phoneImageClip(frame);
      const scene = composition();
      scene.clips = [screenClip(), clip];
      const mounted = mountComposable(clip, false, scene);
      const target = document.createElement('div');
      Object.assign(target, {
        setPointerCapture: vi.fn(),
        hasPointerCapture: vi.fn().mockReturnValue(true),
        releasePointerCapture: vi.fn(),
      });
      const initial = selectionRect(mounted.state.transformHandleStyle.value);
      const initialRight = initial.left + initial.width;
      const initialBottom = initial.top + initial.height;
      const pointerPosition = corner === 'bottom-right' ? { clientX: 180, clientY: 180 } : { clientX: 20, clientY: 20 };

      mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'resize', corner);
      mounted.state.moveTransformDrag(pointer(target, pointerPosition));
      const preview = selectionRect(mounted.state.transformHandleStyle.value);

      expect(preview.width).toBeGreaterThan(initial.width);
      expect(preview.height).toBeGreaterThan(initial.height);
      if (corner === 'bottom-right') {
        expect(preview.left).toBeCloseTo(initial.left, 5);
        expect(preview.top).toBeCloseTo(initial.top, 5);
      } else {
        expect(preview.left + preview.width).toBeCloseTo(initialRight, 5);
        expect(preview.top + preview.height).toBeCloseTo(initialBottom, 5);
      }

      mounted.state.endTransformDrag(pointer(target, pointerPosition));
      const committedTransform = vi.mocked(mounted.options.onUpdateTransform).mock.calls.at(-1)?.[0];
      expect(committedTransform).toBeDefined();

      const committedClip = { ...clip, transform: committedTransform! };
      mounted.compositionRef.value = { ...scene, clips: [screenClip(), committedClip] };
      mounted.selectedRef.value = committedClip;
      await nextTick();
      const committed = selectionRect(mounted.state.transformHandleStyle.value);

      expect(committed.left).toBeCloseTo(preview.left, 5);
      expect(committed.top).toBeCloseTo(preview.top, 5);
      expect(committed.width).toBeCloseTo(preview.width, 5);
      expect(committed.height).toBeCloseTo(preview.height, 5);
    },
  );

  it.each([
    ['iphone-16-max', 'custom'],
    ['iphone-16-max', undefined],
    ['pixel-9-pro', 'custom'],
    ['pixel-9-pro', undefined],
  ] as const)('exposes only the four corner resize handles for a %s phone with %s framing', (frame, preset) => {
    const clip = phoneImageClip(frame, preset);
    const scene = composition();
    scene.clips = [screenClip(), clip];
    const mounted = mountComposable(clip, false, scene);

    expect(mounted.state.transformResizeCorners.value).toEqual([
      'top-left',
      'top-right',
      'bottom-right',
      'bottom-left',
    ]);
  });

  it.each([
    ['iphone-16-max', 'custom', 'top-left', { clientX: 20, clientY: 20 }, 'bottom-right'],
    ['iphone-16-max', 'custom', 'top-right', { clientX: 180, clientY: 20 }, 'bottom-left'],
    ['iphone-16-max', 'custom', 'bottom-right', { clientX: 180, clientY: 180 }, 'top-left'],
    ['iphone-16-max', 'custom', 'bottom-left', { clientX: 20, clientY: 180 }, 'top-right'],
    ['iphone-16-max', undefined, 'top-left', { clientX: 20, clientY: 20 }, 'bottom-right'],
    ['iphone-16-max', undefined, 'top-right', { clientX: 180, clientY: 20 }, 'bottom-left'],
    ['iphone-16-max', undefined, 'bottom-right', { clientX: 180, clientY: 180 }, 'top-left'],
    ['iphone-16-max', undefined, 'bottom-left', { clientX: 20, clientY: 180 }, 'top-right'],
    ['pixel-9-pro', 'custom', 'top-left', { clientX: 20, clientY: 20 }, 'bottom-right'],
    ['pixel-9-pro', 'custom', 'top-right', { clientX: 180, clientY: 20 }, 'bottom-left'],
    ['pixel-9-pro', 'custom', 'bottom-right', { clientX: 180, clientY: 180 }, 'top-left'],
    ['pixel-9-pro', 'custom', 'bottom-left', { clientX: 20, clientY: 180 }, 'top-right'],
    ['pixel-9-pro', undefined, 'top-left', { clientX: 20, clientY: 20 }, 'bottom-right'],
    ['pixel-9-pro', undefined, 'top-right', { clientX: 180, clientY: 20 }, 'bottom-left'],
    ['pixel-9-pro', undefined, 'bottom-right', { clientX: 180, clientY: 180 }, 'top-left'],
    ['pixel-9-pro', undefined, 'bottom-left', { clientX: 20, clientY: 180 }, 'top-right'],
  ] as const)(
    'resizes the %s phone from its %s corner with %s framing while keeping the %s anchor fixed',
    async (frame, preset, corner, pointerPosition, oppositeCorner) => {
      const clip = phoneImageClip(frame, preset);
      const scene = composition();
      scene.clips = [screenClip(), clip];
      const mounted = mountComposable(clip, false, scene);
      const target = document.createElement('div');
      Object.assign(target, {
        setPointerCapture: vi.fn(),
        hasPointerCapture: vi.fn().mockReturnValue(true),
        releasePointerCapture: vi.fn(),
      });
      const initial = selectionRect(mounted.state.transformHandleStyle.value);
      const initialRight = initial.left + initial.width;
      const initialBottom = initial.top + initial.height;

      mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'resize', corner);
      mounted.state.moveTransformDrag(pointer(target, pointerPosition));
      const resized = selectionRect(mounted.state.transformHandleStyle.value);

      expect(resized.width).toBeGreaterThan(initial.width);
      expect(resized.height).toBeGreaterThan(initial.height);
      if (oppositeCorner.includes('left')) expect(resized.left).toBeCloseTo(initial.left, 5);
      if (oppositeCorner.includes('top')) expect(resized.top).toBeCloseTo(initial.top, 5);
      if (oppositeCorner.includes('right')) expect(resized.left + resized.width).toBeCloseTo(initialRight, 5);
      if (oppositeCorner.includes('bottom')) expect(resized.top + resized.height).toBeCloseTo(initialBottom, 5);

      mounted.state.endTransformDrag(pointer(target, pointerPosition));
      expect(mounted.options.onUpdateTransform).toHaveBeenCalledWith(
        expect.objectContaining({ width: expect.any(Number) }),
      );
    },
  );

  it('projects blur handles through camera zoom and uses the visible circle bounds', async () => {
    const clip = blurClip();
    const scene = composition();
    scene.clips = [screenClip(), clip];
    const mounted = mountComposable(clip, false, scene);
    expect(mounted.state.transformHandleStyle.value).toMatchObject({
      left: '-80px',
      top: '45px',
      width: '640px',
      height: '225px',
    });

    mounted.selectedRef.value = blurClip({ shape: 'circle' });
    await nextTick();
    expect(mounted.state.transformHandleStyle.value).toMatchObject({
      left: '127.5px',
      top: '45px',
      width: '225px',
      height: '225px',
    });
  });

  it('hides transform handles when the selected clip is inactive or disabled, but keeps them calculated when fully outside the viewport', async () => {
    const clip = blurClip({ order: -1 });
    const scene = composition();
    scene.clips = [screenClip(), clip];
    const mounted = mountComposable(clip, false, scene);
    expect(mounted.state.transformSelectionViewportStyle.value).not.toEqual({ display: 'none' });

    mounted.currentTime.value = 11;
    await nextTick();
    expect(mounted.state.transformSelectionViewportStyle.value).toEqual({ display: 'none' });
    expect(mounted.state.transformHandleStyle.value).toEqual({ display: 'none' });

    const disabled = { ...clip, enabled: false };
    mounted.currentTime.value = 1;
    mounted.selectedRef.value = disabled;
    mounted.compositionRef.value = { ...scene, clips: [screenClip(), disabled] };
    await nextTick();
    expect(mounted.state.transformSelectionViewportStyle.value).toEqual({ display: 'none' });

    const outside = { ...clip, transform: { x: 2, y: 2, width: 0.2, height: 0.2 } };
    mounted.selectedRef.value = outside;
    mounted.compositionRef.value = { ...scene, clips: [screenClip(), outside] };
    await nextTick();
    expect(mounted.state.transformSelectionViewportStyle.value).not.toEqual({ display: 'none' });
    expect(mounted.state.transformHandleStyle.value).toMatchObject({
      left: '2800px',
      top: '1575px',
      width: '320px',
      height: '180px',
    });
    expect(mounted.selectedRef.value?.id).toBe('blur');
  });

  it('moves and resizes crop selections, clamps them, and commits both previews and final values', () => {
    const mounted = mountComposable(imageClip(), true);
    const target = document.createElement('div');
    const setPointerCapture = vi.fn();
    const hasPointerCapture = vi.fn().mockReturnValue(true);
    const releasePointerCapture = vi.fn();
    Object.assign(target, { setPointerCapture, hasPointerCapture, releasePointerCapture });

    mounted.state.beginCropDrag(pointer(target, { clientX: 100, clientY: 100 }), 'move');
    mounted.state.moveCropDrag(pointer(target, { clientX: -500, clientY: 800 }));
    expect(mounted.state.cropDraft.value).toMatchObject({ x: 0, y: 0.4 });
    mounted.state.endCropDrag(pointer(target));
    expect(mounted.options.onUpdateCrop).toHaveBeenCalledWith(expect.objectContaining({ x: 0, y: 0.4 }));
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    expect(releasePointerCapture).toHaveBeenCalledWith(1);

    mounted.state.beginCropDrag(pointer(target, { clientX: 100, clientY: 100 }), 'resize', 'top-left');
    mounted.state.moveCropDrag(pointer(target, { clientX: 1000, clientY: 1000 }));
    expect(mounted.state.cropDraft.value?.width).toBeGreaterThanOrEqual(0.05);
    mounted.state.commitCrop();
    expect(mounted.options.onUpdateCrop).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: expect.any(Number) }),
    );

    mounted.state.moveCropDrag(pointer(target));
    mounted.selectedBounds.value = null;
    mounted.state.beginCropDrag(pointer(target), 'resize', 'bottom-right');
    mounted.state.moveCropDrag(pointer(target, { clientX: 200, clientY: 200 }));
  });

  it('previews move and aspect-constrained resize transforms, including keyboard aspect updates', () => {
    const mounted = mountComposable(imageClip());
    const target = document.createElement('div');
    const setPointerCapture = vi.fn();
    const hasPointerCapture = vi.fn().mockReturnValue(true);
    const releasePointerCapture = vi.fn();
    Object.assign(target, { setPointerCapture, hasPointerCapture, releasePointerCapture });

    mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'move');
    mounted.state.moveTransformDrag(pointer(target, { clientX: 900, clientY: -800 }));
    expect(mounted.state.transformDraft.value).toMatchObject({ x: 0.75, y: -0.8 });
    expect(mounted.options.onUpdateTransform).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    expect(mounted.options.onUpdateTransform).not.toHaveBeenCalled();
    mounted.state.endTransformDrag(pointer(target));
    expect(mounted.options.onUpdateTransform).toHaveBeenCalledTimes(1);
    expect(mounted.options.onUpdateTransform).toHaveBeenCalledWith(expect.objectContaining({ x: 0.75 }));

    mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'resize', 'bottom-right');
    mounted.state.moveTransformDrag(pointer(target, { clientX: 1000, clientY: 1000, shiftKey: false }));
    expect(mounted.state.transformDraft.value?.height).toBeCloseTo(mounted.state.transformDraft.value!.width * 0.8);
    expect(mounted.options.onUpdateTransform).toHaveBeenCalledTimes(1);
    mounted.state.moveTransformDrag(pointer(target, { clientX: -1000, clientY: -1000, shiftKey: true }));
    expect(mounted.state.transformDraft.value?.width).toBeGreaterThanOrEqual(0.02);
    mounted.state.endTransformDrag(pointer(target));
    expect(setPointerCapture).toHaveBeenCalled();
    expect(mounted.options.onUpdateTransform).toHaveBeenCalledTimes(2);
  });

  it('resizes rectangular blur regions freely and locks square effects to a 1:1 ratio', () => {
    const mounted = mountComposable(blurClip());
    const target = document.createElement('div');
    Object.assign(target, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn().mockReturnValue(true),
      releasePointerCapture: vi.fn(),
    });

    mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'resize', 'bottom-right');
    mounted.state.moveTransformDrag(pointer(target, { clientX: 260, clientY: 280 }));
    expect(mounted.state.transformDraft.value).toMatchObject({ width: 0.5, height: 0.45 });
    mounted.state.endTransformDrag(pointer(target));

    mounted.selectedRef.value = blurClip({
      shape: 'square',
      transform: { x: 0.2, y: 0.2, width: 0.25, height: 0.25 },
    });
    expect(mounted.state.transformResizeCorners.value).toEqual([
      'top-left',
      'top-right',
      'bottom-right',
      'bottom-left',
    ]);
    mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'resize', 'bottom-right');
    mounted.state.moveTransformDrag(pointer(target, { clientX: 260, clientY: 100 }));
    const square = mounted.state.transformDraft.value!;
    expect(square.width).toBeGreaterThan(0.14);
    expect(square.width * 800).toBeCloseTo(square.height * 450);
  });

  it('keeps webcam transforms inside the output frame while moving and resizing', () => {
    const mounted = mountComposable(webcamClip());
    const target = document.createElement('div');
    Object.assign(target, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn().mockReturnValue(true),
      releasePointerCapture: vi.fn(),
    });

    mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'move');
    mounted.state.moveTransformDrag(pointer(target, { clientX: -1000, clientY: -1000 }));
    expect(mounted.state.transformDraft.value).toMatchObject({ x: -0.125, y: -0.125 });
    expect(mounted.state.transformHandleStyle.value).toMatchObject({ left: '0px', top: '0px' });
    mounted.state.endTransformDrag(pointer(target));

    mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'resize', 'bottom-right');
    mounted.state.moveTransformDrag(pointer(target, { clientX: 5_000, clientY: 5_000 }));
    const transform = mounted.state.transformDraft.value!;
    expect(transform.x + transform.width).toBeLessThanOrEqual(1);
    expect(transform.y + transform.height).toBeLessThanOrEqual(1);
  });

  it('starts squircle moves and resizes from the visible framed rectangle, not the outer transform', () => {
    const clip = squircleWebcamClip({
      transform: { x: 0.1, y: 0.1, width: 0.25, height: 0.25 },
    });
    const mounted = mountComposable(clip);
    const target = document.createElement('div');
    Object.assign(target, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn().mockReturnValue(true),
      releasePointerCapture: vi.fn(),
    });

    const visibleTransform = squircleTransformForVisibleFrame(clip, mounted.selectedBounds.value!);
    expect(mounted.state.transformHandleStyle.value).toMatchObject({
      left: '201.875px',
      top: '101.25px',
      width: '56.25px',
      height: '56.25px',
    });

    mounted.state.beginTransformDrag(pointer(target), 'move');

    expect(mounted.state.transformDraft.value).toEqual(visibleTransform);
    expect(mounted.state.transformDraft.value).not.toEqual(clip.transform);
  });

  it('uses the inverse camera zoom when resizing the visible squircle frame', async () => {
    const clip = squircleWebcamClip({
      transform: { x: 0.1, y: 0.1, width: 0.25, height: 0.25 },
    });
    const mounted = mountComposable(clip);
    const target = document.createElement('div');
    Object.assign(target, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn().mockReturnValue(true),
      releasePointerCapture: vi.fn(),
    });
    const initialStyle = mounted.state.transformHandleStyle.value;
    const initialWidth = stylePixels(initialStyle, 'width');
    const initialHeight = stylePixels(initialStyle, 'height');

    mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'resize', 'bottom-right');
    mounted.state.moveTransformDrag(pointer(target, { clientX: 200, clientY: 200 }));
    mounted.state.endTransformDrag(pointer(target, { clientX: 200, clientY: 200 }));

    const resizedTransform = vi.mocked(mounted.options.onUpdateTransform).mock.calls.at(-1)?.[0];
    expect(resizedTransform).toBeDefined();
    mounted.selectedRef.value = { ...clip, transform: resizedTransform! };
    await nextTick();

    const resizedStyle = mounted.state.transformHandleStyle.value;
    expect(stylePixels(resizedStyle, 'width') - initialWidth).toBeCloseTo(100, 5);
    expect(stylePixels(resizedStyle, 'height') - initialHeight).toBeCloseTo(100, 5);
  });

  it.each([
    {
      edge: 'left',
      transform: { x: 0.1, y: 0.25, width: 0.45, height: 0.25 },
      resizePointer: { clientX: 260, clientY: 100 },
    },
    {
      edge: 'right',
      transform: { x: 0.1, y: 0.25, width: 0.45, height: 0.25 },
      resizePointer: { clientX: 260, clientY: 100 },
    },
    {
      edge: 'top',
      transform: { x: 0.25, y: 0.1, width: 0.25, height: 0.45 },
      resizePointer: { clientX: 100, clientY: 260 },
    },
    {
      edge: 'bottom',
      transform: { x: 0.25, y: 0.1, width: 0.25, height: 0.45 },
      resizePointer: { clientX: 100, clientY: 260 },
    },
  ] as const)(
    'reaches the $edge canvas edge after a squircle resize and a new move',
    async ({ edge, transform, resizePointer }) => {
      const clip = squircleWebcamClip({ transform });
      const mounted = mountComposable(clip);
      const target = document.createElement('div');
      Object.assign(target, {
        setPointerCapture: vi.fn(),
        hasPointerCapture: vi.fn().mockReturnValue(true),
        releasePointerCapture: vi.fn(),
      });

      mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'resize', 'bottom-right');
      mounted.state.moveTransformDrag(pointer(target, resizePointer));
      mounted.state.endTransformDrag(pointer(target, resizePointer));
      const resizedTransform = vi.mocked(mounted.options.onUpdateTransform).mock.calls.at(-1)?.[0];
      expect(resizedTransform).toBeDefined();
      mounted.selectedRef.value = { ...clip, transform: resizedTransform! };
      await nextTick();

      const beforeMove = mounted.state.transformHandleStyle.value;
      const left = stylePixels(beforeMove, 'left');
      const top = stylePixels(beforeMove, 'top');
      const width = stylePixels(beforeMove, 'width');
      const height = stylePixels(beforeMove, 'height');
      const deltaX = edge === 'left' ? -left : edge === 'right' ? 800 - (left + width) : 0;
      const deltaY = edge === 'top' ? -top : edge === 'bottom' ? 450 - (top + height) : 0;

      mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'move');
      mounted.state.moveTransformDrag(pointer(target, { clientX: 100 + deltaX, clientY: 100 + deltaY }));
      mounted.state.endTransformDrag(pointer(target, { clientX: 100 + deltaX, clientY: 100 + deltaY }));
      const movedTransform = vi.mocked(mounted.options.onUpdateTransform).mock.calls.at(-1)?.[0];
      expect(movedTransform).toBeDefined();
      mounted.selectedRef.value = { ...clip, transform: movedTransform! };
      await nextTick();

      const finalStyle = mounted.state.transformHandleStyle.value;
      const finalLeft = stylePixels(finalStyle, 'left');
      const finalTop = stylePixels(finalStyle, 'top');
      const finalWidth = stylePixels(finalStyle, 'width');
      const finalHeight = stylePixels(finalStyle, 'height');
      if (edge === 'left') expect(finalLeft).toBeCloseTo(0, 5);
      if (edge === 'right') expect(finalLeft + finalWidth).toBeCloseTo(800, 5);
      if (edge === 'top') expect(finalTop).toBeCloseTo(0, 5);
      if (edge === 'bottom') expect(finalTop + finalHeight).toBeCloseTo(450, 5);
    },
  );

  it('resizes wrapped captions with side handles and keeps the font size unchanged', () => {
    const clip = captionClip();
    clip.caption.style.customText =
      'A long annotation should wrap onto multiple lines while its font remains at the selected size.';
    const mounted = mountComposable(clip);
    const target = document.createElement('div');
    Object.assign(target, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn().mockReturnValue(true),
      releasePointerCapture: vi.fn(),
    });

    expect(mounted.state.transformResizeCorners.value).toEqual(['left', 'right']);
    mounted.state.beginTransformDrag(pointer(target, { clientX: 700 }), 'resize', 'right');
    const initial = mounted.state.transformDraft.value!;
    mounted.state.moveTransformDrag(pointer(target, { clientX: 350 }));
    const resized = mounted.state.transformDraft.value!;

    expect(resized.width).toBeLessThan(initial.width);
    expect(resized.height).toBeGreaterThan(initial.height);
    expect(clip.caption.style.fontSize).toBe(32);
    mounted.state.endTransformDrag(pointer(target, { clientX: 350 }));
    expect(mounted.options.onUpdateTransform).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: resized.width, height: resized.height }),
    );
  });

  it('keeps the existing aspect-ratio resize behavior when wrapping is disabled', () => {
    const clip = captionClip();
    clip.transform = { x: 0.2, y: 0.3, width: 0.5, height: 0.2 };
    clip.caption.style.wrap = false;
    const mounted = mountComposable(clip);
    const target = document.createElement('div');
    Object.assign(target, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn().mockReturnValue(true),
      releasePointerCapture: vi.fn(),
    });

    expect(mounted.state.transformResizeCorners.value).toBeUndefined();
    mounted.state.beginTransformDrag(pointer(target, { clientX: 100, clientY: 100 }), 'resize', 'bottom-right');
    mounted.state.moveTransformDrag(pointer(target, { clientX: 180, clientY: 180 }));
    expect(mounted.state.transformDraft.value).toMatchObject({ width: 0.6, height: 0.24 });
  });

  it('uses horizontal resize handles for canonical wrapped captions', () => {
    const mounted = mountComposable(captionClip());
    expect(mounted.state.transformResizeCorners.value).toEqual(['left', 'right']);
  });

  it('selects the topmost eligible visual or caption and leaves screen selection to the camera layer', () => {
    const foregroundImage = imageClip();
    foregroundImage.order = -1;
    const scene = composition();
    scene.clips = [screenClip(), foregroundImage];
    const mounted = mountComposable(foregroundImage, false, scene);
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 800 });
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 450 } as DOMRect);
    const event = pointer(canvas, { clientX: 300, clientY: 180 });
    expect(mounted.state.selectVisualAt(event, null)).toBe(false);
    expect(mounted.state.selectVisualAt(event, canvas)).toBe(true);
    expect(mounted.options.onSelectTransformClip).toHaveBeenCalledWith('image');

    mounted.selectedRef.value = screenClip();
    expect(mounted.state.selectVisualAt(pointer(canvas, { clientX: 750, clientY: 400 }), canvas)).toBe(false);
    expect(mounted.options.onSelectTransformClip).toHaveBeenCalledTimes(1);
    mounted.selectedRef.value = null;
    mounted.state.beginTransformDrag(pointer(canvas), 'move');
  });

  it('raycasts blur rectangles and rejects points outside a circular blur', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 800 });
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 450 } as DOMRect);

    const rectangleScene = composition();
    rectangleScene.clips = [screenClip(), blurClip({ order: -1 })];
    const mounted = mountComposable(null, false, rectangleScene);
    expect(mounted.state.selectVisualAt(pointer(canvas, { clientX: 200, clientY: 100 }), canvas)).toBe(true);
    expect(mounted.options.onSelectTransformClip).toHaveBeenCalledWith('blur');

    const circleScene = composition();
    circleScene.clips = [blurClip({ shape: 'circle' })];
    mounted.compositionRef.value = circleScene;
    vi.mocked(mounted.options.onSelectTransformClip).mockClear();
    expect(mounted.state.selectVisualAt(pointer(canvas, { clientX: 150, clientY: 70 }), canvas)).toBe(false);
    expect(mounted.state.selectVisualAt(pointer(canvas, { clientX: 250, clientY: 150 }), canvas)).toBe(true);
    expect(mounted.options.onSelectTransformClip).toHaveBeenCalledWith('blur');
  });

  it('raycasts only active visible layers at the current composition time', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 450 },
    });
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 450 } as DOMRect);
    const timedBlur = blurClip({ order: -1, timelineStartMs: 2_000 });
    const scene = composition();
    scene.clips = [screenClip(), timedBlur];
    const mounted = mountComposable(screenClip(), false, scene);
    const hit = pointer(canvas, { clientX: 200, clientY: 150 });

    expect(mounted.state.clipIdAt(hit, canvas)).toBeNull();
    mounted.currentTime.value = 2.5;
    expect(mounted.state.clipIdAt(hit, canvas)).toBe('blur');

    mounted.compositionRef.value = { ...scene, clips: [screenClip(), { ...timedBlur, order: 1 }] };
    expect(mounted.state.clipIdAt(hit, canvas)).toBeNull();
  });

  it('selects a foreground imported video before an overlapping background visual', () => {
    const importedVideo: VisualClip = {
      ...imageClip(),
      id: 'imported-video',
      kind: 'video',
      assetId: 'imported-video-asset',
      order: -2,
    };
    const backgroundImage: VisualClip = {
      ...imageClip(),
      id: 'background-image',
      order: -1,
    };
    const scene = composition();
    scene.clips = [screenClip(), importedVideo, backgroundImage];
    const mounted = mountComposable(null, false, scene);
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 800 });
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 450 } as DOMRect);

    expect(mounted.state.selectVisualAt(pointer(canvas, { clientX: 400, clientY: 225 }), canvas)).toBe(true);
    expect(mounted.options.onSelectTransformClip).toHaveBeenCalledWith('imported-video');
  });
});
