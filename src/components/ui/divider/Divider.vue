<script setup lang="ts">
withDefaults(
  defineProps<{
    orientation?: 'horizontal' | 'vertical';
    label?: string;
    spacing?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
  }>(),
  {
    orientation: 'horizontal',
    label: '',
    spacing: 'sm',
  },
);
</script>

<template>
  <div
    class="divider"
    :class="[`divider-${orientation}`, `spacing-${spacing}`, { 'has-label': Boolean(label || $slots.default) }]"
    role="separator"
    :aria-orientation="orientation"
  >
    <template v-if="label || $slots.default">
      <span class="divider-line" />
      <span class="divider-label">
        <slot>{{ label }}</slot>
      </span>
      <span class="divider-line" />
    </template>
  </div>
</template>

<style scoped>
.divider {
  flex-shrink: 0;
  box-sizing: border-box;
}

/* Plain dividers without label */
.divider:not(.has-label) {
  background: var(--color-border);
  opacity: 0.5;
}

.divider-horizontal:not(.has-label) {
  width: 100%;
  height: 1px;
}

.divider-vertical:not(.has-label) {
  width: 1px;
  height: 100%;
}

/* Dividers with label: [ Line ] [ Label ] [ Line ] */
.divider.has-label {
  display: flex;
  align-items: center;
  user-select: none;
}

.divider-horizontal.has-label {
  width: 100%;
  flex-direction: row;
  gap: 12px;
}

.divider-vertical.has-label {
  height: 100%;
  flex-direction: column;
  gap: 8px;
}

.divider-line {
  flex: 1;
  background: var(--color-border);
  opacity: 0.5;
}

.divider-horizontal .divider-line {
  height: 1px;
}

.divider-vertical .divider-line {
  width: 1px;
}

.divider-label {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  line-height: 1;
  white-space: nowrap;
}

.divider-horizontal.spacing-none {
  margin: 0;
}
.divider-horizontal.spacing-xs {
  margin: 4px 0;
}
.divider-horizontal.spacing-sm {
  margin: 8px 0;
}
.divider-horizontal.spacing-md {
  margin: 12px 0;
}
.divider-horizontal.spacing-lg {
  margin: 16px 0;
}

.divider-vertical.spacing-none {
  margin: 0;
}
.divider-vertical.spacing-xs {
  margin: 0 4px;
}
.divider-vertical.spacing-sm {
  margin: 0 8px;
}
.divider-vertical.spacing-md {
  margin: 0 12px;
}
.divider-vertical.spacing-lg {
  margin: 0 16px;
}
</style>
