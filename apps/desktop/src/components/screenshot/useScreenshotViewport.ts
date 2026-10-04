import { computed, nextTick, onMounted, type Ref } from 'vue';
import { useElementSize } from '@vueuse/core';
import { useViewportZoom } from '../editor/canvas/composables/useViewportZoom';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';

export function useScreenshotViewport(
  stage: Ref<HTMLElement | null>,
  canvasSize: () => Pick<OutputCanvasSettings, 'width' | 'height'>,
  disabled: () => boolean,
) {
  const available = useElementSize(stage);
  const viewport = useViewportZoom();
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
    const scale = Math.min(available.width.value / canvas.width, available.height.value / canvas.height);
    return {
      width: Math.max(0, canvas.width * scale * viewport.zoomScale.value),
      height: Math.max(0, canvas.height * scale * viewport.zoomScale.value),
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
    viewport.handleWheel(
      event,
      new DOMRect(rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width, rect.height),
    );
  };
  const beginPan = (event: PointerEvent) => {
    if (!disabled()) viewport.beginPan(event, stage.value);
  };
  const movePan = (event: PointerEvent) => {
    if (viewport.isPanning.value) {
      event.stopPropagation();
      viewport.movePan(event);
    }
  };
  const endPan = (event: PointerEvent) => viewport.endPan(event, stage.value);
  return { available, stageSize, stageStyle, viewport, wheel, beginPan, movePan, endPan };
}
