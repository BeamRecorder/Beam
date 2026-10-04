<script setup lang="ts">
import { computed, ref } from 'vue';
import QuickSnipSelectionBar from '../quick-snip/QuickSnipSelectionBar.vue';
import type { QuickSnipSelectionState } from '../quick-snip/quick-snip-selection-types';
import type { QuickSnipDeviceKind } from '~/api/types/quick-snip';
import type { HudCaptureTarget } from '../hud/hud-state-types';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('Onboarding');
const { t: quick } = useTranslate('QuickSnipCropBar');
const mode = ref<'studio' | 'screenshot'>('studio');
const target = ref<HudCaptureTarget>('region');
const feature = ref('quickDescription');
const state = computed<QuickSnipSelectionState>(() => ({
  displayMode: mode.value,
  mode: mode.value,
  captureTarget: target.value,
  settingsDisabled: false,
  microphone: false,
  microphoneLevel: 0,
  systemAudio: false,
  systemAudioLevel: 0,
  camera: false,
  settingsOpen: false,
  captureHint: quick(mode.value === 'screenshot' ? 'screenshot' : 'start'),
  preparing: false,
  actionPending: false,
  configured: true,
  deviceMenuBusy: false,
}));
const choose = (next: HudCaptureTarget) => {
  target.value = next;
  feature.value = `${next}Tour`;
};
const device = (kind: QuickSnipDeviceKind) => {
  feature.value = kind === 'microphone' ? 'micTour' : `${kind}Tour`;
};
const changeMode = (next: 'studio' | 'screenshot') => {
  mode.value = next;
  feature.value = next === 'screenshot' ? 'quickImage' : 'quickVideo';
};
</script>
<template>
  <div class="quick-tour">
    <div class="quick-stage">
      <QuickSnipSelectionBar
        embedded
        :state="state"
        @update:display-mode="changeMode"
        @select-source="choose"
        @device-menu="device"
        @device-keydown="device"
        @toggle-settings="feature = 'quickSettings'"
        @capture="feature = mode === 'screenshot' ? 'quickImage' : 'quickVideo'"
        @cancel="feature = 'quickDescription'"
      />
    </div>
    <p aria-live="polite">{{ t(feature) }}</p>
  </div>
</template>
<style scoped>
.quick-tour {
  display: grid;
  gap: 28px;
  padding: 42px 0;
}
.quick-stage {
  position: relative;
  width: 636px;
  height: 96px;
  max-width: 100%;
  margin: 0 auto;
}
p {
  min-height: 72px;
  max-width: 580px;
  margin: 0 auto;
  text-align: center;
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-secondary);
}
</style>
