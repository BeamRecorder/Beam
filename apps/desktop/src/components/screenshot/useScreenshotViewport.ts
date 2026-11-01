import { computed, nextTick, onMounted, ref, watch, type Ref } from 'vue';
import { useElementSize } from '@vueuse/core';
import { useViewportZoom } from '../editor/canvas/composables/useViewportZoom';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';
import type { ScreenshotViewAction, ScreenshotViewMode } from './screenshot-view-types';

export function useScreenshotViewport(
  stage: Ref<HTMLElement | null>,
  canvasSize: () => Pick<OutputCanvasSettings, 'width' | 'height'>,
  disabled: () => boolean,
) {
  const available = useElementSize(stage);
  const viewMode = ref<ScreenshotViewMode>('fit');
  const fittedScale = computed(() => {
    const canvas = canvasSize();
    if (!available.width.value || !available.height.value) return 1;
    return Math.min(1, available.width.value / canvas.width, available.height.value / canvas.height);
  });
  const viewport = useViewportZoom({
    defaultScale: () => fittedScale.value,
    minScale: () => Math.min(0.01, fittedScale.value),
  });
  watch(
    [fittedScale, viewMode],
    () => {
      if (viewMode.value === 'fit') viewport.resetZoom();
      else if (viewMode.value === 'actual') viewport.setZoomScale(1);
    },
    { flush: 'sync' },
  );
  const resetView = () => {
    if (disabled()) return;
    viewMode.value = 'fit';
    viewport.resetZoom();
  };
  const setView = (action: ScreenshotViewAction) => {
    if (disabled()) return;
    if (action === 'fit') return resetView();
    if (action === 'actual') {
      viewMode.value = 'actual';
      viewport.setZoomScale(1);
      viewport.panX.value = viewport.panY.value = 0;
    } else {
      viewMode.value = 'manual';
      if (action === 'zoom-in') viewport.zoomIn();
      else viewport.zoomOut();
    }
  };
  onMounted(async () => {
    await nextTick();
    const rect = stage.value?.getBoundingClientRect();
    if (rect?.width && rect.height) {
      available.width.value = rect.width;
      available.height.value = rect.height;
    }
  });
  const stageSize = computed(() => {
    const canvas = canvasSize();
    // One output pixel per CSS pixel at 100%; the backing raster handles display density separately.
    return {
      width: Math.max(0, canvas.width * viewport.zoomScale.value),
      height: Math.max(0, canvas.height * viewport.zoomScale.value),
    };
  });
  const stageStyle = computed(() => ({
    width: `${stageSize.value.width}px`,
    height: `${stageSize.value.height}px`,
    transform: `translate(-50%, -50%) translate3d(${viewport.panX.value}px, ${viewport.panY.value}px, 0)`,
  }));
  const wheel = (event: WheelEvent) => {
    if (disabled() || viewport.isPanning.value || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    const rect = stage.value?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    viewMode.value = 'manual';
    viewport.handleWheel(
      event,
      new DOMRect(rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width, rect.height),
    );
  };
  const beginPan = (event: PointerEvent) => {
    if (!disabled() && viewport.beginPan(event, stage.value)) viewMode.value = 'manual';
  };
  const movePan = (event: PointerEvent) => {
    if (viewport.isPanning.value) {
      event.stopPropagation();
      viewport.movePan(event);
    }
  };
  const endPan = (event: PointerEvent) => viewport.endPan(event, stage.value);
  const zoomPercent = computed(() => {
    const percent = viewport.zoomScale.value * 100;
    return percent < 1 ? Math.round(percent * 100) / 100 : Math.round(percent);
  });
  return {
    available,
    stageSize,
    stageStyle,
    viewport,
    wheel,
    beginPan,
    movePan,
    endPan,
    resetView,
    controls: { resetView, setView, zoomPercent, viewMode },
  };
}
