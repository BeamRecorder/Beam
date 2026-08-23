import { computed, getCurrentScope, onScopeDispose, ref } from 'vue';
import { ZOOM_DEPTH_SCALES } from '../../zoom/zoom-types';
import { createCompositionCameraEvaluator } from '../../zoom/composition-camera';
import { clampFocusToScale } from '../../zoom/zoom-playback';
import { createZoomMotionBlurSamplePlan, ZOOM_MOTION_BLUR_SHUTTER_MS } from '../../zoom/zoom-motion-blur';
import {
  compositeIsolatedMotionBlurSample,
  createMotionBlurSurface,
  resizeMotionBlurSurface,
  type MotionBlurSurface,
} from '../../zoom/zoom-motion-blur-compositor';
import { OUTPUT_PREVIEW_RADIUS, outputPreviewRect } from '../output-canvas';
import type { MediaFrame } from '~/media/shared';
import type { VisualClip } from '~/media/shared/composition-types';
import { drawDecoratedMedia } from '../../composition/appearance/render-decorated-media';
import { mapSourcePointToScreen, resolveScreenRenderGeometry } from '../../composition/camera-layout';
import { resolveCompositionSceneLayers, type CompositionSceneLayers } from '../../composition/scene-layers';
import type { RenderedVideoWindow, UseCameraZoomOptions, VideoWindowBounds } from './useCameraZoom.types';

export type { RenderedVideoWindow, UseCameraZoomOptions, VideoWindowBounds } from './useCameraZoom.types';

