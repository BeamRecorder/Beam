<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { capture } from '../../../api/capture'

const seconds = ref<number | null>(null)
let unsubscribe: (() => void) | null = null
onMounted(() => {
  unsubscribe = capture.onCountdown((value) => {
    seconds.value = value
  })
})
onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <main class="countdown" aria-live="assertive">{{ seconds ?? '' }}</main>
</template>

<style scoped>
.countdown {
  width: calc(100vw - 32px);
  height: calc(100vh - 32px);
  margin: 16px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-bg-surface);
  color: var(--text-primary);
  font-size: 88px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  box-shadow: var(--shadow-lg);
}
</style>
