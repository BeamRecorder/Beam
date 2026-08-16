<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useVirtualList } from '@vueuse/core';
import Popover from '../popover/Popover.vue';
import Skeleton from '../skeleton/Skeleton.vue';
import { ChevronDown, Check, Eye } from '@lucide/vue';

interface Option {
  value: string | number;
  label: string;
  thumbnail?: string;
  appIcon?: string | null;
  color?: string;
  loading?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null;
    options?: Option[];
    items?: Option[];
    placeholder?: string;
    disabled?: boolean;
    direction?: 'up' | 'down';
    previewOnHover?: boolean;
    loading?: boolean;
    emptyLabel?: string;
    variant?: 'default' | 'source';
    size?: 'sm' | 'md' | 'lg' | 'small' | 'medium' | 'large';
  }>(),
  {
    placeholder: 'Select an option',
    disabled: false,
    direction: 'down',
    previewOnHover: false,
    loading: false,
    emptyLabel: '',
    variant: 'default',
    size: 'lg',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void;
  (e: 'toggle', isOpen: boolean): void;
}>();

const actualValue = ref(props.modelValue);
const hoveredValue = ref<string | number | null>(null);

// Sync actualValue with modelValue when modelValue updates externally (not during preview)
watch(
  () => props.modelValue,
  (newVal) => {
    if (hoveredValue.value === null) {
      actualValue.value = newVal;
    }
  },
);

const normalizedOptions = computed<Option[]>(() => {
  return props.options ?? props.items ?? [];
});

const selectedOption = computed(() => {
  return normalizedOptions.value.find((opt) => opt.value === props.modelValue) || null;
});

const handleToggle = (isOpen: boolean) => {
  emit('toggle', isOpen);
  if (isOpen) {
    actualValue.value = props.modelValue;
  } else {
    // If popover is closed and we are still previewing, reset
    if (props.previewOnHover && props.modelValue !== actualValue.value) {
      emit('update:modelValue', actualValue.value);
    }
    hoveredValue.value = null;
  }
};

const handleSelect = (option: Option, close: () => void) => {
  if (props.disabled) return;
  actualValue.value = option.value;
  emit('update:modelValue', option.value);
  close();
};

const handleMouseEnterOption = (option: Option, event: PointerEvent) => {
  hoveredValue.value = option.value;
  if (props.previewOnHover && props.modelValue !== option.value) {
    emit('update:modelValue', option.value);
  }
  startMarquee(event);
};

const handleMouseLeaveOption = (event: PointerEvent) => {
  stopMarquee(event);
};

const handleMouseLeaveList = () => {
  hoveredValue.value = null;
  if (props.previewOnHover && props.modelValue !== actualValue.value) {
    emit('update:modelValue', actualValue.value);
  }
};

const itemHeight = computed(() => {
  if (normalizedOptions.value.some((opt) => opt.thumbnail || opt.loading)) {
    return 52;
  }
  return 38;
});

const { list, containerProps, wrapperProps } = useVirtualList(normalizedOptions, {
  itemHeight: () => itemHeight.value,
});

const normalizedSize = computed(() => {
  if (props.size === 'small') return 'sm';
  if (props.size === 'medium') return 'md';
  if (props.size === 'large') return 'lg';
  return props.size ?? 'lg';
});

const labelStyle = computed(() => {
  const text = selectedOption.value ? selectedOption.value.label : props.placeholder;
  const len = text.length;
  if (normalizedSize.value === 'sm') {
    if (len > 28) return { fontSize: '0.7rem' };
    if (len > 20) return { fontSize: '0.75rem' };
  } else if (normalizedSize.value === 'md') {
    if (len > 28) return { fontSize: '0.75rem' };
    if (len > 20) return { fontSize: '0.82rem' };
  } else {
    if (len > 28) return { fontSize: '0.75rem' };
    if (len > 20) return { fontSize: '0.85rem' };
  }
  return {};
});

const marqueeRuns = new WeakMap<HTMLElement, { frame: number; timer: number }>();

const stopMarqueeRun = (option: HTMLElement) => {
  const run = marqueeRuns.get(option);
  if (run) {
    window.cancelAnimationFrame(run.frame);
    window.clearTimeout(run.timer);
    marqueeRuns.delete(option);
  }
  option.classList.remove('has-left-overflow', 'has-right-overflow');
  const label = option.querySelector<HTMLElement>('.option-label');
  if (label) label.style.transform = '';
};

