<script setup lang="ts">
import { computed } from 'vue';
import { shortcutKeyLabel } from '~/shortcuts/shortcut-label';

const props = withDefaults(
  defineProps<{
    shortcut?: string;
    keys?: string[];
    size?: 'sm' | 'md';
  }>(),
  {
    size: 'sm',
  },
);

const parsedKeys = computed(() => {
  if (props.keys && props.keys.length > 0) {
    return props.keys.map((key) => shortcutKeyLabel(key));
  }
  if (props.shortcut) {
    return props.shortcut.split('+').map((key) => shortcutKeyLabel(key));
  }
  return [];
});
</script>

<template>
  <div v-if="parsedKeys.length" class="keyboard-chip-group" :class="`chip-${size}`">
    <template v-for="(k, idx) in parsedKeys" :key="idx">
      <kbd class="keyboard-chip">
        {{ k }}
      </kbd>
      <span v-if="idx < parsedKeys.length - 1" class="chip-plus">+</span>
    </template>
  </div>
</template>

<style scoped>
.keyboard-chip-group {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.keyboard-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-sans);
  font-weight: 600;
  color: var(--text-primary);
  background: var(--color-bg-element);
  border: 1px solid var(--color-border-strong);
  box-shadow:
    0 1px 1px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-sm);
  line-height: 1;
  user-select: none;
}

.chip-plus {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  user-select: none;
  margin: 0 1px;
}

.chip-sm .keyboard-chip {
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  font-size: 10px;
}

.chip-md .keyboard-chip {
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  font-size: 12px;
}
</style>
