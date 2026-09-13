import { computed, type Ref } from 'vue';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { BlurClip } from '~/media/shared/composition-types';
import type { BlurPatch } from '../properties/clip/blur-properties-types';
import { HIGHLIGHT_DEFAULTS } from '~/media/shared/highlight-defaults';
import { useTranslate } from '~/i18n/useTranslate';
import { initializeScreenshotComposition, insertScreenshotLayer } from './screenshot-layers';

export function useScreenshotEffects(
  state: Ref<ScreenshotState | null>,
  selectedId: Ref<string | null>,
  select: (id: string) => void,
  canInteract: () => boolean,
) {
  const { t } = useTranslate('Highlight');
  const selected = computed(() => state.value?.effects?.find((effect) => effect.id === selectedId.value));
  const add = () => {
    if (!state.value || !canInteract()) return;
    const id = crypto.randomUUID();
    const clip: BlurClip = {
      ...structuredClone(HIGHLIGHT_DEFAULTS),
      id,
      trackId: id,
      kind: 'blur',
      assetId: '',
      name: t('title'),
      enabled: true,
      order: 0,
      timelineStartMs: 0,
      timelineDurationMs: 1,
      sourceInMs: 0,
      sourceDurationMs: 1,
      playbackRate: 1,
      transitions: { entry: null, exit: null },
    };
    initializeScreenshotComposition(state.value);
    (state.value.effects ??= []).push(clip);
    insertScreenshotLayer(state.value, id);
    select(id);
  };
  const update = (patch: BlurPatch) => {
    if (selected.value && canInteract()) Object.assign(selected.value, patch);
  };
  return { selected, add, update };
}
