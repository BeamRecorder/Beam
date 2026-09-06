<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RotateCcw } from '@lucide/vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { mirrorCrop } from '../../canvas/composables/layer-transform-geometry';
import { changeCropEdge, cropPixels, cropsEqual, FULL_CROP } from '../../composition/crop/crop-pixels';
import type { CropEdge } from '../../composition/crop/crop-types';
import type { NormalizedCrop } from '~/media/shared/composition-types';
import type { SelectedClipProperties } from '../properties-panel-types';

const props = defineProps<{ clip: SelectedClipProperties }>();
const emit = defineEmits<{
  (event: 'update', crop: NormalizedCrop): void;
  (event: 'preview', crop: NormalizedCrop | null): void;
}>();
const { t } = useTranslate('CropControls');
const edges: CropEdge[] = ['top', 'bottom', 'left', 'right'];
const draft = ref<NormalizedCrop | null>(null);
const interacting = ref(false);
let initialCrop: NormalizedCrop | undefined;
let ignoreUpdates = false;
let disposed = false;
const begin = () => {
  initialCrop = props.clip.crop;
  ignoreUpdates = false;
  interacting.value = true;
};
const size = computed(() => props.clip.cropDimensions);
const crop = computed(() => draft.value ?? props.clip.crop);
const mirrored = (value: NormalizedCrop) => mirrorCrop(value, !!props.clip.isMirrored, !!props.clip.isMirroredY);
const displayCrop = computed(() => mirrored(crop.value ?? FULL_CROP));
const pixels = computed(() => (size.value ? cropPixels(displayCrop.value, size.value) : null));
const maximum = (edge: CropEdge) => {
  if (!size.value || !pixels.value) return 0;
  return edge === 'left'
    ? size.value.width - pixels.value.right - 1
    : edge === 'right'
      ? size.value.width - pixels.value.left - 1
      : edge === 'top'
        ? size.value.height - pixels.value.bottom - 1
        : size.value.height - pixels.value.top - 1;
};
const commit = (value: NormalizedCrop) => {
  emit('update', value);
  draft.value = null;
  emit('preview', null);
};
const canReset = computed(
  () =>
    !cropsEqual(crop.value, FULL_CROP) ||
    !!(props.clip.cameraFramingPreset && props.clip.cameraFramingPreset !== 'custom'),
);
const reset = () => {
  if (canReset.value) commit(FULL_CROP);
};
const update = (edge: CropEdge, value: number) => {
  if (!size.value || ignoreUpdates || disposed) return;
  const next = mirrored(changeCropEdge(displayCrop.value, size.value, edge, value));
  if (interacting.value) {
    draft.value = next;
    emit('preview', next);
  } else if (!cropsEqual(next, props.clip.crop)) commit(next);
};
const finish = () => {
  interacting.value = false;
  if (draft.value && !cropsEqual(draft.value, initialCrop)) commit(draft.value);
  else {
    draft.value = null;
    emit('preview', null);
  }
  ignoreUpdates = false;
};
const cancel = () => {
  ignoreUpdates = interacting.value;
  interacting.value = false;
  draft.value = null;
  emit('preview', null);
};
watch(() => props.clip.id, cancel);
// External changes (including history restoration) supersede any unfinished gesture.
watch(
  () => props.clip.crop,
  (value) => {
    if (draft.value && !cropsEqual(value, draft.value)) cancel();
  },
);
onBeforeUnmount(() => {
  disposed = true;
  cancel();
});
</script>

<template>
  <div class="crop-controls">
    <template v-if="size && pixels">
      <div class="crop-summary">
        <span>{{ pixels.width }} × {{ pixels.height }} px</span>
        <Button
          variant="ghost"
          size="xs"
          :icon="RotateCcw"
          :aria-label="t('reset')"
          :disabled="!canReset"
          @click="reset"
          >{{ t('reset') }}</Button
        >
      </div>
      <p class="crop-hint">{{ t('source', { width: size.width, height: size.height }) }}</p>
      <BigSlider
        v-for="edge in edges"
        :key="edge"
        :model-value="pixels[edge]"
        :min="0"
        :max="maximum(edge)"
        :step="1"
        :label="t(edge)"
        :format-value="(value) => `${Math.round(value)} px`"
        @update:model-value="update(edge, $event)"
        @interaction-start="begin"
        @interaction-end="finish"
        @interaction-cancel="cancel"
      />
    </template>
    <p v-else class="crop-hint">{{ t('unavailable') }}</p>
  </div>
</template>

<style scoped>
.crop-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.crop-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.crop-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.4;
}
</style>
