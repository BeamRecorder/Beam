<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
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
    optionHeight?: number;
    loading?: boolean;
    emptyLabel?: string;
    variant?: 'default' | 'source';
    size?: 'sm' | 'md' | 'lg' | 'small' | 'medium' | 'large';
  }>(),
  {
    placeholder: 'Select an option',
    disabled: false,
    direction: 'down',
    optionHeight: 38,
    loading: false,
    emptyLabel: '',
    variant: 'default',
    size: 'lg',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void;
  (e: 'preview:modelValue', value: string | number | null): void;
  (e: 'toggle', isOpen: boolean): void;
}>();

const hoveredValue = ref<string | number | null>(null);
const listbox = ref<HTMLElement | null>(null);

const normalizedOptions = computed<Option[]>(() => {
  return props.options ?? props.items ?? [];
});

const selectedOption = computed(() => {
  return normalizedOptions.value.find((opt) => opt.value === props.modelValue) || null;
});

const handleToggle = (isOpen: boolean) => {
  emit('toggle', isOpen);
  if (isOpen) {
    void nextTick(() => listbox.value?.querySelector<HTMLElement>('[aria-selected="true"], [role="option"]')?.focus());
  } else {
    emit('preview:modelValue', null);
    hoveredValue.value = null;
  }
};

const handleSelect = (option: Option, close: () => void) => {
  if (props.disabled) return;
  emit('update:modelValue', option.value);
  close();
};

const handleMouseEnterOption = (option: Option, event: PointerEvent) => {
  hoveredValue.value = option.value;
  emit('preview:modelValue', option.value);
  startMarquee(event);
};

const handleMouseLeaveOption = (event: PointerEvent) => {
  stopMarquee(event);
  hoveredValue.value = null;
  emit('preview:modelValue', null);
};

const handleMouseLeaveList = () => {
  hoveredValue.value = null;
  emit('preview:modelValue', null);
};

const itemHeight = computed(() => {
  if (props.optionHeight !== 38) return props.optionHeight;
  if (normalizedOptions.value.some((opt) => opt.thumbnail || opt.loading)) {
    return 52;
  }
  return props.optionHeight;
});

const handleOptionFocus = (option: Option) => {
  hoveredValue.value = option.value;
  emit('preview:modelValue', option.value);
};

const handleOptionKeydown = (event: KeyboardEvent, option: Option, close: () => void) => {
  const current = event.currentTarget as HTMLElement;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleSelect(option, close);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    emit('preview:modelValue', null);
    close();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const options = Array.from(current.parentElement?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const index = options.indexOf(current);
    options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
  }
};

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
        aria-haspopup="listbox"
        :aria-expanded="isOpen"
      >
        <div class="trigger-content-wrapper">
          <!-- Thumbnail preview -->
          <div v-if="selectedOption?.thumbnail" class="selected-thumbnail-wrapper">
            <img :src="selectedOption.thumbnail" class="trigger-thumbnail-img" draggable="false" />
            <img
              v-if="selectedOption.appIcon"
              :src="selectedOption.appIcon"
              class="trigger-app-icon"
              draggable="false"
            />
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
        <ul ref="listbox" v-bind="wrapperProps" class="select-options" role="listbox">
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
            role="option"
            :aria-selected="item.data.value === modelValue"
            :tabindex="item.data.value === modelValue ? 0 : -1"
            @focus="handleOptionFocus(item.data)"
            @keydown="handleOptionKeydown($event, item.data, close)"
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

              <slot name="option" :option="item.data" :previewing="item.data.value === hoveredValue">
                <span class="option-label">{{ item.data.label }}</span>
              </slot>
            </div>

            <template v-if="item.data.value === hoveredValue && item.data.value !== modelValue">
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

<style scoped src="./Select.css"></style>
