import { computed, getCurrentInstance, onMounted, onUnmounted, ref } from 'vue';
import { capture } from '~/api/capture';

export const DEFAULT_TIMELINE_HEIGHT = 210;
export const MIN_TIMELINE_HEIGHT = 100;
export const MAX_TIMELINE_HEIGHT = 520;

export const clampTimelineHeight = (height: number, viewportHeight = Infinity): number => {
  const preferred = Number.isFinite(height) ? height : DEFAULT_TIMELINE_HEIGHT;
  // Reserve the titlebar, preview tools and a usable canvas instead of allowing
  // a large saved timeline to consume a shorter, scaled display.
  const available = Number.isFinite(viewportHeight)
    ? Math.min(viewportHeight / 2, viewportHeight - 320)
    : MAX_TIMELINE_HEIGHT;
  const maximum = Math.max(MIN_TIMELINE_HEIGHT, Math.min(MAX_TIMELINE_HEIGHT, Math.floor(available)));
  return Math.max(MIN_TIMELINE_HEIGHT, Math.min(maximum, Math.round(preferred)));
};

export function useTimelineResize(initialHeight = DEFAULT_TIMELINE_HEIGHT) {
  const preferredHeight = ref(clampTimelineHeight(initialHeight));
  const viewportHeight = ref(typeof window === 'undefined' ? Infinity : window.innerHeight);
  const timelineHeight = computed(() => clampTimelineHeight(preferredHeight.value, viewportHeight.value));
  const updateViewport = () => {
    viewportHeight.value = window.innerHeight;
  };
  const isResizingTimeline = ref(false);

  const loadPreferences = async () => {
    try {
      const prefs = await capture.getPreferences();
      const saved = Number(prefs.extras?.timelineHeight);
      if (Number.isFinite(saved) && saved > 0) {
        preferredHeight.value = clampTimelineHeight(saved);
      }
    } catch {
      // Ignored if preferences are unavailable
    }
  };

  const persistHeight = async (height: number) => {
    try {
      const prefs = await capture.getPreferences();
      await capture.updatePreferences({
        extras: {
          ...prefs.extras,
          timelineHeight: height,
        },
      });
    } catch {
      // Ignored if preferences are unavailable
    }
  };

  let activeRafId: number | null = null;
  let cancelResize: (() => void) | null = null;

  const startTimelineResize = (event: PointerEvent) => {
    cancelResize?.();
    event.preventDefault();
    isResizingTimeline.value = true;
    const startY = event.clientY;
    const startHeight = timelineHeight.value;
    let pendingY: number | null = null;

    const applyHeightUpdate = (clientY: number) => {
      const deltaY = startY - clientY;
      preferredHeight.value = clampTimelineHeight(startHeight + deltaY, viewportHeight.value);
    };

    const onPointerMove = (moveEvent: PointerEvent | MouseEvent) => {
      pendingY = moveEvent.clientY;
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        if (activeRafId !== null) return;
        activeRafId = window.requestAnimationFrame(() => {
          activeRafId = null;
          if (pendingY !== null) {
            applyHeightUpdate(pendingY);
          }
        });
      } else {
        applyHeightUpdate(pendingY);
      }
    };

    const stopResize = (persist: boolean) => {
      isResizingTimeline.value = false;
      if (typeof window !== 'undefined') {
        if (activeRafId !== null) {
          window.cancelAnimationFrame(activeRafId);
          activeRafId = null;
        }
        if (pendingY !== null) {
          applyHeightUpdate(pendingY);
          pendingY = null;
        }
        window.removeEventListener('pointermove', onPointerMove as EventListener);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        window.removeEventListener('mousemove', onPointerMove as EventListener);
        window.removeEventListener('mouseup', onPointerUp);
      }
      cancelResize = null;
      if (persist) void persistHeight(timelineHeight.value);
    };
    const onPointerUp = () => stopResize(true);
    cancelResize = () => stopResize(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', onPointerMove as EventListener);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      window.addEventListener('mousemove', onPointerMove as EventListener);
      window.addEventListener('mouseup', onPointerUp);
    }
  };

  let unbindPreferences: (() => void) | undefined;
  if (getCurrentInstance()) {
    onMounted(() => {
      updateViewport();
      window.addEventListener('resize', updateViewport);
      void loadPreferences();
      try {
        unbindPreferences = capture.onPreferencesChanged((prefs) => {
          const saved = Number(prefs.extras?.timelineHeight);
          if (Number.isFinite(saved) && saved > 0) {
            preferredHeight.value = clampTimelineHeight(saved);
          }
        });
      } catch {
        // Ignored if listener unsupported
      }
    });

    onUnmounted(() => {
      window.removeEventListener('resize', updateViewport);
      unbindPreferences?.();
      cancelResize?.();
    });
  }

  return {
    timelineHeight,
    isResizingTimeline,
    startTimelineResize,
    loadPreferences,
    persistHeight,
  };
}
