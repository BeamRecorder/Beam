<script setup lang="ts">
import { ChevronDown } from '@lucide/vue';
import { useId } from 'vue';
import RafRevealTransition from '../transitions/RafRevealTransition.vue';

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    title?: string;
    disabled?: boolean;
    bordered?: boolean;
    appearance?: 'default' | 'inspector';
  }>(),
  {
    title: '',
    disabled: false,
    modelValue: false,
    bordered: true,
    appearance: 'default',
  },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
}>();

const contentId = `accordion-content-${useId()}`;
</script>

<template>
  <section
    class="accordion"
    :class="{
      'is-open': modelValue,
      'is-disabled': disabled,
      'is-borderless': !bordered,
      'accordion-inspector': appearance === 'inspector',
    }"
  >
    <div class="accordion-heading">
      <button
        type="button"
        class="accordion-trigger"
        :aria-expanded="modelValue"
        :aria-controls="contentId"
        :disabled="disabled"
        @click="!disabled && emit('update:modelValue', !modelValue)"
      >
        <span class="accordion-title"
          ><slot name="title">{{ title }}</slot></span
        >
        <ChevronDown class="accordion-chevron" aria-hidden="true" />
      </button>
      <div v-if="$slots.actions" class="accordion-actions"><slot name="actions" /></div>
    </div>
    <RafRevealTransition>
      <div v-show="modelValue" :id="contentId" class="accordion-content" :inert="!modelValue || undefined">
        <slot />
      </div>
    </RafRevealTransition>
  </section>
</template>

<style scoped>
.accordion {
  display: grid;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-element);
  overflow: hidden;
}

.accordion.is-borderless {
  border: 0;
  background: transparent;
}

.accordion-trigger {
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.accordion-heading {
  display: flex;
  align-items: center;
  min-width: 0;
}
.accordion-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding-right: 8px;
}

.accordion-trigger:hover:not(:disabled) {
  background: var(--color-bg-surface-hover);
  color: var(--text-primary);
}

.accordion-trigger:focus-visible {
  outline: 2px solid var(--text-secondary);
  outline-offset: 2px;
}

.accordion-trigger:disabled {
  cursor: not-allowed;
}

.accordion-title {
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
}

.accordion-chevron {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  transition: transform 160ms ease;
}

.is-open .accordion-chevron {
  transform: rotate(180deg);
}

.is-disabled {
  opacity: 0.6;
}

.accordion-content {
  padding: 10px;
}

.accordion-inspector {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 65%, transparent);
  border-radius: 0;
  background: transparent;
  overflow: visible;
}
.accordion-inspector .accordion-trigger {
  min-height: 44px;
  padding: 12px 0;
  border-radius: var(--radius-sm);
}
.accordion-inspector .accordion-trigger:hover:not(:disabled) {
  background: transparent;
}
.accordion-inspector .accordion-chevron {
  width: 13px;
  height: 13px;
  color: var(--text-muted);
}
.accordion-inspector .accordion-trigger:hover:not(:disabled) .accordion-chevron {
  color: var(--text-secondary);
}
.accordion-inspector .accordion-title {
  color: var(--text-primary);
  font-weight: var(--weight-title);
}
.accordion-inspector .accordion-content {
  padding: 4px 0 14px;
}
.accordion-inspector .accordion-actions {
  padding-right: 0;
  padding-left: 6px;
}
@media (prefers-reduced-motion: reduce) {
  .accordion-chevron {
    transition: none;
  }
}
</style>
