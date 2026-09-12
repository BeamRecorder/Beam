<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    full?: boolean;
    columns?: 1 | 2 | 3 | 4;
    divided?: boolean;
    size?: 'xs' | 'sm' | 'md';
  }>(),
  {
    full: false,
    columns: undefined,
    divided: false,
    size: 'md',
  },
);
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
      },
    ]"
    :style="{
      '--button-group-inner-radius': 'calc(var(--radius-lg) - 3px)',
      ...(props.columns ? { '--button-group-columns': props.columns } : {}),
    }"
  >
    <slot />
  </div>
</template>

<style scoped>
.btn-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--color-bg-surface-hover);
  border-radius: var(--radius-lg);
  padding: 3px 4px;
  border: 1px solid var(--color-border);
  width: fit-content;
  max-width: 100%;
  box-sizing: border-box;
}

.btn-group.size-xs {
  padding: 2px;
  border-radius: var(--radius-lg);
  gap: 2px;
}

.btn-group.full-width {
  width: 100%;
}

.btn-group.column-layout {
  display: grid;
  grid-template-columns: repeat(var(--button-group-columns), minmax(0, 1fr));
  gap: 4px;
}

.btn-group :slotted(.btn-container) {
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

.btn-group.is-divided > :slotted(.btn-container:not(:last-child)) {
  margin-right: 0;
}

.btn-group.is-divided > :slotted(.btn-container:not(:last-child))::after {
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
