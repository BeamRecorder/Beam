<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import Teleprompter from './Teleprompter.vue'
import { capture } from '~/api/capture'

let unsubscribeSession: (() => void) | null = null
let unsubscribeShortcut: (() => void) | null = null
onMounted(() => {
  unsubscribeSession = capture.onTeleprompterSession((context) =>
    window.dispatchEvent(new CustomEvent('teleprompter-session', { detail: context })),
  )
  unsubscribeShortcut = capture.onTeleprompterShortcut((id) =>
    window.dispatchEvent(new CustomEvent('teleprompter-shortcut', { detail: id })),
  )
  capture.notifyTeleprompterReady?.()
})
onBeforeUnmount(() => {
  unsubscribeSession?.()
  unsubscribeShortcut?.()
})
</script>

<template><Teleprompter /></template>
