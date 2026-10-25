import { computed, type Ref } from 'vue';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import { createCompositionScreenResolver } from '@beam/engine/composition/scene-layers';
import { screenCursorEnabled, setScreenCursorVisibility } from '@beam/engine/capture/screen-cursor';
import { selectionHasLocks } from '@beam/engine/composition/timeline-locks';
import type { ScreenCursorVisibilityContext } from '../properties/cursor/screen-cursor-visibility-types';

export function useScreenCursorVisibility(
  composition: Ref<ClipComposition>,
  selectedIds: Ref<string[]>,
  currentTime: Ref<number>,
  defaultEnabled: Ref<boolean>,
  applyTrackProperties?: (next: ClipComposition) => ClipComposition,
): ScreenCursorVisibilityContext {
  const screenAt = computed(() => createCompositionScreenResolver(composition.value));
  const targets = computed(() => {
    const ids = new Set(selectedIds.value);
    const selected = composition.value.clips.filter((clip) => clip.kind === 'screen' && ids.has(clip.id));
    if (selected.length) return selected;
    const current = screenAt.value(currentTime.value * 1000);
    return current ? [current] : [];
  });
  const disabled = computed(
    () =>
      !targets.value.length ||
      selectionHasLocks(composition.value, [], {
        clipIds: targets.value.map((clip) => clip.id),
        zoomIds: [],
      }),
  );
  const states = computed(() => targets.value.map((clip) => screenCursorEnabled(clip, defaultEnabled.value)));
  return {
    hasTargets: computed(() => targets.value.length > 0),
    disabled,
    mixed: computed(() => states.value.some(Boolean) && states.value.some((value) => !value)),
    enabled: computed({
      get: () => states.value.length > 0 && states.value.every(Boolean),
      set: (value: boolean) => {
        if (disabled.value) return;
        const next = setScreenCursorVisibility(
          composition.value,
          targets.value.map((clip) => clip.id),
          value,
        );
        composition.value = applyTrackProperties ? applyTrackProperties(next) : next;
      },
    }),
  };
}
