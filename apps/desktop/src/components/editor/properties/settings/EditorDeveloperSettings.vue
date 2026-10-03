<script setup lang="ts">
import { ref, watch } from 'vue';
import { Video, Terminal } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import TogglePreference from '~/components/settings/TogglePreference.vue';
import RafRevealTransition from '~/ui/transitions/RafRevealTransition.vue';
import { capture } from '~/api/capture';
import { useTranslate } from '~/i18n/useTranslate';
const { t } = useTranslate('SettingsPanel');
defineProps<{ hideRecorder?: boolean }>();

const toggleDevTools = () => {
  capture.toggleDevTools?.();
};

const isDevModeEnabled = ref(localStorage.getItem('dev_mode_enabled') === 'true');
watch(isDevModeEnabled, (value) => {
  localStorage.setItem('dev_mode_enabled', String(value));
});

const recorderOpening = ref(false);
const recorderLaunchError = ref('');
const openRecorder = async () => {
  if (recorderOpening.value) return;
  recorderOpening.value = true;
  recorderLaunchError.value = '';
  try {
    const opened = await capture.openRecorderFromEditor();
    if (!opened) throw new Error(t('recorderUnavailable'));
  } catch (error) {
    recorderLaunchError.value = error instanceof Error ? error.message : String(error);
  } finally {
    recorderOpening.value = false;
  }
};
</script>
<template>
  <div class="developer-settings">
    <div class="prop-item dev-mode-section">
      <TogglePreference
        v-model="isDevModeEnabled"
        class="dev-switch"
        :label="t('devMode')"
        :description="t('devModeDesc')"
      />

      <RafRevealTransition>
        <div v-if="isDevModeEnabled" class="dev-frame">
          <div v-if="!hideRecorder" class="dev-option-card">
            <div class="dev-option-info">
              <span class="dev-option-label">{{ t('recorderTool') }}</span>
              <span class="dev-option-desc">{{ t('recorderDesc') }}</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              class="dev-action-btn"
              :loading="recorderOpening"
              @click="openRecorder"
            >
              <template #icon><Video class="btn-icon" /></template>
              {{ t('launchRecorder') }}
            </Button>
            <p v-if="recorderLaunchError" class="dev-option-error" role="alert">
              {{ t('recorderLaunchError', { error: recorderLaunchError }) }}
            </p>
          </div>

          <div class="dev-option-card">
            <div class="dev-option-info">
              <span class="dev-option-label">{{ t('devToolsTool') }}</span>
              <span class="dev-option-desc">{{ t('devToolsDesc') }}</span>
            </div>
            <Button variant="secondary" size="sm" class="dev-action-btn" @click="toggleDevTools">
              <template #icon><Terminal class="btn-icon" /></template>
              {{ t('openDevTools') }}
            </Button>
          </div>
        </div>
      </RafRevealTransition>
    </div>
  </div>
</template>
<style scoped>
.dev-frame {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}
.dev-option-card {
  display: grid;
  gap: 8px;
}
.dev-option-info {
  display: grid;
  gap: 4px;
}
.dev-option-label {
  font-size: var(--font-size-body);
  font-weight: var(--weight-title);
  color: var(--text-primary);
}
.dev-option-desc {
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--text-secondary);
}
.dev-action-btn {
  width: 100%;
  justify-content: center;
}
.btn-icon {
  width: 14px;
  height: 14px;
}
.dev-option-error {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-error);
}
</style>
