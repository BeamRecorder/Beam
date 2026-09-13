<script setup lang="ts">
import { computed } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import { Clapperboard, ScanLine, Zap } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import type { CaptureMode } from '~/api/types/capture-mode';

const { t } = useTranslate('QuickSnipCropBar');

const props = withDefaults(
  defineProps<{
    modelValue: CaptureMode;
    disabled?: boolean;
    full?: boolean;
    modes?: CaptureMode[];
    labels?: boolean;
  }>(),
  { modes: () => ['studio', 'screenshot', 'instant'] },
);
const emit = defineEmits<{ 'update:modelValue': [mode: CaptureMode] }>();
const availableModes = [
  { id: 'studio', icon: Clapperboard },
  { id: 'screenshot', icon: ScanLine },
  { id: 'instant', icon: Zap },
] as const;
const visibleModes = computed(() => availableModes.filter((mode) => props.modes.includes(mode.id)));
const columns = computed(() => (visibleModes.value.length === 1 ? 1 : visibleModes.value.length === 2 ? 2 : 3));
</script>

<template>
  <ButtonGroup
    size="sm"
    class="capture-modes"
    :full="full"
    :columns="full ? columns : undefined"
    role="group"
    :aria-label="t('mode')"
  >
    <Button
      v-for="mode in visibleModes"
      :key="mode.id"
      size="sm"
      :icon-only="!labels"
      :icon="mode.icon"
      variant="tab"
      :class="{ active: modelValue === mode.id }"
      :title="labels ? t(mode.id) : undefined"
      :tooltip="labels ? '' : t(`${mode.id}Description`)"
      tooltip-position="bottom"
      :aria-label="t(mode.id)"
      :aria-pressed="modelValue === mode.id"
      :disabled="disabled"
      @click="emit('update:modelValue', mode.id)"
      >{{ labels ? t(mode.id) : undefined }}</Button
    >
  </ButtonGroup>
</template>

<style scoped>
.capture-modes {
  -webkit-app-region: no-drag;
}
</style>
