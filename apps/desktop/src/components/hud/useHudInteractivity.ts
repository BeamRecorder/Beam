import { onBeforeUnmount, onMounted } from 'vue';
import { capture } from '~/api/capture';
const INTERACTIVE_SELECTORS =
  '.hud-wrapper, .recorder-bar, .camera-overlay-container, .camera-settings-popover, button, a, input, select, textarea, [role="button"], [tabindex], label, video, .popover-content, .popover-trigger, .action-menu-content';

export function useHudInteractivity(enabled: () => boolean) {
  let lastInteractive: boolean | null = null;
  let pointerInside = false;
  let lastMouseEvent: MouseEvent | null = null;
  const reset = () => {
    lastInteractive = null;
  };
  const apply = (interactive: boolean) => {
    if (interactive === lastInteractive) return;
    lastInteractive = interactive;
    capture.setInteractive(interactive);
  };
  const move = (event: MouseEvent) => {
    lastMouseEvent = event;
    pointerInside = true;
    if (!enabled()) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    apply(
      Boolean(
        target &&
        target !== document.documentElement &&
        target !== document.body &&
        target.closest(INTERACTIVE_SELECTORS),
      ),
    );
  };
  const leave = () => {
    pointerInside = false;
    apply(false);
  };
  const togglePopover = (opened: boolean) => {
    if (opened) apply(true);
    else if (pointerInside && lastMouseEvent) move(lastMouseEvent);
    else leave();
  };
  onMounted(() => {
    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('mouseleave', leave, { passive: true });
    window.addEventListener('focus', reset);
    document.addEventListener('visibilitychange', reset);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseleave', leave);
    window.removeEventListener('focus', reset);
    document.removeEventListener('visibilitychange', reset);
  });
  return {
    togglePopover,
    reset,
  };
}
