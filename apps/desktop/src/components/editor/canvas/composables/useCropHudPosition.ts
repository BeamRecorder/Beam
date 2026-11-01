import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { CSSProperties, Ref } from 'vue';

/** Observe host transforms too: ResizeObserver alone misses viewport zoom and pan. */
export function useCropHudPosition(anchor: Ref<HTMLElement | null>, hud: Ref<HTMLElement | null>) {
  const hudStyle = ref<CSSProperties>({ visibility: 'hidden' });
  let frame = 0,
    resize: ResizeObserver | undefined,
    mutation: MutationObserver | undefined,
    disposed = false;
  const position = () => {
    frame = 0;
    if (!anchor.value || !hud.value) return;
    const crop = anchor.value.getBoundingClientRect(),
      controls = hud.value.getBoundingClientRect(),
      viewport = anchor.value.closest('.stage-bounds, .canvas-island')?.getBoundingClientRect(),
      windowWidth = document.documentElement.clientWidth || window.innerWidth,
      windowHeight = document.documentElement.clientHeight || window.innerHeight,
      left = Math.max(8, viewport?.left ?? 0),
      right = Math.min(windowWidth - 8, viewport?.right ?? windowWidth),
      top = Math.max(8, viewport?.top ?? 0),
      bottom = Math.min(windowHeight - 8, viewport?.bottom ?? windowHeight),
      below = bottom - crop.bottom >= controls.height + 10 || bottom - crop.bottom >= crop.top - top,
      proposedTop = below ? crop.bottom + 10 : crop.top - controls.height - 10;
    hudStyle.value = {
      top: `${Math.round(Math.max(top, Math.min(bottom - controls.height, proposedTop)))}px`,
      left: `${Math.round(Math.max(left, Math.min(right - controls.width, crop.left + crop.width / 2 - controls.width / 2)))}px`,
      maxWidth: `${Math.max(1, right - left)}px`,
      visibility: 'visible',
    };
  };
  const schedule = () => {
    if (disposed) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(position);
  };
  const keydown = (event: KeyboardEvent) => {
    if (
      event.key === 'Enter' &&
      !event.defaultPrevented &&
      !(
        event.target instanceof Element &&
        event.target.closest('input,textarea,select,button,[role="menu"],[contenteditable="true"]')
      )
    )
      hud.value?.querySelector<HTMLButtonElement>('.crop-ok-button')?.click();
  };
  onMounted(() => {
    void nextTick(() => {
      if (disposed) return;
      schedule();
      if (typeof ResizeObserver !== 'undefined') {
        resize = new ResizeObserver(schedule);
        if (anchor.value) resize.observe(anchor.value);
        if (hud.value) resize.observe(hud.value);
        const viewport = anchor.value?.closest('.stage-bounds, .canvas-island');
        if (viewport) resize.observe(viewport);
      }
      mutation = new MutationObserver(schedule);
      for (let element = anchor.value; element && element !== document.body; element = element.parentElement)
        mutation.observe(element, { attributes: true, attributeFilter: ['style', 'class'] });
    });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('keydown', keydown);
  });
  onBeforeUnmount(() => {
    disposed = true;
    cancelAnimationFrame(frame);
    resize?.disconnect();
    mutation?.disconnect();
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('keydown', keydown);
  });
  return { hudStyle, scheduleHudPosition: schedule };
}
