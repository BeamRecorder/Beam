<script setup lang="ts">
import { computed } from 'vue';
import { Moon, Sun } from '@lucide/vue';
import { useWebsiteTheme } from '../../../src/composables/useWebsiteTheme';
import common from '../../../src/i18n/en/docs/common.json';

const theme = useWebsiteTheme();
const isDark = computed(() => theme.resolvedTheme.value === 'dark');
const label = computed(() => (isDark.value ? common.theme.switchToLight : common.theme.switchToDark));

const toggleTheme = () => theme.setTheme(isDark.value ? 'light' : 'dark');
</script>

<template>
  <button class="docs-theme-toggle" type="button" :aria-label="label" :title="label" @click="toggleTheme">
    <Sun v-if="isDark" aria-hidden="true" />
    <Moon v-else aria-hidden="true" />
  </button>
</template>

<style scoped>
.docs-theme-toggle {
  display: grid;
  width: 40px;
  height: 40px;
  padding: 0;
  place-items: center;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-header-control);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color 160ms ease,
    background 160ms ease,
    transform 160ms ease;
}

.docs-theme-toggle:hover {
  background: var(--color-header-control-hover);
  color: var(--text-primary);
}

.docs-theme-toggle:active {
  transform: translateY(1px);
}

.docs-theme-toggle svg {
  width: 18px;
  height: 18px;
}
</style>
