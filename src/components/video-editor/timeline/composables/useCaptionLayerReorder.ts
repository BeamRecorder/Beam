import { ref, type ComputedRef, type Ref } from 'vue';
import type { TextCaptionLayer } from '../../composition/engine/caption-layer-layout';
import { createAnimationFrameCoalescer } from './animation-frame-coalescer';
import type { TimelineTracksEmits } from './timeline-tracks-types';

interface CaptionLayerReorderOptions {
  layers: ComputedRef<TextCaptionLayer[]>;
  orderPreview: Ref<string[] | null>;
  emit: TimelineTracksEmits;
}

export function useCaptionLayerReorder(options: CaptionLayerReorderOptions) {
  const draggedCaptionId = ref<string | null>(null);

  const beginCaptionReorder = (event: PointerEvent, layerId: string, representativeClipId: string) => {
    if (event.button !== 0 && event.button !== undefined) return;
    const startX = event.clientX ?? 0;
    const startY = event.clientY ?? 0;
    const initialOrder = options.layers.value.map((layer) => layer.id);
    const initialIndex = initialOrder.indexOf(layerId);
    if (initialIndex < 0) return;
    let isDragging = false;
    let lastSwapTime = 0;

    const applyMove = (next: PointerEvent) => {
      if (!isDragging) {
        const distance = Math.hypot((next.clientX ?? 0) - startX, (next.clientY ?? 0) - startY);
        if (distance < 4 && !Number.isNaN(distance)) return;
        isDragging = true;
        draggedCaptionId.value = layerId;
        options.orderPreview.value = [...initialOrder];
      }

      const row = document.elementFromPoint?.(next.clientX, next.clientY)?.closest<HTMLElement>('.text-caption-layer');
      const targetId = row?.dataset.captionId;
      if (!targetId || targetId === layerId) return;
      const order = [...(options.orderPreview.value ?? initialOrder)];
      const from = order.indexOf(layerId);
      const to = order.indexOf(targetId);
      if (from < 0 || to < 0 || from === to || Date.now() - lastSwapTime < 150) return;

      const rect = row.getBoundingClientRect?.();
      if (rect && rect.height > 0) {
        const relativeY = (next.clientY - rect.top) / rect.height;
        if ((from < to && relativeY < 0.35) || (from > to && relativeY > 0.65)) return;
      }
      order.splice(from, 1);
      order.splice(to, 0, layerId);
      options.orderPreview.value = order;
      lastSwapTime = Date.now();
    };
    const moveUpdates = createAnimationFrameCoalescer(applyMove);
    const move = moveUpdates.schedule;
    const end = () => {
      moveUpdates.flush();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (!isDragging) return;
      const finalIndex = options.orderPreview.value?.indexOf(layerId) ?? initialIndex;
      if (finalIndex !== initialIndex) {
        options.emit('reorder:caption', { id: representativeClipId, targetIndex: finalIndex });
      }
      requestAnimationFrame(() => {
        options.orderPreview.value = null;
        draggedCaptionId.value = null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
  };

  return { draggedCaptionId, beginCaptionReorder };
}
