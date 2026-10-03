<script setup lang="ts">
import BigSlider from '~/ui/slider/BigSlider.vue';
import CanvasBackgroundTabs from './CanvasBackgroundTabs.vue';
import RemoveBackgroundControl from './RemoveBackgroundControl.vue';
import WatermarkControls from './WatermarkControls.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { CanvasPanelLayoutProps } from './canvas-panel-layout-types';
import type { WatermarkSettings } from '@beam/engine/layout/output-canvas';
defineProps<CanvasPanelLayoutProps>();
const emit = defineEmits<{
  'update:showBackground': [value: boolean];
  'update:activeKind': [value: CanvasPanelLayoutProps['activeKind']];
  'update:blurPercent': [value: number];
  'blur-interaction-end': [];
  'update:watermark': [value: WatermarkSettings];
}>();
const { t } = useTranslate('CanvasPanel');
const { t: propertiesText } = useTranslate('PropertiesPanel');
const { t: screenshotText } = useTranslate('ScreenshotEditor');
</script>

<template>
  <div class="canvas-panel-container">
    <section class="background-section" aria-labelledby="canvas-background-heading">
      <h4 id="canvas-background-heading" class="section-heading">{{ propertiesText('background') }}</h4>
      <RemoveBackgroundControl
        :description="still ? screenshotText('removeBackgroundDescription') : undefined"
        :model-value="!showBackground"
        @update:model-value="emit('update:showBackground', !$event)"
      />
      <div v-show="showBackground" class="background-options">
        <CanvasBackgroundTabs
          :model-value="activeKind"
          :still="still"
          @update:model-value="emit('update:activeKind', $event)"
        />
        <div class="tab-content-panel"><slot /></div>
        <div class="slider-row">
          <BigSlider
            :model-value="blurPercent"
            :min="0"
            :max="100"
            :step="1"
            :label="t('blur')"
            :format-value="(value: number) => `${Math.round(value)}%`"
            @update:model-value="emit('update:blurPercent', $event)"
            @interaction-end="emit('blur-interaction-end')"
          />
        </div>
      </div>
    </section>
    <WatermarkControls
      :description="still ? screenshotText('watermarkDescription') : undefined"
      :model-value="watermark"
      @update:model-value="emit('update:watermark', $event)"
    />
  </div>
</template>

<style scoped src="./canvas-panel.css"></style>
