<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Check, Copy, Download, ExternalLink, RefreshCw, RotateCcw } from '@lucide/vue';
import { capture } from '~/api/capture';
import { useAppUpdates } from './useAppUpdates';
import { useTranslate } from '~/i18n/useTranslate';
import Button from '~/ui/button/Button.vue';

const props = withDefaults(
  defineProps<{
    showIcon?: boolean;
    center?: boolean;
    compact?: boolean;
    showChangelog?: boolean;
    showHint?: boolean;
  }>(),
  {
    showIcon: false,
    center: false,
    showChangelog: true,
    showHint: false,
  },
);

const { t } = useTranslate('Updates');
const { t: tHud } = useTranslate('HUD');
const { t: preferences } = useTranslate('HudPreferences');
const { state, attention, pending, error, perform } = useAppUpdates();
const copiedError = ref(false);
let copiedErrorTimeout: ReturnType<typeof setTimeout> | undefined;

const checkForUpdatesDisabled = computed(
  () =>
    pending.value ||
    !state.value ||
    ['checking', 'downloading', 'downloaded', 'unsupported'].includes(state.value.status),
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
  await perform('check');
};
const download = async () => {
  await perform('download');
};
const restart = async () => {
  await perform('restart');
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

onBeforeUnmount(() => {
  if (copiedErrorTimeout) clearTimeout(copiedErrorTimeout);
});
</script>

<template>
  <div class="update-controls" :class="{ 'update-centered': center, 'update-compact': compact }">
    <div class="update-header" :class="{ 'header-centered': center }">
      <div class="update-heading">
        <RefreshCw
          v-if="showIcon || attention"
          class="update-top-icon"
          :class="{ 'icon-spin': state?.status === 'checking', 'has-update': attention }"
        />
        <span class="update-title">{{ compact ? preferences('version') : t('title') }}</span>
        <span v-if="state?.currentVersion" class="update-version">v{{ state.currentVersion }}</span>
      </div>
      <p v-if="!compact || state?.status !== 'idle'" class="update-description">
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
    <progress
      v-if="state?.status === 'downloading'"
      class="update-progress"
      :value="state.percent ?? undefined"
      max="100"
      :aria-label="t('downloading', { percent: state.percent ?? 0 })"
    />
    <p v-if="showHint && (state?.status === 'available' || state?.status === 'downloaded')" class="update-hint">
      {{ state.status === 'downloaded' ? t('restartHint') : t('downloadHint') }}
    </p>
    <p v-if="error" class="update-action-error" role="alert">{{ error }}</p>
    <div class="update-actions" :class="{ 'single-action': !showChangelog }">
      <Button
        v-if="showChangelog"
        :variant="compact ? 'ghost' : 'secondary'"
        size="sm"
        :block="compact"
        :disabled="!state"
        @click="openChangelog"
        class="update-btn changelog-btn"
        :aria-label="t('viewChangelog')"
      >
        <template #icon><ExternalLink class="button-icon" /></template>
        {{ compact ? t('changelog') : t('viewChangelog') }}
      </Button>
      <div class="update-main-action">
        <Button
          v-if="state?.status === 'downloaded'"
          variant="primary"
          size="sm"
          :block="compact"
          :disabled="pending"
          :loading="pending"
          @click="restart"
          class="update-btn"
        >
          <template #icon><RotateCcw class="button-icon" /></template>
          {{ t('restartToUpdate') }}
        </Button>
        <Button
          v-else-if="state?.status === 'available' || (state?.status === 'error' && state.availableVersion)"
          variant="primary"
          size="sm"
          :block="compact"
          :disabled="pending"
          :loading="pending"
          @click="download"
          class="update-btn"
        >
          <template #icon><Download class="button-icon" /></template>
          {{ state?.status === 'error' ? t('retry') : t('download') }}
        </Button>
        <Button
          v-else
          variant="secondary"
          size="sm"
          :block="compact"
          :disabled="checkForUpdatesDisabled"
          :tooltip="checkForUpdatesTooltip"
          @click="refresh"
          class="update-btn"
        >
          <template #icon
            ><Download v-if="state?.status === 'downloading'" class="button-icon" /><RefreshCw
              v-else
              class="button-icon"
          /></template>
          {{ state?.status === 'checking' ? t('checking') : compact ? t('check') : t('checkForUpdates') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.update-progress {
  width: 100%;
  height: 6px;
  accent-color: var(--color-primary);
}
.update-action-error {
  color: var(--color-error);
  font-size: var(--font-size-body);
}
.update-controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  gap: 8px;
}

.update-header.header-centered {
  align-items: center;
  text-align: center;
  gap: 5px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.update-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.update-centered .update-heading {
  justify-content: center;
}

.update-top-icon {
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
  flex: none;
}
.update-top-icon.has-update {
  color: var(--color-primary);
}

.update-title {
  font-size: var(--font-size-body);
  font-weight: var(--weight-title);
  line-height: 1.5;
  color: var(--text-primary);
  margin: 0;
}

.update-version {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-left: auto;
}

.update-description,
.update-hint {
  margin: 0;
  font-size: var(--font-size-body);
  color: var(--text-secondary);
  line-height: 1.5;
  text-align: left;
}
.update-centered .update-description {
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

.update-main-action {
  display: flex;
  margin-left: auto;
  min-width: 0;
}

.update-btn {
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
.update-compact {
  gap: 12px;
}
.update-compact .update-title {
  font-size: var(--font-size-body);
  font-weight: var(--weight-title);
}
.update-compact .update-description,
.update-compact .update-hint {
  min-height: 0;
  font-size: var(--font-size-sm);
  line-height: 1.5;
}
.update-compact .update-actions.single-action {
  grid-template-columns: minmax(0, 1fr);
}
.update-compact .update-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
}
.update-compact .update-main-action {
  width: 100%;
}
.update-compact .changelog-btn {
  color: var(--text-secondary);
}
</style>
