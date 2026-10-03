<script setup lang="ts">
import { computed } from 'vue';
import { Monitor, Moon, Sun } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { ThemeMode } from '~/types/appearance';
import ThemeChoicePreview from './ThemeChoicePreview.vue';

const mode = defineModel<ThemeMode>({ required: true });
const { t } = useTranslate('AppearanceSettings');
const choices = computed(() => [
  { value: 'light' as const, label: t('light'), icon: Sun },
  { value: 'dark' as const, label: t('dark'), icon: Moon },
  { value: 'system' as const, label: t('system'), icon: Monitor },
]);
const index = computed(() => choices.value.findIndex((choice) => choice.value === mode.value));
const navigate = (event: KeyboardEvent) => {
  if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index.value + delta + 3) % 3;
  mode.value = choices.value[next]!.value;
  (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
};
</script>

<template>
  <div class="theme-picker">
    <ButtonGroup
      full
      :columns="3"
      size="sm"
      variant="neutral"
      class="theme-mode-group"
      role="radiogroup"
      :aria-label="t('themeMode')"
      :selection="{ index, count: 3 }"
      @keydown="navigate"
    >
      <Button
        v-for="choice in choices"
        :key="choice.value"
        variant="tab"
        size="sm"
        content-layout="custom"
        class="theme-mode-choice"
        :class="{ active: mode === choice.value }"
        role="radio"
        :aria-checked="mode === choice.value"
        :aria-label="choice.label"
        :tabindex="mode === choice.value ? 0 : -1"
        @click="mode = choice.value"
      >
        <span class="theme-choice">
          <ThemeChoicePreview :mode="choice.value" />
          <span class="choice-label"
            ><component :is="choice.icon" :size="14" aria-hidden="true" /><span>{{ choice.label }}</span></span
          >
        </span>
      </Button>
    </ButtonGroup>
    <p class="system-hint">{{ t('systemDescription') }}</p>
  </div>
</template>

<style scoped>
.theme-picker {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.theme-mode-group {
  height: auto;
  max-width: 36rem;
}
.theme-mode-choice {
  position: relative;
  height: auto;
  padding: 6px;
  width: 100%;
  color: var(--text-primary);
}
.theme-choice {
  display: grid;
  gap: 8px;
  width: 100%;
  min-width: 0;
}
.choice-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  font-size: var(--font-size-sm);
  line-height: 1.5;
}
.choice-label span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.system-hint {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: 1.5;
  color: var(--text-secondary);
  max-width: 36rem;
}
</style>
