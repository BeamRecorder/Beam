<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'outline';
  }>(),
  {
    variant: 'primary',
  },
);
</script>

<template>
  <span class="badge" :class="`badge-${variant}`">
    <slot />
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  border-radius: var(--radius-full);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.badge-primary {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  border: 1px solid var(--color-primary-border);
}

.badge-secondary {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.badge-success {
  background-color: var(--color-success-light);
  color: var(--color-success);
}

.badge-error {
  background-color: var(--color-error-light);
  color: var(--color-error);
}

.badge-info {
  background-color: var(--color-info-light);
  color: var(--color-info);
}

.badge-outline {
  background-color: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--color-border);
}
</style>
