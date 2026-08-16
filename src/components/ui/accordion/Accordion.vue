<script setup lang="ts">
import { ChevronDown } from '@lucide/vue';
import { useMotion, type Variant } from '@vueuse/motion';
import { nextTick, ref, useId, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    title?: string;
    disabled?: boolean;
    bordered?: boolean;
  }>(),
  {
    title: '',
    disabled: false,
    modelValue: false,
    bordered: true,
  },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
}>();

const contentId = `accordion-content-${useId()}`;
const displayContent = ref(props.modelValue);
const contentRef = ref<HTMLElement | null>(null);
const motion = useMotion(contentRef, {}, { lifeCycleHooks: false, syncVariants: false });
let transition = 0;

const hidden = { opacity: 0, y: -6 } satisfies Variant;
const visible = {
  opacity: 1,
  y: 0,
  transition: { type: 'tween', duration: 160, ease: [0.22, 1, 0.36, 1] },
} satisfies Variant;

watch(
  () => props.modelValue,
  async (open) => {
    const request = ++transition;
    if (open) {
      displayContent.value = true;
      await nextTick();
      if (request !== transition || !contentRef.value) return;
      motion.set(hidden);
      await motion.apply(visible);
      return;
    }
    if (!displayContent.value || !contentRef.value) return;
    await motion.apply({ ...hidden, transition: { type: 'tween', duration: 110 } });
    if (request === transition) displayContent.value = false;
  },
);
</script>

<template>
  <section class="accordion" :class="{ 'is-open': modelValue, 'is-disabled': disabled, 'is-borderless': !bordered }">
    <button
      type="button"
      class="accordion-trigger"
      :aria-expanded="modelValue"
      :aria-controls="contentId"
      :disabled="disabled"
      @click="emit('update:modelValue', !modelValue)"
    >
      <span class="accordion-title"
        ><slot name="title">{{ title }}</slot></span
      >
      <ChevronDown class="accordion-chevron" aria-hidden="true" />
    </button>
    <div v-show="displayContent" :id="contentId" ref="contentRef" class="accordion-content">
      <slot />
    </div>
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

.accordion-trigger:hover:not(:disabled) {
  background: var(--color-bg-surface-hover);
  color: var(--text-primary);
}

.accordion-trigger:focus-visible {
  outline: 2px solid var(--color-primary);
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
</style>
