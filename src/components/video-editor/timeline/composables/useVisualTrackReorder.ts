import { ref, type ComputedRef, type Ref } from 'vue';
import { createAnimationFrameCoalescer } from './animation-frame-coalescer';
import type { TimelineTracksEmits, VisualTimelineTrack } from './timeline-tracks-types';

interface VisualTrackReorderOptions {
  baseVisualTracks: ComputedRef<VisualTimelineTrack[]>;
  visualOrderPreview: Ref<string[] | null>;
  emit: TimelineTracksEmits;
}

export function useVisualTrackReorder(options: VisualTrackReorderOptions) {
  const { baseVisualTracks, visualOrderPreview, emit } = options;
  const draggedTrackId = ref<string | null>(null);

  const beginReorder = (event: PointerEvent, trackId: string, representativeClipId: string) => {
    if (event.button !== 0 && event.button !== undefined) return;
    if (baseVisualTracks.value.find((track) => track.id === trackId)?.clips.some((clip) => clip.locked)) return;
    const startX = event.clientX ?? 0;
    const startY = event.clientY ?? 0;
    let isDragging = false;
    let lastSwapTime = 0;
    const initialOrder = baseVisualTracks.value.map((track) => track.id);
    const initialIndex = initialOrder.indexOf(trackId);
    if (initialIndex < 0) return;

    const applyMove = (next: PointerEvent) => {
      if (!isDragging) {
        const distance = Math.hypot((next.clientX ?? 0) - startX, (next.clientY ?? 0) - startY);
        if (distance < 4 && !Number.isNaN(distance)) return;
        isDragging = true;
        draggedTrackId.value = trackId;
        visualOrderPreview.value = [...initialOrder];
      }

      const row = document.elementFromPoint?.(next.clientX, next.clientY)?.closest<HTMLElement>('.visual-track');
      const targetId = row?.dataset.trackId;
      if (!targetId || targetId === trackId) return;
      const order = [...(visualOrderPreview.value ?? initialOrder)];
      const from = order.indexOf(trackId);
      const to = order.indexOf(targetId);
      if (from < 0 || to < 0 || from === to || Date.now() - lastSwapTime < 150) return;

      const crossed = new Set(order.slice(Math.min(from, to), Math.max(from, to) + 1));
      if (baseVisualTracks.value.some((track) => crossed.has(track.id) && track.clips.some((clip) => clip.locked)))
        return;

      const rect = row.getBoundingClientRect?.();
      if (rect && rect.height > 0) {
        const relativeY = (next.clientY - rect.top) / rect.height;
        if ((from < to && relativeY < 0.35) || (from > to && relativeY > 0.65)) return;
      }
      order.splice(from, 1);
      order.splice(to, 0, trackId);
      visualOrderPreview.value = order;
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
      const finalIndex = visualOrderPreview.value?.indexOf(trackId) ?? initialIndex;
      if (finalIndex !== initialIndex) emit('reorder:clip', { id: representativeClipId, targetIndex: finalIndex });
      requestAnimationFrame(() => {
        visualOrderPreview.value = null;
        draggedTrackId.value = null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
  };

  return { draggedTrackId, beginReorder };
}
