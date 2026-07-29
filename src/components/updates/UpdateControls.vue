<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Download, RefreshCw, RotateCcw } from '@lucide/vue'
import { capture } from '~/api/capture'
import type { AppUpdateState } from '~/api/types/capture-api'
import { useTranslate } from '~/i18n/useTranslate'
import Button from '~/ui/button/Button.vue'

const { t } = useTranslate('Updates')
const state = ref<AppUpdateState | null>(null)
let stopListening: (() => void) | undefined

const refresh = async () => { state.value = await capture.checkForUpdates() }
const restart = async () => { await capture.quitAndInstallUpdate() }

onMounted(async () => {
  stopListening = capture.onUpdateState((nextState) => { state.value = nextState })
  state.value = await capture.getUpdateState()
})
onBeforeUnmount(() => stopListening?.())
</script>

<template>
  <div class="update-controls">
    <div>
      <p class="update-title">{{ t('title') }}</p>
      <p class="update-description">
        <template v-if="state?.status === 'downloaded'">{{ t('readyToRestart', { version: state.availableVersion }) }}</template>
        <template v-else-if="state?.status === 'downloading'">{{ t('downloading', { percent: state.percent ?? 0 }) }}</template>
        <template v-else-if="state?.status === 'checking'">{{ t('checking') }}</template>
        <template v-else-if="state?.status === 'not-available'">{{ t('upToDate', { version: state.currentVersion }) }}</template>
        <template v-else-if="state?.status === 'error'">{{ state.message }}</template>
        <template v-else-if="state?.status === 'unsupported'">{{ t('availableInInstalledApp') }}</template>
        <template v-else>{{ t('currentVersion', { version: state?.currentVersion ?? '…' }) }}</template>
      </p>
    </div>
    <Button v-if="state?.status === 'downloaded'" variant="primary" size="sm" @click="restart">
      <template #icon><RotateCcw class="button-icon" /></template>
      {{ t('restart') }}
    </Button>
    <Button v-else variant="secondary" size="sm" :disabled="!state || state.status === 'checking' || state.status === 'downloading' || state.status === 'unsupported'" @click="refresh">
      <template #icon><Download v-if="state?.status === 'downloading'" class="button-icon" /><RefreshCw v-else class="button-icon" /></template>
      {{ state?.status === 'checking' ? t('checking') : t('checkForUpdates') }}
    </Button>
  </div>
</template>

<style scoped>
.update-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.update-title, .update-description { margin: 0; }
.update-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.update-description { margin-top: 2px; font-size: 11px; color: var(--text-muted); }
.button-icon { width: 16px; height: 16px; }
</style>
