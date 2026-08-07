<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Check, Copy, Download, ExternalLink, RefreshCw, RotateCcw } from '@lucide/vue';
import { capture } from '~/api/capture';
import type { AppUpdateState } from '~/api/types/capture-api';
import { useTranslate } from '~/i18n/useTranslate';
import Button from '~/ui/button/Button.vue';

const { t } = useTranslate('Updates');
const { t: tHud } = useTranslate('HUD');
const state = ref<AppUpdateState | null>(null);
const copiedError = ref(false);
let copiedErrorTimeout: ReturnType<typeof setTimeout> | undefined;
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
const copyError = async () => {
  const message = state.value?.message;
  if (!message) return;
  try {
    await navigator.clipboard.writeText(message);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = message;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    try {
      textarea.select();
      if (!document.execCommand('copy')) throw new Error('Unable to copy the update error.');
    } finally {
      textarea.remove();
    }
  }
  copiedError.value = true;
  if (copiedErrorTimeout) clearTimeout(copiedErrorTimeout);
  copiedErrorTimeout = setTimeout(() => {
    copiedError.value = false;
  }, 2000);
};

onMounted(async () => {
  stopListening = capture.onUpdateState((nextState) => {
    state.value = nextState;
  });
  state.value = await capture.getUpdateState();
});
onBeforeUnmount(() => {
  stopListening?.();
  if (copiedErrorTimeout) clearTimeout(copiedErrorTimeout);
});
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

      <Button
        v-if="state?.status === 'error' && state.message"
        variant="ghost"
        size="xs"
        class="error-copy"
        :icon="copiedError ? Check : Copy"
        @click="copyError"
      >
        {{ copiedError ? tHud('copied') : tHud('copyError') }}
      </Button>
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

.error-copy {
  align-self: flex-start;
  margin-top: 2px;
}
</style>
