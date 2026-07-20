<script setup lang="ts">
withDefaults(
  defineProps<{
    orientation?: 'horizontal' | 'vertical'
    label?: string
  }>(),
  {
    orientation: 'horizontal',
    label: '',
  },
)
</script>

<template>
  <div
    class="divider"
    :class="`divider-${orientation}`"
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
}

.divider-horizontal {
  width: 100%;
  height: 1px;
  margin: 4px 0;
}

.divider-vertical {
  width: 1px;
  height: 100%;
  margin: 0 4px;
}

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
