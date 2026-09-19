<script setup lang="ts">
import type { WebsiteModeId, WebsiteModeOption } from '@website/types/website-modes';

defineProps<{
  label: string;
  modes: readonly WebsiteModeOption[];
}>();

const activeMode = defineModel<WebsiteModeId>({ required: true });
</script>

<template>
  <nav class="mode-tabs" :aria-label="label">
    <button
      v-for="mode in modes"
      :key="mode.id"
      type="button"
      :class="{ 'is-active': mode.id === activeMode }"
      :aria-pressed="mode.id === activeMode"
      @click="activeMode = mode.id"
    >
      <component :is="mode.icon" aria-hidden="true" />{{ mode.label }}
    </button>
  </nav>
</template>

<style scoped>
.mode-tabs {
  display: inline-flex;
  box-sizing: border-box;
  max-width: 100%;
  padding: 5px;
  align-items: center;
  border: 1px solid rgb(44 61 77 / 8%);
  border-radius: 999px;
  background: rgb(255 255 255 / 72%);
  box-shadow: 0 10px 30px -24px rgb(43 70 96 / 68%);
  backdrop-filter: blur(16px);
}

.mode-tabs button {
  display: inline-flex;
  min-height: 36px;
  padding: 0 14px;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #716e69;
  cursor: pointer;
  font-size: 13px;
  font-weight: 620;
  transition:
    color 150ms ease,
    background 150ms ease,
    transform 150ms ease;
}

.mode-tabs button:hover {
  color: #201e1a;
  transform: translateY(-1px);
}

.mode-tabs button.is-active {
  background: rgb(var(--mode-accent-rgb, 117 87 232) / 13%);
  box-shadow:
    inset 0 0 0 1px rgb(var(--mode-accent-rgb, 117 87 232) / 7%),
    0 4px 12px rgb(var(--mode-accent-rgb, 117 87 232) / 10%);
  color: var(--mode-accent, #7557e8);
}

.mode-tabs svg {
  width: 15px;
  height: 15px;
}

@media (max-width: 700px) {
  .mode-tabs {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .mode-tabs button {
    min-width: 0;
    padding: 0 4px;
    justify-content: center;
    gap: 4px;
    font-size: 10px;
    white-space: nowrap;
  }

  .mode-tabs svg {
    width: 13px;
    height: 13px;
    flex: 0 0 auto;
  }
}
</style>