export function useCameraZoom(options: UseCameraZoomOptions) {
  let cameraEvaluator: ReturnType<typeof createCompositionCameraEvaluator> | null = null;
  let cameraEvaluatorInputs: readonly unknown[] | null = null;
  const videoWindowBounds = ref<VideoWindowBounds | null>(null);
  const screenHitBounds = ref<{ dx: number; dy: number; dw: number; dh: number } | null>(null);
  const overlayWindowBounds = ref<VideoWindowBounds | null>(null);
  const isMovingSelection = ref(false);
  const draftFocus = ref<{ cx: number; cy: number } | null>(null);
  let pendingFocusPoint: { x: number; y: number } | null = null;
  let zoomDragFrame: number | null = null;
  let zoomDragGeometry: {
    canvasLeft: number;
    canvasTop: number;
    scaleRatio: number;
    bounds: VideoWindowBounds;
  } | null = null;
  let motionBlurSurface: MotionBlurSurface | null = null;

  const screenClip = (): VisualClip | null =>
    resolveCompositionSceneLayers(options.composition(), options.currentTime() * 1_000).screen;

  const resetCamera = () => {
    cameraEvaluator = null;
    cameraEvaluatorInputs = null;
    options.onRenderOnce?.();
  };
  const resetCameraUnlessDragging = () => {
    if (!isMovingSelection.value) resetCamera();
  };

  const focusTargetStyle = computed(() => {
    const bounds = overlayWindowBounds.value;
    const selected = options.selectedZoom();
    if (!selected || selected.mode !== 'manual' || options.isPlaying() || !bounds) return { display: 'none' };
    const selectionScale = ZOOM_DEPTH_SCALES[selected.depth];
    const scale = bounds.scale || 1;
    const centerX = bounds.dx + bounds.dw / 2;
    const centerY = bounds.dy + bounds.dh / 2;
    const focusX = bounds.focusX ?? centerX;
    const focusY = bounds.focusY ?? centerY;
    const targetWidth = bounds.dw / selectionScale;
    const targetHeight = bounds.dh / selectionScale;
    const focus = clampFocusToScale(draftFocus.value ?? selected.focus, selectionScale);
    const { cx, cy } = focus;
    const left = bounds.dx + cx * bounds.dw - targetWidth / 2;
    const top = bounds.dy + cy * bounds.dh - targetHeight / 2;
    return {
      width: `${targetWidth * scale}px`,
      height: `${targetHeight * scale}px`,
      transform: `translate3d(${centerX + (left - focusX) * scale - bounds.dx}px, ${centerY + (top - focusY) * scale - bounds.dy}px, 0)`,
      willChange: isMovingSelection.value ? 'transform' : 'auto',
    };
  });

  const createZoomDragGeometry = () => {
    const canvas = options.canvasRef();
    const bounds = overlayWindowBounds.value;
    if (!canvas || !bounds) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      canvasLeft: rect.left,
      canvasTop: rect.top,
      scaleRatio: rect.width / (canvas.clientWidth || 1) || 1,
      bounds: { ...bounds },
    };
  };

  const focusAt = (point: { x: number; y: number }) => {
    const geometry = zoomDragGeometry;
    const selected = options.selectedZoom();
    if (!geometry || !selected || selected.mode !== 'manual') return null;
    const { bounds, scaleRatio } = geometry;
    const canvasX = (point.x - geometry.canvasLeft) / scaleRatio;
    const canvasY = (point.y - geometry.canvasTop) / scaleRatio;
    const scale = bounds.scale || 1;
    const centerX = bounds.dx + bounds.dw / 2;
    const centerY = bounds.dy + bounds.dh / 2;
    const focusX = bounds.focusX ?? centerX;
    const focusY = bounds.focusY ?? centerY;
    const unzoomedX = (canvasX - centerX) / scale + focusX;
    const unzoomedY = (canvasY - centerY) / scale + focusY;
    return clampFocusToScale(
      {
        cx: (unzoomedX - bounds.dx) / bounds.dw,
        cy: (unzoomedY - bounds.dy) / bounds.dh,
      },
      ZOOM_DEPTH_SCALES[selected.depth],
    );
  };

  const scheduleDraftFocus = (event: PointerEvent) => {
    pendingFocusPoint = { x: event.clientX, y: event.clientY };
    if (zoomDragFrame !== null) return;
    zoomDragFrame = requestAnimationFrame(() => {
      zoomDragFrame = null;
      if (!pendingFocusPoint) return;
      const focus = focusAt(pendingFocusPoint);
      pendingFocusPoint = null;
      if (focus) draftFocus.value = focus;
    });
  };

  const beginSelectionMove = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const selectedZoom = options.selectedZoom();
    const isManualZoom = selectedZoom?.mode === 'manual';
    if (isManualZoom) {
      zoomDragGeometry = createZoomDragGeometry();
      if (!zoomDragGeometry) return;
      isMovingSelection.value = true;
      const target = (event.currentTarget as HTMLElement) ?? options.canvasRef();
      if (target?.setPointerCapture) target.setPointerCapture(event.pointerId);
      scheduleDraftFocus(event);
      return;
    }

    if (options.selectVisualAt(event)) return;
    const canvas = options.canvasRef();
    const bounds = screenHitBounds.value ?? videoWindowBounds.value;
    if (canvas && bounds) {
      const rect = canvas.getBoundingClientRect();
      const scaleRatio = rect.width / (canvas.clientWidth || 1);
      const x = (event.clientX - rect.left) / (scaleRatio || 1);
      const y = (event.clientY - rect.top) / (scaleRatio || 1);
      if (x >= bounds.dx && x <= bounds.dx + bounds.dw && y >= bounds.dy && y <= bounds.dy + bounds.dh) {
        const screen = screenClip();
        if (screen) options.onSelectScreenClip(screen.id);
        return;
      }
    }
    options.onSelectCanvas();
    if (options.selectedTransformClipExists()) options.onDeselectTransformClip();
    if (selectedZoom) options.onDeselectZoom();
  };
  const moveSelection = (event: PointerEvent) => {
    if (isMovingSelection.value) scheduleDraftFocus(event);
  };
  const endSelectionMove = (event: PointerEvent) => {
    if (isMovingSelection.value) {
      if (zoomDragFrame !== null) cancelAnimationFrame(zoomDragFrame);
      zoomDragFrame = null;
      pendingFocusPoint = null;
      const selected = options.selectedZoom();
      const focus = focusAt({ x: event.clientX, y: event.clientY });
      isMovingSelection.value = false;
      draftFocus.value = null;
      zoomDragGeometry = null;
      if (selected?.mode === 'manual' && focus) options.onUpdateZoom({ ...selected, focus });
      const target = (event.currentTarget as HTMLElement) ?? options.canvasRef();
      if (target?.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
    }
  };

  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (zoomDragFrame !== null) cancelAnimationFrame(zoomDragFrame);
    });
  }

  const drawVideoWindow = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    frame: MediaFrame | null,
    resolvedLayers?: CompositionSceneLayers,
  ): RenderedVideoWindow | null => {
    const output = options.outputCanvas();
    const preview = outputPreviewRect(width, height, output);
    const sceneLayers =
      resolvedLayers ?? resolveCompositionSceneLayers(options.composition(), options.currentTime() * 1_000);
    const screen = sceneLayers.screen;
    const hasCameraVisual = sceneLayers.cameraVisuals.length > 0;
    if (!hasCameraVisual) {
      videoWindowBounds.value = null;
      screenHitBounds.value = null;
      overlayWindowBounds.value = null;
      return null;
    }
    const asset = screen ? options.composition().assets.find((entry) => entry.id === screen.assetId) : null;
    const videoWidth = screen ? (frame?.width ?? asset?.width ?? 0) : output.width;
    const videoHeight = screen ? (frame?.height ?? asset?.height ?? 0) : output.height;
    if (screen && (videoWidth <= 0 || videoHeight <= 0)) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(preview.x, preview.y, preview.width, preview.height, OUTPUT_PREVIEW_RADIUS);
      ctx.clip();
      ctx.fillStyle = 'rgba(15,23,42,.85)';
      ctx.fillRect(preview.x, preview.y, preview.width, preview.height);
      ctx.fillStyle = '#fff';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(options.videoError() || 'Loading media metadata…', width / 2, height / 2);
      ctx.restore();
      videoWindowBounds.value = null;
      screenHitBounds.value = null;
      overlayWindowBounds.value = null;
      return null;
    }
    const { x: dx, y: dy, width: dw, height: dh } = preview;
    const screenTransform = options.screenTransformDraft?.() ??
      screen?.transform ?? { x: 0, y: 0, width: 1, height: 1 };
    const screenGeometry = screen
      ? resolveScreenRenderGeometry(
          screen,
          videoWidth,
          videoHeight,
          dw,
          dh,
          output.showBackground,
          screenTransform,
          options.isCropping?.() ? undefined : screen.crop,
          options.isCropping?.() ? 'custom' : (screen.cameraFramingPreset ?? 'custom'),
        )
      : null;
    const source = screenGeometry?.source ?? { x: 0, y: 0, width: videoWidth, height: videoHeight };
    const media = screenGeometry?.media ?? { x: 0, y: 0, width: dw, height: dh };
    const positioned = screenGeometry?.positioned ?? media;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(dx, dy, dw, dh, OUTPUT_PREVIEW_RADIUS);
    ctx.clip();
    const currentTime = options.currentTime();
    const telemetry = options.editorData()?.cursor.telemetry ?? [];
    const selectedZoom = options.selectedZoom();
    const zooms = options.zoomElements();
    const evaluatorInputs = [
      zooms,
      telemetry,
      output,
      screen,
      selectedZoom?.id,
      selectedZoom?.mode,
      options.isPlaying(),
      videoWidth,
      videoHeight,
      dw,
      dh,
    ] as const;
    const inputsChanged = evaluatorInputs.some((value, index) => value !== cameraEvaluatorInputs?.[index]);
    if (!cameraEvaluator || !cameraEvaluatorInputs || inputsChanged) {
      cameraEvaluatorInputs = evaluatorInputs;
      const previewZooms =
        !options.isPlaying() && selectedZoom?.mode === 'manual'
          ? zooms.filter((zoom) => zoom.id !== selectedZoom.id)
          : zooms;
      cameraEvaluator = createCompositionCameraEvaluator({
        zooms: previewZooms,
        telemetry,
        mapFocus: (focus, zoom, timeMs) => {
          const activeScreen = resolveCompositionSceneLayers(options.composition(), timeMs).screen;
          if (!activeScreen || zoom.mode !== 'auto') return focus;
          const activeGeometry = resolveScreenRenderGeometry(
            activeScreen,
            videoWidth,
            videoHeight,
            dw,
            dh,
            output.showBackground,
          );
          return mapSourcePointToScreen(focus, videoWidth, videoHeight, dw, dh, activeGeometry);
        },
      });
    }
    const sample = cameraEvaluator.sample(currentTime * 1_000);
    const camera = { focusX: dx + sample.focus.cx * dw, focusY: dy + sample.focus.cy * dh, scale: sample.scale };
    const renderedWindow: RenderedVideoWindow = {
      dx,
      dy,
      dw,
      dh,
      scale: camera.scale,
      focusX: camera.focusX,
      focusY: camera.focusY,
    };
    const drawScreen = (target = ctx) => {
      if (!screen) return;
      if (frame) {
        drawDecoratedMedia(target, {
          source: frame.bitmap,
          sourceRect: source,
          rect: { x: dx + positioned.x, y: dy + positioned.y, width: positioned.width, height: positioned.height },
          appearance: screen.appearance ?? {
            cornerRadius: output.showBackground ? 'md' : 'none',
            shadowSize: 'md',
            shadowColor: '#000000',
            shadowDirection: 'bottom',
            borderEnabled: false,
            borderColor: '#000000',
            borderWidth: 1,
            frame: 'none',
            frameTitle: '',
            frameColor: '#c0c0c0',
            frameShowMenu: true,
            frameShowScrollbars: true,
            frameChromeScale: 1,
          },
          shadowScale: Math.min(dw / Math.max(1, output.width), dh / Math.max(1, output.height)),
          title: screen.name,
          mirrored: screen.isMirrored,
          mirroredY: screen.isMirroredY,
          mask: screenGeometry?.mask,
        });
      } else if (options.videoError()) {
        target.fillStyle = '#334155';
        target.fillRect(dx, dy, dw, dh);
        target.fillStyle = '#fff';
        target.font = '14px sans-serif';
        target.textAlign = 'center';
        target.fillText(options.videoError()!, width / 2, height / 2);
      }
    };
    const centerCamera = { focusX: sample.focus.cx, focusY: sample.focus.cy, scale: sample.scale };
    const blurSettings = options.zoomMotionBlur?.();
    const blurIntensity = blurSettings?.enabled ? blurSettings.intensity : 0;
    const blurPlan = (() => {
      if (!(blurIntensity > 0)) return [{ camera: centerCamera, weight: 1 }];
      const halfShutterMs = ZOOM_MOTION_BLUR_SHUTTER_MS / 2;
      const cameraAt = (timeMs: number) => {
        const value = cameraEvaluator!.sample(Math.max(0, timeMs));
        return { focusX: value.focus.cx, focusY: value.focus.cy, scale: value.scale };
      };
      return createZoomMotionBlurSamplePlan({
        previous: cameraAt(currentTime * 1_000 - halfShutterMs),
        center: centerCamera,
        current: cameraAt(currentTime * 1_000 + halfShutterMs),
        intensity: blurIntensity,
        deltaMs: halfShutterMs * 2,
        sampleCount: options.isPlaying() ? 3 : undefined,
        viewportWidth: dw,
        viewportHeight: dh,
      });
    })();
    const drawSample = (target: CanvasRenderingContext2D, blurSample: (typeof blurPlan)[number]) => {
      const projectedCamera = {
        focusX: dx + blurSample.camera.focusX * dw,
        focusY: dy + blurSample.camera.focusY * dh,
        scale: blurSample.camera.scale,
      };
      const sampleWindow = { ...renderedWindow, ...projectedCamera };
      target.save();
      target.beginPath();
      target.roundRect(dx, dy, dw, dh, OUTPUT_PREVIEW_RADIUS);
      target.clip();
      target.translate(dx + dw / 2, dy + dh / 2);
      target.scale(projectedCamera.scale, projectedCamera.scale);
      target.translate(-projectedCamera.focusX, -projectedCamera.focusY);
      options.drawBackground(target, { x: dx, y: dy, width: dw, height: dh });
      if (options.renderVisualStack)
        options.renderVisualStack(target, sampleWindow, () => drawScreen(target), sceneLayers);
      else drawScreen(target);
      target.restore();
    };
    if (blurPlan.length === 1) {
      drawSample(ctx, blurPlan[0]!);
    } else {
      const canvasPixelScale = Math.max(1, options.canvasRef()?.width ?? width) / Math.max(1, width);
      const pixelScale = Math.min(1.25, canvasPixelScale);
      motionBlurSurface ??= createMotionBlurSurface(
        Math.max(1, Math.round(width * pixelScale)),
        Math.max(1, Math.round(height * pixelScale)),
      );
      if (!motionBlurSurface) {
        drawSample(ctx, blurPlan[Math.floor(blurPlan.length / 2)]!);
      } else {
        resizeMotionBlurSurface(
          motionBlurSurface,
          Math.max(1, Math.round(width * pixelScale)),
          Math.max(1, Math.round(height * pixelScale)),
        );
        let accumulatedWeight = 0;
        let composited = false;
        for (const blurSample of blurPlan) {
          const rendered = compositeIsolatedMotionBlurSample({
            target: ctx,
            surface: motionBlurSurface,
            logicalWidth: width,
            logicalHeight: height,
            pixelScale,
            sample: blurSample,
            accumulatedWeight,
            draw: (target, sampleToDraw) => drawSample(target as CanvasRenderingContext2D, sampleToDraw),
          });
          if (rendered) {
            composited = true;
            accumulatedWeight += blurSample.weight;
          }
        }
        if (!composited) drawSample(ctx, blurPlan[Math.floor(blurPlan.length / 2)]!);
      }
    }
    ctx.restore();

    videoWindowBounds.value = {
      dx: dx + media.x,
      dy: dy + media.y,
      dw: media.width,
      dh: media.height,
      scale: camera.scale,
      focusX: camera.focusX,
      focusY: camera.focusY,
    };
    screenHitBounds.value = screen
      ? {
          dx: dx + positioned.x,
          dy: dy + positioned.y,
          dw: positioned.width,
          dh: positioned.height,
        }
      : null;
    overlayWindowBounds.value = { dx, dy, dw, dh, scale: camera.scale, focusX: camera.focusX, focusY: camera.focusY };
    return renderedWindow;
  };

  const drawInCameraSpace = (ctx: CanvasRenderingContext2D, window: RenderedVideoWindow, draw: () => void) => {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(window.dx, window.dy, window.dw, window.dh, 0);
    ctx.clip();
    ctx.translate(window.dx + window.dw / 2, window.dy + window.dh / 2);
    ctx.scale(window.scale, window.scale);
    ctx.translate(-window.focusX, -window.focusY);
    draw();
    ctx.restore();
  };

  return {
    videoWindowBounds,
    overlayWindowBounds,
    focusTargetStyle,
    resetCamera,
    resetCameraUnlessDragging,
    beginSelectionMove,
    moveSelection,
    endSelectionMove,
    drawVideoWindow,
    drawInCameraSpace,
  };
}
