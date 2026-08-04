<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { capture } from '~/api/capture'
import type { AppUpdateState } from '~/api/types/capture-api'
import { useTranslate } from '~/i18n/useTranslate'

const { t } = useTranslate('Updates')
const state = ref<AppUpdateState | null>(null)
const visible = computed(() => ['available', 'downloading', 'downloaded'].includes(state.value?.status ?? ''))
const label = computed(() => state.value?.availableVersion
  ? t('updateAvailable', { version: state.value.availableVersion })
  : t('updateAvailableGeneric'))
let stopListening: (() => void) | undefined

onMounted(async () => {
  stopListening = capture.onUpdateState((nextState) => { state.value = nextState })
  state.value = await capture.getUpdateState()
})
onBeforeUnmount(() => stopListening?.())
</script>

<template><span v-if="visible" class="update-badge" :title="label" aria-hidden="true" /></template>

<style scoped>
.update-badge { position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; border: 2px solid var(--color-bg-element); border-radius: 50%; background: var(--color-error); pointer-events: none; }
</style>
