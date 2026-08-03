<script setup lang="ts">
withDefaults(
  defineProps<{
    orientation?: 'horizontal' | 'vertical'
    label?: string
    spacing?: 'none' | 'sm' | 'md' | 'lg'
  }>(),
  {
    orientation: 'horizontal',
    label: '',
    spacing: 'md',
  },
)
</script>

<template>
  <div
    class="divider"
    :class="[`divider-${orientation}`, `spacing-${spacing}`]"
    role="separator"
    :aria-orientation="orientation"
  >
    <span v-if="label" class="divider-label">{{ label }}</span>
  </div>
</template>

<style scoped>
.divider {
  flex-shrink: 0;
  background: var(--color-border);
  opacity: 0.6;
}

.divider-horizontal {
  width: 100%;
  height: 1px;
}

.divider-horizontal.spacing-none { margin: 0; }
.divider-horizontal.spacing-sm { margin: 8px 0; }
.divider-horizontal.spacing-md { margin: 16px 0; }
.divider-horizontal.spacing-lg { margin: 24px 0; }

.divider-vertical {
  width: 1px;
  height: 100%;
}

.divider-vertical.spacing-none { margin: 0; }
.divider-vertical.spacing-sm { margin: 0 8px; }
.divider-vertical.spacing-md { margin: 0 16px; }
.divider-vertical.spacing-lg { margin: 0 24px; }

.divider-label {
  position: relative;
  top: -0.7em;
  display: block;
  width: max-content;
  padding: 0 8px;
  margin: 0 auto;
  color: var(--text-muted);
  background: var(--color-bg-element);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
</style>
