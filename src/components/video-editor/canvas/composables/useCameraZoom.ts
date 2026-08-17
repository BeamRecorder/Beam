import { computed, ref } from 'vue';
import type { ZoomElement } from '../../zoom/zoom-types';
import { createCompositionCameraEvaluator } from '../../zoom/composition-camera';
import { OUTPUT_PREVIEW_RADIUS, outputPreviewRect, type OutputCanvasSettings } from '../output-canvas';
import type { ProjectEditorData } from '~/api/types/capture-api';
import { activeClipsAt } from '~/media/shared';
import type { MediaFrame } from '~/media/shared';
import type { ClipComposition, NormalizedTransform, VisualClip } from '~/media/shared/composition-types';
import { drawDecoratedMedia } from '../../composition/appearance/render-decorated-media';
import { mapSourcePointToScreen, resolveScreenRenderGeometry } from '../../composition/camera-layout';

export interface VideoWindowBounds {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  scale: number;
  focusX?: number;
  focusY?: number;
}
export interface RenderedVideoWindow extends VideoWindowBounds {
  focusX: number;
  focusY: number;
}

export interface UseCameraZoomOptions {
  canvasRef: () => HTMLCanvasElement | null;
  outputCanvas: () => OutputCanvasSettings;
  zoomElements: () => ZoomElement[];
  selectedZoom: () => ZoomElement | null;
  currentTime: () => number;
  isPlaying: () => boolean;
  editorData: () => ProjectEditorData | null | undefined;
  activeTab: () => string;
  composition: () => ClipComposition;
  screenTransformDraft?: () => NormalizedTransform | null;
  isCropping?: () => boolean | undefined;
  drawBackground: (
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
  ) => void;
  videoError: () => string | null;
  renderVisualStack?: (ctx: CanvasRenderingContext2D, videoWindow: RenderedVideoWindow, drawScreen: () => void) => void;
  onUpdateZoom: (zoom: ZoomElement) => void;
  onPreviewZoom?: (zoom: ZoomElement) => void;
  onSelectScreenClip: (clipId: string) => void;
  onSelectCanvas: () => void;
  onDeselectTransformClip: () => void;
  onDeselectZoom: () => void;
  selectVisualAt: (event: PointerEvent) => boolean;
  selectedTransformClipExists: () => boolean;
}

