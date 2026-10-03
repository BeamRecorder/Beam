import { inject, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { beginPropertyInteraction, endPropertyInteraction } from '~/composables/property-interaction';
import { holdPopoverInteractionKey } from '~/ui/popover/popover-interaction-types';
import { clampGradientPosition } from '../gradient-stops';
import type { GradientDrag, GradientStop } from '../gradient-types';

export function useGradientDrag(
  props: { stops: GradientStop[]; disabled?: boolean },
  track: Ref<HTMLElement | null>,
  select: (id: string) => void,
  move: (id: string, position: number) => void,
) {
  const draggingId = ref<string | null>(null);
  const holdPopover = inject(holdPopoverInteractionKey, null);
  let releasePopover: (() => void) | undefined;
  let drag: GradientDrag | null = null;
  let frame: number | null = null;

  function flush(): void {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    if (drag) move(drag.id, drag.position);
  }

  function dispose(): void {
    if (!drag) return;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    drag = null;
    draggingId.value = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('blur', cancel);
    window.removeEventListener('keydown', onKeyDown);
    endPropertyInteraction();
    releasePopover?.();
    releasePopover = undefined;
  }

  function cancel(): void {
    if (drag) move(drag.id, drag.originalPosition);
    dispose();
  }

  function onMove(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const bounds = track.value?.getBoundingClientRect();
    if (!bounds?.width || !Number.isFinite(event.clientX)) return;
    drag.position = clampGradientPosition((event.clientX - bounds.left - drag.pointerOffset) / bounds.width);
    if (frame === null) frame = requestAnimationFrame(flush);
  }

  function onEnd(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    // Include the release point even when no final pointermove was delivered.
    onMove(event);
    flush();
    dispose();
  }

  function onCancel(event: PointerEvent): void {
    if (drag && event.pointerId === drag.pointerId) cancel();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  }

  function start(event: PointerEvent, stop: GradientStop): void {
    if (props.disabled || event.button !== 0 || !event.isPrimary || drag || !track.value) return;
    const bounds = track.value.getBoundingClientRect();
    if (!bounds.width || !Number.isFinite(event.clientX)) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).focus();
    select(stop.id);
    drag = {
      id: stop.id,
      pointerId: event.pointerId,
      originalPosition: stop.position,
      position: stop.position,
      pointerOffset: event.clientX - bounds.left - stop.position * bounds.width,
    };
    draggingId.value = stop.id;
    beginPropertyInteraction();
    releasePopover = holdPopover?.();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', onKeyDown);
  }

  watch(
    () => props.disabled || (draggingId.value !== null && !props.stops.some((stop) => stop.id === draggingId.value)),
    (invalid) => {
      if (invalid) dispose();
    },
  );
  onBeforeUnmount(dispose);
  return { draggingId, start };
}
