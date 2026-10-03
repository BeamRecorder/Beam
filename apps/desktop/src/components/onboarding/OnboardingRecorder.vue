<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CaptureMode } from '@beam/engine/capture/capture-mode';
import HUD from '../hud/HUD.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { RecorderTourFeature } from './onboarding-types';

const mode = defineModel<CaptureMode>({ required: true });
const { t } = useTranslate('Onboarding');
const feature = ref<RecorderTourFeature>('screen');
const explanations = computed(() => ({
  screen: t('screenTour'),
  region: t('regionTour'),
  window: t('windowTour'),
  camera: t('cameraTour'),
  mic: t('micTour'),
  systemAudio: t('systemAudioTour'),
  teleprompter: t('teleprompterTour'),
  tabs: t('modesTour'),
  projects: t('projectsTour'),
  topbar: t('settingsTour'),
}));
const focus = (key: string) => {
  if (Object.hasOwn(explanations.value, key)) feature.value = key as RecorderTourFeature;
};
</script>
<template>
  <div class="recorder-tour">
    <div class="recorder-stage">
      <HUD
        embedded
        show-topbar
        :embedded-capture-mode="mode"
        @update:capture-mode="mode = $event"
        @focus-feature="focus"
      />
    </div>
    <p class="feature-description" aria-live="polite">{{ explanations[feature] }}</p>
  </div>
</template>
<style scoped>
.recorder-tour {
  display: grid;
  gap: 24px;
}
.recorder-stage {
  display: flex;
  justify-content: center;
  padding: 24px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.feature-description {
  max-width: 580px;
  min-height: 48px;
  margin: 0 auto;
  text-align: center;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.5;
}
</style>
