<script setup lang="ts">
import { computed } from 'vue';
import type { ButtonGroupSelection } from './button-group-types';

const props = withDefaults(
  defineProps<{
    full?: boolean;
    columns?: 1 | 2 | 3 | 4;
    divided?: boolean;
    size?: 'xs' | 'sm' | 'md';
    selection?: ButtonGroupSelection;
  }>(),
  {
    full: false,
    columns: undefined,
    divided: false,
    size: 'md',
  },
);
const hasIndicator = computed(() => {
  const selection = props.selection;
  return (
    selection !== undefined &&
    Number.isInteger(selection.count) &&
    selection.count > 0 &&
    Number.isInteger(selection.index) &&
    selection.index >= 0 &&
    selection.index < selection.count
  );
});
</script>

<template>
  <div
    class="btn-group"
    :class="[
      `size-${props.size}`,
      {
        'full-width': props.full,
        'column-layout': props.columns,
        'is-divided': props.divided,
        'has-indicator': hasIndicator,
      },
    ]"
    :style="{
      '--button-group-inner-radius': 'calc(var(--radius-lg) - 3px)',
      ...(props.columns ? { '--button-group-columns': props.columns } : {}),
      ...(hasIndicator
        ? { '--button-group-count': props.selection!.count, '--button-group-index': props.selection!.index }
        : {}),
    }"
  >
    <div v-if="hasIndicator" class="selection-track" aria-hidden="true">
      <span class="selection-indicator" />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.btn-group {
  --button-group-padding-x: 4px;
  --button-group-padding-y: 3px;
  --button-group-gap: 2px;
  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  gap: var(--button-group-gap);
  background: var(--color-bg-surface-hover);
  border-radius: var(--radius-lg);
  padding: var(--button-group-padding-y) var(--button-group-padding-x);
  border: 1px solid var(--color-border);
  width: fit-content;
  max-width: 100%;
  box-sizing: border-box;
}

.btn-group.size-xs {
  --button-group-padding-x: 2px;
  --button-group-padding-y: 2px;
  border-radius: var(--radius-lg);
  gap: 2px;
}

.btn-group.full-width {
  width: 100%;
}

.btn-group.column-layout {
  --button-group-gap: 4px;
  display: grid;
  grid-template-columns: repeat(var(--button-group-columns), minmax(0, 1fr));
  gap: var(--button-group-gap);
}

.btn-group.has-indicator {
  background: var(--color-bg-well);
}
.selection-track {
  position: absolute;
  inset: var(--button-group-padding-y) var(--button-group-padding-x);
  pointer-events: none;
  z-index: -1;
}
.selection-indicator {
  display: block;
  width: calc((100% - (var(--button-group-count) - 1) * var(--button-group-gap)) / var(--button-group-count));
  height: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--button-group-inner-radius);
  background: var(--color-bg-element);
  box-shadow: var(--shadow-sm);
  transform: translateX(calc(var(--button-group-index) * (100% + var(--button-group-gap))));
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
@media (prefers-reduced-motion: reduce) {
  .selection-indicator {
    transition: none;
  }
}

/* Tooltip-backed buttons add one component boundary, so this shared item
   wrapper must be reached through the child component as well. */
.btn-group :deep(.btn-container) {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.btn-group :slotted(.divider-vertical) {
  height: 12px;
  min-height: 12px;
  width: 1px;
  background-color: var(--color-border-strong);
  opacity: 1;
  margin: 0 1px;
  align-self: center;
  flex-shrink: 0;
}

.btn-group.is-divided > :deep(.btn-container:not(:last-child)) {
  margin-right: 0;
}

.btn-group.is-divided > :deep(.btn-container:not(:last-child))::after {
  content: '';
  display: inline-block;
  width: 1px;
  height: 14px;
  background-color: var(--color-border-strong);
  margin-left: 3px;
  margin-right: 1px;
  flex-shrink: 0;
}
</style>
