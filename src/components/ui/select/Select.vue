<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, useId } from 'vue';
import { useVirtualList } from '@vueuse/core';
import Popover from '../popover/Popover.vue';
import Skeleton from '../skeleton/Skeleton.vue';
import Input from '../input/Input.vue';
import { ChevronDown, Check, Eye, Search } from '@lucide/vue';
import { createFuzzySearchEngine } from './fuzzy-search';
import type { SelectOption } from './select-types';

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null;
    options?: SelectOption[];
    items?: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    direction?: 'up' | 'down';
    optionHeight?: number;
    loading?: boolean;
    emptyLabel?: string;
    noResultsLabel?: string;
    searchPlaceholder?: string;
    variant?: 'default' | 'source' | 'search';
    size?: 'sm' | 'md' | 'lg' | 'small' | 'medium' | 'large';
  }>(),
  {
    placeholder: 'Select an option',
    disabled: false,
    direction: 'down',
    optionHeight: 38,
    loading: false,
    emptyLabel: '',
    noResultsLabel: '',
    searchPlaceholder: 'Search options',
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
const selectTrigger = ref<HTMLButtonElement | null>(null);
const searchInput = ref<InstanceType<typeof Input> | null>(null);
const searchQuery = ref('');
const listboxId = useId();
let restoreFocusOnClose = false;

const normalizedOptions = computed<SelectOption[]>(() => {
  return props.options ?? props.items ?? [];
});
const searchEngine = computed(() =>
  createFuzzySearchEngine(normalizedOptions.value, (option) => [option.label, ...(option.keywords ?? [])]),
);
const visibleOptions = computed(() =>
  props.variant === 'search' ? searchEngine.value.search(searchQuery.value) : normalizedOptions.value,
);

const selectedOption = computed(() => {
  return normalizedOptions.value.find((opt) => opt.value === props.modelValue) || null;
});

const handleToggle = (isOpen: boolean) => {
  emit('toggle', isOpen);
  if (isOpen) {
    void nextTick(() => {
      if (props.variant === 'search') searchInput.value?.focus();
      else listbox.value?.querySelector<HTMLElement>('[aria-selected="true"], [role="option"]')?.focus();
    });
  } else {
    emit('preview:modelValue', null);
    hoveredValue.value = null;
    searchQuery.value = '';
    scrollTo(0);
    for (const option of listbox.value?.querySelectorAll<HTMLElement>('[role="option"]') ?? []) stopMarqueeRun(option);
    if (restoreFocusOnClose) {
      restoreFocusOnClose = false;
      void nextTick(() => selectTrigger.value?.focus());
    }
  }
};

const handleSelect = (option: SelectOption, close: () => void) => {
  if (props.disabled) return;
  emit('update:modelValue', option.value);
  searchQuery.value = '';
  restoreFocusOnClose = true;
  close();
};

const handleMouseEnterOption = (option: SelectOption, event: PointerEvent) => {
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

const handleSearchInput = (value: string | number) => {
  searchQuery.value = String(value);
  scrollTo(0);
};

const handleOptionFocus = (option: SelectOption) => {
  hoveredValue.value = option.value;
  emit('preview:modelValue', option.value);
};

const handleOptionKeydown = (event: KeyboardEvent, option: SelectOption, close: () => void) => {
  const current = event.currentTarget as HTMLElement;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleSelect(option, close);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    emit('preview:modelValue', null);
    restoreFocusOnClose = true;
    close();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const currentIndex = Number(current.dataset.optionIndex);
    if (props.variant === 'search' && event.key === 'ArrowUp' && currentIndex === 0) {
      searchInput.value?.focus();
      return;
    }
    const count = visibleOptions.value.length;
    const nextIndex = (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
    scrollTo(nextIndex);
    void nextTick(() => listbox.value?.querySelector<HTMLElement>(`[data-option-index="${nextIndex}"]`)?.focus());
  }
};

const handleSearchKeydown = (event: KeyboardEvent, close: () => void) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    restoreFocusOnClose = true;
    close();
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
  const first = visibleOptions.value[0];
  if (!first) return;
  event.preventDefault();
  if (event.key === 'Enter') {
    handleSelect(first, close);
    return;
  }
  const targetIndex = event.key === 'ArrowUp' ? visibleOptions.value.length - 1 : 0;
  scrollTo(targetIndex);
  void nextTick(() => listbox.value?.querySelector<HTMLElement>(`[data-option-index="${targetIndex}"]`)?.focus());
};

const { list, containerProps, wrapperProps, scrollTo } = useVirtualList(visibleOptions, {
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

onUnmounted(() => {
  for (const option of listbox.value?.querySelectorAll<HTMLElement>('[role="option"]') ?? []) stopMarqueeRun(option);
});
</script>

<template>
  <Popover align="left" :direction="direction" :block="true" class="select-popover" @toggle="handleToggle">
    <template #trigger="{ isOpen }">
      <button
        ref="selectTrigger"
        type="button"
        class="select-trigger"
        :class="[
          `select-${normalizedSize}`,
          { 'is-open': isOpen, 'is-disabled': disabled, 'is-source': variant === 'source' },
        ]"
        :disabled="disabled"
        aria-haspopup="listbox"
        :aria-expanded="isOpen"
        :aria-controls="listboxId"
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
          <div
            v-else-if="variant !== 'search' && (loading || selectedOption?.loading)"
            class="selected-thumbnail-wrapper"
          >
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
      <div class="select-menu" :class="{ 'is-searchable': variant === 'search' }">
        <div v-if="variant === 'search'" class="select-search-row">
          <Input
            ref="searchInput"
            :model-value="searchQuery"
            :placeholder="searchPlaceholder"
            :aria-label="searchPlaceholder"
            :aria-controls="listboxId"
            aria-expanded="true"
            aria-autocomplete="list"
            autocomplete="off"
            role="combobox"
            size="sm"
            spellcheck="false"
            @update:model-value="handleSearchInput"
            @keydown.stop="handleSearchKeydown($event, close)"
          >
            <template #prefix><Search :size="14" aria-hidden="true" /></template>
          </Input>
        </div>
        <div v-if="visibleOptions.length === 0" :id="listboxId" class="options-empty" role="listbox">
          <span role="status">{{
            normalizedOptions.length === 0
              ? emptyLabel || placeholder
              : noResultsLabel || emptyLabel || 'No matching options'
          }}</span>
        </div>
        <div
          v-else
          v-bind="containerProps"
          class="virtual-scroll-container"
          :class="{ 'is-source': variant === 'source' }"
          @pointerleave="handleMouseLeaveList"
        >
          <ul :id="listboxId" ref="listbox" v-bind="wrapperProps" class="select-options" role="listbox">
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
              :id="`${listboxId}-option-${item.index}`"
              :data-option-index="item.index"
              :aria-selected="item.data.value === modelValue"
              :aria-posinset="item.index + 1"
              :aria-setsize="visibleOptions.length"
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
                <div
                  v-else-if="item.data.color"
                  class="color-badge"
                  :style="{ backgroundColor: item.data.color }"
                ></div>

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
      </div>
    </template>
  </Popover>
</template>

<style scoped src="./Select.css"></style>
