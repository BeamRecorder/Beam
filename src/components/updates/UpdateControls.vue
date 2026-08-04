<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Download, ExternalLink, RefreshCw, RotateCcw } from '@lucide/vue';
import { capture } from '~/api/capture';
import type { AppUpdateState } from '~/api/types/capture-api';
import { useTranslate } from '~/i18n/useTranslate';
import Button from '~/ui/button/Button.vue';

const { t } = useTranslate('Updates');
const state = ref<AppUpdateState | null>(null);
let stopListening: (() => void) | undefined;

const refresh = async () => {
  state.value = await capture.checkForUpdates();
};
const download = async () => {
  await capture.downloadUpdate();
};
const restart = async () => {
  await capture.quitAndInstallUpdate();
};
const openChangelog = async () => {
  await capture.openUpdateChangelog();
};

onMounted(async () => {
  stopListening = capture.onUpdateState((nextState) => {
    state.value = nextState;
  });
  state.value = await capture.getUpdateState();
});
onBeforeUnmount(() => stopListening?.());
</script>

<template>
  <div class="update-controls">
    <div class="update-header">
      <span class="update-title">{{ t('title') }}</span>
      <p class="update-description">
        <template v-if="state?.status === 'downloaded'">{{
          t('readyToRestart', { version: state.availableVersion })
        }}</template>
        <template v-else-if="state?.status === 'downloading'">{{
          t('downloading', { percent: state.percent ?? 0 })
        }}</template>
        <template v-else-if="state?.status === 'checking'">{{ t('checking') }}</template>
        <template v-else-if="state?.status === 'available'">{{
          t('updateAvailable', { version: state.availableVersion ?? '…' })
        }}</template>
        <template v-else-if="state?.status === 'not-available'">{{
          t('upToDate', { version: state.currentVersion })
        }}</template>
        <template v-else-if="state?.status === 'error'">{{ t('updateError') }}</template>
        <template v-else-if="state?.status === 'unsupported'">{{ t('availableInInstalledApp') }}</template>
        <template v-else>{{ t('currentVersion', { version: state?.currentVersion ?? '…' }) }}</template>
      </p>

      <details v-if="state?.status === 'error' && state.message" class="error-details">
        <summary class="error-summary">{{ t('showDetails') }}</summary>
        <pre class="error-log">{{ state.message }}</pre>
      </details>
    </div>
    <div class="update-actions">
      <Button variant="secondary" size="xs" :disabled="!state" @click="openChangelog" class="update-btn">
        <template #icon><ExternalLink class="button-icon" /></template>
        {{ t('viewChangelog') }}
      </Button>
      <Button v-if="state?.status === 'downloaded'" variant="primary" size="xs" @click="restart" class="update-btn">
        <template #icon><RotateCcw class="button-icon" /></template>
        {{ t('restart') }}
      </Button>
      <Button
        v-else-if="state?.status === 'available'"
        variant="primary"
        size="xs"
        @click="download"
        class="update-btn"
      >
        <template #icon><Download class="button-icon" /></template>
        {{ t('download') }}
      </Button>
      <Button
        v-else
        variant="secondary"
        size="xs"
        :disabled="
          !state || state.status === 'checking' || state.status === 'downloading' || state.status === 'unsupported'
        "
        @click="refresh"
        class="update-btn"
      >
        <template #icon
          ><Download v-if="state?.status === 'downloading'" class="button-icon" /><RefreshCw v-else class="button-icon"
        /></template>
        {{ state?.status === 'checking' ? t('checking') : t('checkForUpdates') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.update-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.update-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.update-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.update-description {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.update-actions {
  display: flex;
  gap: 8px;
  width: 100%;
}

.update-btn {
  flex: 1;
  justify-content: center;
  white-space: nowrap;
}

.button-icon {
  width: 14px;
  height: 14px;
}

.error-details {
  margin-top: 4px;
  font-size: 11px;
}

.error-summary {
  cursor: pointer;
  user-select: none;
  font-weight: 500;
  font-size: 11px;
  color: var(--text-muted);
}

.error-summary:hover {
  color: var(--text-secondary);
}

.error-log {
  margin: 4px 0 0 0;
  padding: 6px 8px;
  font-family: monospace;
  font-size: 10px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 100px;
  overflow-y: auto;
  background-color: var(--bg-tertiary, rgba(0, 0, 0, 0.2));
  border-radius: 4px;
  color: var(--text-muted);
}
</style>
