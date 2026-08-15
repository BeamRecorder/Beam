import { getCurrentInstance, onMounted, onUnmounted, ref } from 'vue';
import { capture } from '~/api/capture';

export const DEFAULT_TIMELINE_HEIGHT = 210;
export const MIN_TIMELINE_HEIGHT = 100;
export const MAX_TIMELINE_HEIGHT = 520;

export const clampTimelineHeight = (height: number): number => {
  if (!Number.isFinite(height)) return DEFAULT_TIMELINE_HEIGHT;
  return Math.max(MIN_TIMELINE_HEIGHT, Math.min(MAX_TIMELINE_HEIGHT, Math.round(height)));
};

export function useTimelineResize(initialHeight = DEFAULT_TIMELINE_HEIGHT) {
  const timelineHeight = ref(clampTimelineHeight(initialHeight));
  const isResizingTimeline = ref(false);

  const loadPreferences = async () => {
    try {
      const prefs = await capture.getPreferences();
      const saved = Number(prefs.extras?.timelineHeight);
      if (Number.isFinite(saved) && saved > 0) {
        timelineHeight.value = clampTimelineHeight(saved);
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

  const startTimelineResize = (event: PointerEvent) => {
    event.preventDefault();
    isResizingTimeline.value = true;
    const startY = event.clientY;
    const startHeight = timelineHeight.value;
    let pendingY: number | null = null;

    const applyHeightUpdate = (clientY: number) => {
      const deltaY = startY - clientY;
      const maxHeight =
        typeof window !== 'undefined' ? Math.min(MAX_TIMELINE_HEIGHT, window.innerHeight * 0.6) : MAX_TIMELINE_HEIGHT;
      const newHeight = Math.max(MIN_TIMELINE_HEIGHT, Math.min(maxHeight, startHeight + deltaY));
      timelineHeight.value = Math.round(newHeight);
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

    const onPointerUp = () => {
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
      void persistHeight(timelineHeight.value);
    };

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
      void loadPreferences();
      try {
        unbindPreferences = capture.onPreferencesChanged((prefs) => {
          const saved = Number(prefs.extras?.timelineHeight);
          if (Number.isFinite(saved) && saved > 0) {
            timelineHeight.value = clampTimelineHeight(saved);
          }
        });
      } catch {
        // Ignored if listener unsupported
      }
    });

    onUnmounted(() => {
      unbindPreferences?.();
      if (typeof window !== 'undefined' && activeRafId !== null) {
        window.cancelAnimationFrame(activeRafId);
        activeRafId = null;
      }
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
