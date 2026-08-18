<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Check, Copy, Download, ExternalLink, RefreshCw, RotateCcw } from '@lucide/vue';
import { capture } from '~/api/capture';
import type { AppUpdateState } from '~/api/types/capture-api';
import { useTranslate } from '~/i18n/useTranslate';
import Button from '~/ui/button/Button.vue';

const props = withDefaults(
  defineProps<{
    showIcon?: boolean;
    center?: boolean;
  }>(),
  {
    showIcon: false,
    center: false,
  },
);

const { t } = useTranslate('Updates');
const { t: tHud } = useTranslate('HUD');
const state = ref<AppUpdateState | null>(null);
const copiedError = ref(false);
let copiedErrorTimeout: ReturnType<typeof setTimeout> | undefined;
let stopListening: (() => void) | undefined;

const checkForUpdatesDisabled = computed(
  () => !state.value || ['checking', 'downloading', 'unsupported'].includes(state.value.status),
);

const checkForUpdatesTooltip = computed(() => {
  if (!state.value) return undefined;
  if (state.value.status === 'unsupported') {
    return t('availableInInstalledApp');
  }
  if (state.value.status === 'checking') {
    return t('checking');
  }
  if (state.value.status === 'downloading') {
    return t('downloading', { percent: state.value.percent ?? 0 });
  }
  return undefined;
});

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
  <div class="update-controls" :class="{ 'update-centered': center }">
    <div class="update-header" :class="{ 'header-centered': center }">
      <div v-if="showIcon" class="update-icon-wrap">
        <RefreshCw class="update-top-icon" :class="{ 'icon-spin': state?.status === 'checking' }" />
      </div>
      <span class="update-title">
        {{ t('title') }}
        <span v-if="state?.currentVersion" class="update-version">v{{ state.currentVersion }}</span>
      </span>
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
        :disabled="checkForUpdatesDisabled"
        :tooltip="checkForUpdatesTooltip"
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

.update-controls.update-centered {
  align-items: center;
  text-align: center;
  justify-content: space-between;
  height: 100%;
}

.update-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.update-header.header-centered {
  align-items: center;
  text-align: center;
  gap: 5px;
  min-height: 82px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.update-icon-wrap {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-element) 90%, transparent);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
  flex-shrink: 0;
}

.update-top-icon {
  width: 14px;
  height: 14px;
  color: var(--color-primary);
}

.update-title {
  font-size: 13px;
  font-weight: 700;
  line-height: 16px;
  color: var(--text-primary);
  margin: 0;
}

.update-version {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--color-bg-surface-hover);
  border: 1px solid var(--color-border);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  margin-left: 6px;
  letter-spacing: 0.2px;
  vertical-align: middle;
  display: inline-block;
  line-height: 14px;
}

.update-description {
  margin: 3px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 14px;
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.update-actions {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
}

.update-btn {
  flex: 1 1 120px;
  min-width: 0;
  justify-content: center;
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
