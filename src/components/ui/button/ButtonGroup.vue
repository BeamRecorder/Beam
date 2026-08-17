<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    full?: boolean;
    columns?: 1 | 2 | 3;
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
  background: var(--color-bg-surface-hover) !important;
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

.btn-group :deep(.btn-container) {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.btn-group :deep(.btn) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  min-width: 0;
  overflow: hidden;
  border-radius: var(--button-group-inner-radius) !important;
}

.btn-group.size-xs :deep(.btn.btn-icon-only) {
  width: 22px !important;
  height: 22px !important;
  min-width: 22px !important;
  border-radius: var(--button-group-inner-radius) !important;
}

.btn-group.size-xs :deep(.btn-icon) {
  width: 13px !important;
  height: 13px !important;
}

.btn-group :deep(.divider-vertical) {
  height: 12px !important;
  min-height: 12px !important;
  width: 1px !important;
  background-color: var(--color-border-strong) !important;
  opacity: 1 !important;
  margin: 0 1px !important;
  align-self: center !important;
  flex-shrink: 0 !important;
}

:root.dark .btn-group :deep(.divider-vertical) {
  background-color: rgba(255, 255, 255, 0.22) !important;
}

.btn-group :deep(.btn-content) {
  display: block;
  position: relative;
  flex: 0 1 auto;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  justify-content: center;
}

.btn-group :deep(.btn-content-label) {
  display: inline-block;
  min-width: 100%;
  max-width: none;
  text-align: center;
  vertical-align: top;
  will-change: auto;
}

@media (prefers-reduced-motion: no-preference) {
  .btn-group :deep(.btn:hover:not(:disabled) .btn-content.is-overflowing .btn-content-label),
  .btn-group :deep(.btn:focus-visible .btn-content.is-overflowing .btn-content-label) {
    animation: button-group-label-marquee var(--button-marquee-duration) 0.35s ease-in-out infinite alternate;
    will-change: transform;
  }
}

@keyframes button-group-label-marquee {
  0%,
  12% {
    transform: translateX(0);
  }
  88%,
  100% {
    transform: translateX(calc(-1 * var(--button-marquee-distance)));
  }
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

:root.dark .btn-group.is-divided > :deep(.btn-container:not(:last-child))::after {
  background-color: rgba(255, 255, 255, 0.22);
}

:root.dark .btn-group {
  background: #181818 !important;
}
</style>
