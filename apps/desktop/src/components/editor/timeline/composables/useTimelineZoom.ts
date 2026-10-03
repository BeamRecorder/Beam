import { getCurrentInstance, onMounted, onUnmounted, ref, watch } from 'vue';
import { capture } from '~/api/capture';
import { clampTimelineZoom, MIN_TIMELINE_ZOOM } from './timeline-zoom';

export const DEFAULT_TIMELINE_ZOOM = 100;

export function useTimelineZoom(initialZoom = DEFAULT_TIMELINE_ZOOM) {
  const timelineZoomLevel = ref(clampTimelineZoom(initialZoom));

  const loadPreferences = async () => {
    try {
      const prefs = await capture.getPreferences();
      const saved = Number(prefs.extras?.timelineZoomLevel);
      if (Number.isFinite(saved) && saved >= MIN_TIMELINE_ZOOM) {
        timelineZoomLevel.value = clampTimelineZoom(saved);
      }
    } catch {
      // Ignored if preferences are unavailable
    }
  };

  const persistZoom = async (zoom: number) => {
    try {
      const prefs = await capture.getPreferences();
      await capture.updatePreferences({
        extras: {
          ...prefs.extras,
          timelineZoomLevel: clampTimelineZoom(zoom),
        },
      });
    } catch {
      // Ignored if preferences are unavailable
    }
  };

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedPersistZoom = (zoom: number) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void persistZoom(zoom);
    }, 300);
  };

  let unbindPreferences: (() => void) | undefined;
  if (getCurrentInstance()) {
    onMounted(() => {
      void loadPreferences();
      try {
        unbindPreferences = capture.onPreferencesChanged((prefs) => {
          const saved = Number(prefs.extras?.timelineZoomLevel);
          if (Number.isFinite(saved) && saved >= MIN_TIMELINE_ZOOM) {
            timelineZoomLevel.value = clampTimelineZoom(saved);
          }
        });
      } catch {
        // Ignored if listener unsupported
      }
    });

    onUnmounted(() => {
      unbindPreferences?.();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    });

    watch(timelineZoomLevel, (val) => {
      debouncedPersistZoom(val);
    });
  }

  return {
    timelineZoomLevel,
    loadPreferences,
    persistZoom,
  };
}
