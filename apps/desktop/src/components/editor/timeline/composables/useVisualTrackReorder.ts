import { ref, type ComputedRef, type Ref } from 'vue';
import { createAnimationFrameCoalescer } from './animation-frame-coalescer';
import { createTimelineRowReorder } from './timeline-row-reorder';
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
    const reorder = createTimelineRowReorder(baseVisualTracks.value);
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
      const rect = row.getBoundingClientRect();
      const relativeY = rect.height > 0 ? (next.clientY - rect.top) / rect.height : undefined;
      const order = reorder(visualOrderPreview.value ?? initialOrder, trackId, targetId, relativeY);
      if (order) visualOrderPreview.value = order;
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
      if (finalIndex !== initialIndex)
        emit('reorder:clip', {
          id: representativeClipId,
          targetIndex: finalIndex,
        });
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
