import { onBeforeUnmount, onMounted, ref } from 'vue';

const FULLSCREEN_EXIT_DURATION_MS = 160;
const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useElementFullscreen(element: () => HTMLElement | null) {
  const isFullscreen = ref(false);
  const isExiting = ref(false);
  let exitTimer: ReturnType<typeof setTimeout> | null = null;

  const finishExit = () => {
    if (exitTimer) clearTimeout(exitTimer);
    exitTimer = null;
    document.body.classList.remove('beam-app-fullscreen-active');
    isFullscreen.value = false;
    isExiting.value = false;
  };

  const exitFullscreen = (immediate = false) => {
    if (!isFullscreen.value || isExiting.value) return;
    if (immediate || prefersReducedMotion()) {
      finishExit();
      return;
    }
    isExiting.value = true;
    exitTimer = setTimeout(finishExit, FULLSCREEN_EXIT_DURATION_MS);
  };

  const enterFullscreen = () => {
    if (exitTimer) clearTimeout(exitTimer);
    exitTimer = null;
    document.body.classList.add('beam-app-fullscreen-active');
    isFullscreen.value = true;
    isExiting.value = false;
  };

  const toggleFullscreen = () => {
    if (isExiting.value) return;
    if (isFullscreen.value) {
      exitFullscreen();
      return;
    }
    const target = element();
    if (!target) {
      console.warn('[Beam fullscreen] Preview target is unavailable.');
      return;
    }
    enterFullscreen();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.code === 'Space' || event.key === ' ') && isFullscreen.value) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches('button, [role="button"], a[href]')) {
        event.preventDefault();
        active.blur();
      }
      return;
    }
    if (event.key !== 'Escape' || !isFullscreen.value) return;
    event.preventDefault();
    event.stopPropagation();
    exitFullscreen();
  };

  onMounted(() => document.addEventListener('keydown', handleKeyDown, true));
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleKeyDown, true);
    finishExit();
  });

  return { isExiting, isFullscreen, toggleFullscreen };
}
