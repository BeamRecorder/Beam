import { onScopeDispose, ref, type Ref } from 'vue';
import { reorderLayer } from '~/media/shared/layer-compositing';

export function useScreenshotLayerReorder(
  list: Ref<HTMLElement | null>,
  ids: () => string[],
  commit: (id: string, index: number) => void,
) {
  const preview = ref<string[] | null>(null);
  const dragging = ref<string | null>(null);
  let disposeGesture: (() => void) | null = null;
  const begin = (event: PointerEvent, id: string) => {
    if (event.button !== 0 || disposeGesture || !list.value || !ids().includes(id)) return;
    event.preventDefault();
    const initial = ids();
    const pointerId = event.pointerId;
    const startY = event.clientY;
    let y = startY,
      frame = 0,
      active = false;
    // Capture on the stable list, not a row that Vue moves during its FLIP transition.
    const target = list.value;
    target.setPointerCapture(pointerId);
    const apply = () => {
      const node = list.value;
      if (!node || !active) return;
      const bounds = node.getBoundingClientRect();
      const edge = 28;
      if (y < bounds.top + edge) node.scrollTop -= Math.min(10, (bounds.top + edge - y) / 3);
      else if (y > bounds.bottom - edge) node.scrollTop += Math.min(10, (y - bounds.bottom + edge) / 3);
      const row = node.querySelector<HTMLElement>('[data-layer-id]');
      if (!row) return;
      const height = row.offsetHeight + 4;
      const to = Math.max(0, Math.min(initial.length - 1, Math.floor((y - bounds.top + node.scrollTop) / height)));
      const order = preview.value ?? initial;
      if (order.indexOf(id) !== to)
        preview.value = reorderLayer(
          order.map((id) => ({ id })),
          id,
          to,
        ).map((layer) => layer.id);
    };
    const tick = () => {
      apply();
      frame = requestAnimationFrame(tick);
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      y = next.clientY;
      if (!active && Math.abs(y - startY) >= 4) {
        active = true;
        dragging.value = id;
        preview.value = initial;
        frame = requestAnimationFrame(tick);
      }
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('blur', cleanup);
      target.removeEventListener('lostpointercapture', cancel);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      preview.value = null;
      dragging.value = null;
      disposeGesture = null;
    };
    const end = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      y = next.clientY;
      apply();
      const index = preview.value?.indexOf(id) ?? initial.indexOf(id);
      if (active && index !== initial.indexOf(id)) commit(id, index);
      cleanup();
    };
    const cancel = (next: PointerEvent) => {
      if (next.pointerId === pointerId) cleanup();
    };
    const keydown = (next: KeyboardEvent) => {
      if (next.key === 'Escape') {
        next.preventDefault();
        next.stopPropagation();
        cleanup();
      }
    };
    disposeGesture = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', keydown);
    window.addEventListener('blur', cleanup);
    target.addEventListener('lostpointercapture', cancel);
  };
  onScopeDispose(() => disposeGesture?.());
  return { preview, dragging, begin };
}