export function useCameraZoom(options: UseCameraZoomOptions) {
  let cameraEvaluator: ReturnType<typeof createCompositionCameraEvaluator> | null = null;
  let cameraEvaluatorKey = '';
  const videoWindowBounds = ref<VideoWindowBounds | null>(null);
  const screenHitBounds = ref<{ dx: number; dy: number; dw: number; dh: number } | null>(null);
  const overlayWindowBounds = ref<VideoWindowBounds | null>(null);
  const isMovingSelection = ref(false);
  const draftFocus = ref<{ cx: number; cy: number } | null>(null);
  let pendingZoomPreview: ZoomElement | null = null;
  let zoomPreviewFrame: number | null = null;

  const screenClip = (): VisualClip | null =>
    activeClipsAt(options.composition(), options.currentTime() * 1_000).find(
      (clip): clip is VisualClip => clip.kind === 'screen',
    ) ?? null;

  const resetCamera = () => {
    cameraEvaluator?.invalidate();
  };

  const focusTargetStyle = computed(() => {
    const bounds = videoWindowBounds.value;
    const selected = options.selectedZoom();
    if (!selected || selected.mode !== 'manual' || options.isPlaying() || !bounds) return { display: 'none' };
    const selectionScale = [1.25, 1.5, 1.8, 2.2, 3.5, 5][selected.depth - 1];
    const scale = bounds.scale || 1;
    const centerX = bounds.dx + bounds.dw / 2;
    const centerY = bounds.dy + bounds.dh / 2;
    const focusX = bounds.focusX ?? centerX;
    const focusY = bounds.focusY ?? centerY;
    const targetWidth = bounds.dw / selectionScale;
    const targetHeight = bounds.dh / selectionScale;
    const cx = draftFocus.value?.cx ?? selected.focus.cx;
    const cy = draftFocus.value?.cy ?? selected.focus.cy;
    const left = bounds.dx + cx * bounds.dw - targetWidth / 2;
    const top = bounds.dy + cy * bounds.dh - targetHeight / 2;
    return {
      width: `${targetWidth * scale}px`,
      height: `${targetHeight * scale}px`,
      transform: `translate3d(${centerX + (left - focusX) * scale}px, ${centerY + (top - focusY) * scale}px, 0)`,
      willChange: isMovingSelection.value ? 'transform' : 'auto',
    };
  });

  const scheduleZoomPreview = (updated: ZoomElement) => {
    pendingZoomPreview = updated;
    if (zoomPreviewFrame !== null) return;
    zoomPreviewFrame = requestAnimationFrame(() => {
      zoomPreviewFrame = null;
      if (pendingZoomPreview) {
        (options.onPreviewZoom ?? options.onUpdateZoom)(pendingZoomPreview);
        pendingZoomPreview = null;
      }
    });
  };

  const updateFocus = (event: PointerEvent, final: boolean) => {
    const canvas = options.canvasRef();
    const bounds = videoWindowBounds.value;
    const selected = options.selectedZoom();
    if (!canvas || !bounds || !selected || selected.mode !== 'manual') return;
    const rect = canvas.getBoundingClientRect();
    const scaleRatio = rect.width / (canvas.clientWidth || 1);
    const canvasX = (event.clientX - rect.left) / (scaleRatio || 1);
    const canvasY = (event.clientY - rect.top) / (scaleRatio || 1);
    const scale = bounds.scale || 1;
    const centerX = bounds.dx + bounds.dw / 2;
    const centerY = bounds.dy + bounds.dh / 2;
    const focusX = bounds.focusX ?? centerX;
    const focusY = bounds.focusY ?? centerY;
    const unzoomedX = (canvasX - centerX) / scale + focusX;
    const unzoomedY = (canvasY - centerY) / scale + focusY;
    const cx = Math.min(1, Math.max(0, (unzoomedX - bounds.dx) / bounds.dw));
    const cy = Math.min(1, Math.max(0, (unzoomedY - bounds.dy) / bounds.dh));

    draftFocus.value = { cx, cy };
    const updated: ZoomElement = {
      ...selected,
      focus: { cx, cy },
    };

    if (final) {
      if (zoomPreviewFrame !== null) {
        cancelAnimationFrame(zoomPreviewFrame);
        zoomPreviewFrame = null;
      }
      pendingZoomPreview = null;
      options.onUpdateZoom(updated);
    } else {
      scheduleZoomPreview(updated);
    }
  };

  const beginSelectionMove = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const selectedZoom = options.selectedZoom();
    const isManualZoom = selectedZoom?.mode === 'manual';
    if (isManualZoom) {
      isMovingSelection.value = true;
      const target = (event.currentTarget as HTMLElement) ?? options.canvasRef();
      if (target?.setPointerCapture) target.setPointerCapture(event.pointerId);
      updateFocus(event, false);
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
    if (isMovingSelection.value) updateFocus(event, false);
  };
  const endSelectionMove = (event: PointerEvent) => {
    if (isMovingSelection.value) {
      updateFocus(event, true);
      isMovingSelection.value = false;
      draftFocus.value = null;
      const target = (event.currentTarget as HTMLElement) ?? options.canvasRef();
      if (target?.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
    }
  };

  const drawVideoWindow = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    frame: MediaFrame | null,
  ): RenderedVideoWindow | null => {
    const output = options.outputCanvas();
    const preview = outputPreviewRect(width, height, output);
    const screen = screenClip();
    const hasCameraVisual = activeClipsAt(options.composition(), options.currentTime() * 1_000).some(
      (clip) => clip.kind === 'screen' || clip.kind === 'video' || clip.kind === 'image',
    );
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
    const key = JSON.stringify({
      zooms: options.zoomElements(),
      telemetry,
      canvas: output,
      source: screen ? [videoWidth, videoHeight] : null,
      screen: screen ? [screen.transform, screen.crop] : null,
    });
    if (!cameraEvaluator || key !== cameraEvaluatorKey) {
      cameraEvaluatorKey = key;
      cameraEvaluator = createCompositionCameraEvaluator({
        zooms: options.zoomElements(),
        telemetry,
        mapFocus: (focus, zoom, timeMs) => {
          const activeScreen = activeClipsAt(options.composition(), timeMs).find(
            (clip): clip is VisualClip => clip.kind === 'screen',
          );
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
    const drawScreen = () => {
      if (!screen) return;
      if (frame) {
        drawDecoratedMedia(ctx, {
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
        ctx.fillStyle = '#334155';
        ctx.fillRect(dx, dy, dw, dh);
        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(options.videoError()!, width / 2, height / 2);
      }
    };
    ctx.save();
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.focusX, -camera.focusY);
    options.drawBackground(ctx, { x: dx, y: dy, width: dw, height: dh });
    if (options.renderVisualStack) options.renderVisualStack(ctx, renderedWindow, drawScreen);
    else drawScreen();
    ctx.restore();
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
    beginSelectionMove,
    moveSelection,
    endSelectionMove,
    drawVideoWindow,
    drawInCameraSpace,
  };
}
