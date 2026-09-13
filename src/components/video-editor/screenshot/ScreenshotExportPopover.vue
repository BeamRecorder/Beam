<script setup lang="ts">
import { Download } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import Select from '~/ui/select/Select.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Divider from '~/ui/divider/Divider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { ScreenshotDimensions } from './screenshot-types';
import ScreenshotSizeControls from './ScreenshotSizeControls.vue';

defineProps<{ state: ScreenshotState; original: ScreenshotDimensions; busy: boolean }>();
const advanced = defineModel<boolean>('advanced', { required: true });
const keepAspect = defineModel<boolean>('keepAspect', { required: true });
const emit = defineEmits<{ export: [] }>();
const { t } = useTranslate('ScreenshotEditor');
</script>

<template>
  <Popover align="right" :match-trigger-width="false" :close-on-window-blur="false">
    <template #trigger
      ><Button variant="primary" size="sm" :icon="Download" :loading="busy">{{ t('export') }}</Button></template
    >
    <div class="export-options">
      <h2>{{ t('exportImage') }}</h2>
      <ScreenshotSizeControls
        v-model:canvas="state.canvas"
        v-model:advanced="advanced"
        v-model:keep-aspect="keepAspect"
        :original="original"
      />
      <Divider spacing="xs" />
      <label class="format-field"
        ><span>{{ t('imageFormat') }}</span>
        <Select
          v-model="state.format"
          :options="[
            { label: 'PNG', value: 'png' },
            { label: 'WebP', value: 'webp' },
          ]"
          :aria-label="t('imageFormat')"
          size="md"
        />
      </label>
      <BigSlider
        v-if="state.format === 'webp'"
        v-model="state.quality"
        :label="t('quality')"
        :min="0.1"
        :max="1"
        :step="0.01"
      />
      <p>{{ t('transparency') }}</p>
      <Button variant="primary" :icon="Download" :loading="busy" block @click="emit('export')">{{
        t('saveImage')
      }}</Button>
    </div>
  </Popover>
</template>

<style scoped>
.export-options {
  width: 320px;
  max-width: calc(100vw - 48px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.export-options h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.format-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.export-options p {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
}
</style>
