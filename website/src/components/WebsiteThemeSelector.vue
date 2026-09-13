<script setup lang="ts">
import { computed } from 'vue';
import { Moon, Sun } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { useWebsiteTheme } from '@website/composables/useWebsiteTheme';
import { useI18n } from 'vue-i18n';

const theme = useWebsiteTheme();
const { t } = useI18n();
const isDark = computed(() => theme.resolvedTheme.value === 'dark');
const themeLabel = computed(() => t(`Website.theme.${isDark.value ? 'light' : 'dark'}`));
const toggleLabel = computed(() => t('Website.theme.switchTo', { theme: themeLabel.value }));
const toggleTheme = () => theme.setTheme(isDark.value ? 'light' : 'dark');
</script>

<template>
  <Button
    class="theme-toggle"
    variant="ghost"
    size="md"
    icon-only
    :icon="isDark ? Sun : Moon"
    :tooltip="toggleLabel"
    tooltip-position="bottom"
    :aria-label="toggleLabel"
    @click="toggleTheme"
  />
</template>

<style scoped>
:deep(.theme-toggle) {
  width: 42px;
  height: 42px;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
}

:deep(.theme-toggle:hover) {
  background: var(--color-header-control-hover);
  color: var(--text-primary);
}
</style>
