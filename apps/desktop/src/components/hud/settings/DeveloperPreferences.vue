<script setup lang="ts">
import { ref } from 'vue';
import { FlaskConical, Terminal } from '@lucide/vue';
import { capture } from '~/api/capture';
import { useTranslate } from '~/i18n/useTranslate';
import Button from '~/ui/button/Button.vue';

const { t } = useTranslate('HudPreferences');
const { t: tSettings } = useTranslate('SettingsPanel');
const pending = ref<'devtools' | 'mascot' | null>(null);
const error = ref('');
const open = async (target: 'devtools' | 'mascot') => {
  if (pending.value) return;
  pending.value = target;
  error.value = '';
  try {
    if (target === 'devtools') await capture.openDeveloperTools();
    else await capture.openMascotLab();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    pending.value = null;
  }
};
</script>

<template>
  <div class="preference-stack">
    <div class="preference-item" data-setting="devtools" tabindex="-1">
      <div class="preference-copy">
        <p class="preference-title">{{ tSettings('devToolsTool') }}</p>
        <p class="preference-description">{{ tSettings('devToolsDesc') }}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        :icon="Terminal"
        :loading="pending === 'devtools'"
        :disabled="pending !== null"
        @click="open('devtools')"
        >{{ tSettings('openDevTools') }}</Button
      >
    </div>
    <div class="preference-item" data-setting="mascot-lab" tabindex="-1">
      <div class="preference-copy">
        <p class="preference-title">{{ t('mascotLab') }}</p>
        <p class="preference-description">{{ t('mascotLabDescription') }}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        :icon="FlaskConical"
        :loading="pending === 'mascot'"
        :disabled="pending !== null"
        @click="open('mascot')"
        >{{ t('openMascotLab') }}</Button
      >
    </div>
    <p v-if="error" class="developer-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped src="./settings-content.css"></style>
<style scoped>
.developer-error {
  color: var(--color-error);
  font-size: var(--font-size-body);
  margin: 0;
}
</style>
