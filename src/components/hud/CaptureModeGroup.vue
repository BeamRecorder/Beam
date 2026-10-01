<script setup lang="ts">
import { computed } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import CaptureModeIcon from '../capture/CaptureModeIcon.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import type { CaptureMode } from '~/api/types/capture-mode';

const { t } = useTranslate('QuickSnipCropBar');
const { t: tHud } = useTranslate('HUD');

const props = withDefaults(
  defineProps<{
    modelValue: CaptureMode;
    disabled?: boolean;
    full?: boolean;
    modes?: CaptureMode[];
    labels?: boolean;
    stacked?: boolean;
  }>(),
  { modes: () => ['studio', 'screenshot', 'instant'] },
);
const emit = defineEmits<{ 'update:modelValue': [mode: CaptureMode] }>();
const availableModes = [{ id: 'studio' }, { id: 'screenshot' }, { id: 'instant' }] as const;
const visibleModes = computed(() => availableModes.filter((mode) => props.modes.includes(mode.id)));
const columns = computed(() => (visibleModes.value.length === 1 ? 1 : visibleModes.value.length === 2 ? 2 : 3));
</script>

<template>
  <ButtonGroup
    size="sm"
    class="capture-modes"
    :class="{ 'is-stacked': stacked }"
    :full="full"
    :columns="full ? columns : undefined"
    :selection="{ index: visibleModes.findIndex((mode) => mode.id === modelValue), count: visibleModes.length }"
    role="group"
    :aria-label="t('mode')"
  >
    <Button
      v-for="mode in visibleModes"
      :key="mode.id"
      size="sm"
      :icon-only="!labels"
      variant="tab"
      :class="{ active: modelValue === mode.id, stacked }"
      :title="labels ? (stacked && mode.id === 'studio' ? tHud('recorder') : t(mode.id)) : undefined"
      :tooltip="labels ? '' : t(`${mode.id}Description`)"
      tooltip-position="bottom"
      :aria-label="stacked && mode.id === 'studio' ? tHud('recorder') : t(mode.id)"
      :aria-pressed="modelValue === mode.id"
      :disabled="disabled"
      @click="emit('update:modelValue', mode.id)"
    >
      <template #icon><CaptureModeIcon :mode="mode.id" decorative /></template>
      {{ labels ? (stacked && mode.id === 'studio' ? tHud('recorder') : t(mode.id)) : undefined }}
    </Button>
  </ButtonGroup>
</template>

<style scoped>
.capture-modes {
  -webkit-app-region: no-drag;
}
/* Button forwards attributes to its native control inside a wrapper. */
.capture-modes :deep(.stacked) {
  flex-direction: column;
  height: 34px;
  gap: 2px;
  padding: 2px 6px;
  font-size: var(--font-size-sm);
  line-height: 12px;
  font-weight: var(--weight-body);
}
</style>