const startMarquee = (event: PointerEvent) => {
  const option = event.currentTarget as HTMLElement;
  const label = option.querySelector<HTMLElement>('.option-label');
  if (!label) return;
  const distance = label.scrollWidth - label.clientWidth;
  if (distance <= 0) {
    option.classList.remove('has-overflow');
    return;
  }
  stopMarqueeRun(option);
  option.classList.add('has-overflow', 'has-right-overflow');
  const timer = window.setTimeout(() => {
    const startedAt = performance.now();
    // Keep long labels readable: duration grows with distance instead of
    // making their marquee move faster.
    const travelMs = Math.max(3000, (distance / 36) * 1000);
    const tick = (now: number) => {
      const phase = ((now - startedAt) % (travelMs * 2)) / travelMs;
      const progress = phase <= 1 ? phase : 2 - phase;
      label.style.transform = `translateX(${-distance * progress}px)`;
      option.classList.toggle('has-left-overflow', progress > 0.015);
      option.classList.toggle('has-right-overflow', progress < 0.985);
      const run = marqueeRuns.get(option);
      if (run) run.frame = window.requestAnimationFrame(tick);
    };
    marqueeRuns.set(option, { frame: window.requestAnimationFrame(tick), timer: 0 });
  }, 300);
  marqueeRuns.set(option, { frame: 0, timer });
};

const stopMarquee = (event: PointerEvent) => {
  const option = event.currentTarget as HTMLElement;
  stopMarqueeRun(option);
};
</script>

<template>
  <Popover align="left" :direction="direction" :block="true" class="select-popover" @toggle="handleToggle">
    <template #trigger="{ isOpen }">
      <button
        type="button"
        class="select-trigger"
        :class="[
          `select-${normalizedSize}`,
          { 'is-open': isOpen, 'is-disabled': disabled, 'is-source': variant === 'source' },
        ]"
        :disabled="disabled"
      >
        <div class="trigger-content-wrapper">
          <!-- Thumbnail preview -->
          <div v-if="selectedOption?.thumbnail" class="selected-thumbnail-wrapper">
            <img :src="selectedOption.thumbnail" class="trigger-thumbnail-img" draggable="false" />
            <img v-if="selectedOption.appIcon" :src="selectedOption.appIcon" class="trigger-app-icon" draggable="false" />
          </div>

          <!-- Color preview -->
          <div
            v-else-if="selectedOption?.color"
            class="selected-color-badge"
            :style="{ backgroundColor: selectedOption.color }"
          ></div>

          <!-- Skeleton preview -->
          <div v-else-if="loading || selectedOption?.loading" class="selected-thumbnail-wrapper">
            <Skeleton variant="linear" width="100%" height="100%" />
          </div>

          <span class="select-label" :class="{ 'is-placeholder': !selectedOption }" :style="labelStyle">
            {{ selectedOption ? selectedOption.label : placeholder }}
          </span>
        </div>
        <ChevronDown class="select-chevron" :class="{ rotate: isOpen }" />
      </button>
    </template>

    <template #default="{ close }">
      <div v-if="normalizedOptions.length === 0" class="options-empty">{{ emptyLabel || placeholder }}</div>
      <div
        v-else
        v-bind="containerProps"
        class="virtual-scroll-container"
        :class="{ 'is-source': variant === 'source' }"
        @pointerleave="handleMouseLeaveList"
      >
        <ul v-bind="wrapperProps" class="select-options">
          <li
            v-for="item in list"
            :key="item.data.value"
            class="select-option"
            :class="{
              'is-selected': item.data.value === modelValue,
              'is-hovered': item.data.value === hoveredValue,
            }"
            @click="handleSelect(item.data, close)"
            @pointerenter="handleMouseEnterOption(item.data, $event)"
            @pointerleave="handleMouseLeaveOption"
            :style="{ height: `${itemHeight}px` }"
          >
            <div class="option-content">
              <!-- Thumbnail preview -->
              <div v-if="item.data.thumbnail" class="thumbnail-wrapper">
                <img :src="item.data.thumbnail" class="thumbnail-img" draggable="false" />
                <img v-if="item.data.appIcon" :src="item.data.appIcon" class="app-icon" draggable="false" />
              </div>

              <!-- Color preview -->
              <div v-else-if="item.data.color" class="color-badge" :style="{ backgroundColor: item.data.color }"></div>

              <!-- Skeleton loader -->
              <div v-else-if="item.data.loading" class="thumbnail-wrapper">
                <Skeleton variant="linear" width="100%" height="100%" />
              </div>

              <span class="option-label">{{ item.data.label }}</span>
            </div>

            <template v-if="previewOnHover && item.data.value === hoveredValue">
              <Eye class="option-check option-eye" />
            </template>
            <template v-else-if="item.data.value === modelValue">
              <Check class="option-check" />
            </template>
          </li>
        </ul>
      </div>
    </template>
  </Popover>
</template>

<style scoped>
.select-popover {
  width: 100%;
}

.select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 80px;
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

/* Sizes */
.select-trigger.select-sm {
  height: 2.125rem;
  padding: 0.25rem 0.625rem;
  font-size: 0.8125rem;
}

.select-trigger.select-md {
  height: 2.5rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.9rem;
}

.select-trigger.select-lg {
  height: 2.75rem;
  padding: 0.4rem 0.8rem;
  font-size: 1rem;
}

.select-trigger.is-source {
  height: 2.75rem;
}

.select-trigger:hover:not(.is-disabled) {
  border-color: var(--color-border-strong);
}

.select-trigger.is-open {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.select-trigger.is-disabled {
  background-color: var(--color-bg-surface);
  color: var(--text-muted);
  cursor: not-allowed;
}

.trigger-content-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}

.selected-thumbnail-wrapper {
  position: relative;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}

.trigger-thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 1px;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}

.trigger-app-icon {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 8px;
  height: 8px;
  padding: 1px;
  border-radius: 3px;
  background: var(--color-bg-element);
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}

.select-trigger.is-source .selected-thumbnail-wrapper {
  width: 38px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-surface-hover);
}

.select-trigger.is-source .trigger-thumbnail-img {
  object-fit: cover;
  padding: 0;
}

.selected-color-badge {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid var(--color-border-strong);
  flex-shrink: 0;
}

.select-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-label.is-placeholder {
  color: var(--text-muted);
}

.select-chevron {
  color: var(--text-secondary);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.select-trigger.select-sm .select-chevron {
  width: 0.95rem;
  height: 0.95rem;
}

.select-trigger.select-md .select-chevron {
  width: 1rem;
  height: 1rem;
}

.select-trigger.select-lg .select-chevron {
  width: 1.1rem;
  height: 1.1rem;
}

.select-chevron.rotate {
  transform: rotate(180deg);
}

.virtual-scroll-container {
  max-height: 200px;
  overflow-y: auto;
  width: 100%;
  overflow-x: hidden;
}

.select-options {
  list-style: none;
  padding: 0 4px;
  margin: 0;
}

.select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s ease;
  position: relative;
}

.select-option:hover {
  background-color: var(--color-bg-surface-hover);
  color: var(--text-primary);
}

.select-option.is-selected {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 600;
}

.option-content {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}

.thumbnail-wrapper {
  position: relative;
  width: 28px;
  height: 28px;
  background: #0f172a;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 2px;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}

.app-icon {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 12px;
  height: 12px;
  padding: 1px;
  border-radius: 3px;
  background: var(--color-bg-element);
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}

.virtual-scroll-container.is-source .thumbnail-wrapper {
  width: 60px;
  height: 38px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-surface-hover);
}

.virtual-scroll-container.is-source .thumbnail-img {
  object-fit: cover;
  padding: 0;
}

.color-badge {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--color-border-strong);
  flex-shrink: 0;
}

.option-label {
  font-size: 0.85rem;
  flex: 1;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
  min-width: 0;
}

.select-option.has-right-overflow::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 24px;
  pointer-events: none;
  background: linear-gradient(to right, transparent, var(--color-bg-element));
  box-shadow: inset -10px 0 12px -11px var(--marquee-fade-shadow);
}

.select-option.has-left-overflow::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 24px;
  pointer-events: none;
  z-index: 1;
  background: linear-gradient(to right, var(--color-bg-surface-hover), transparent);
  box-shadow: inset 10px 0 12px -11px var(--marquee-fade-shadow);
}

.select-option:hover::after {
  background: linear-gradient(to right, transparent, var(--color-bg-surface-hover));
}

.option-check {
  width: 1rem;
  height: 1rem;
  color: var(--color-primary);
  flex-shrink: 0;
}

.option-eye {
  color: var(--text-primary);
}

.options-empty {
  padding: 16px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-muted);
}
</style>
