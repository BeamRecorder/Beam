<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch, onBeforeUnmount, onMounted } from 'vue';
import { useVirtualList } from '@vueuse/core';
import { ArrowLeft, ChevronRight, Search, X } from '@lucide/vue';
import Dialog from '../dialog/Dialog.vue';
import Input from '../input/Input.vue';
import Button from '../button/Button.vue';
import ScrollShadow from '../scroll-shadow/ScrollShadow.vue';
import SelectionIndicator from '../transitions/SelectionIndicator.vue';
import { useCommandPalette } from './useCommandPalette';
import type { CommandPaletteItem } from './command-palette-types';

const props = defineProps<{
  open: boolean;
  items: CommandPaletteItem[];
  title: string;
  placeholder: string;
  emptyLabel: string;
  unavailableLabel: string;
  closeLabel: string;
  backLabel: string;
}>();
const emit = defineEmits<{
  close: [];
  reopen: [];
  visibleItems: [ids: string[]];
}>();
const palette = useCommandPalette(toRef(props, 'items'));
const { query, branches, results, current } = palette;
const scroll = ref<InstanceType<typeof ScrollShadow> | null>(null);
const input = ref<InstanceType<typeof Input> | null>(null);
const pending = ref(false);
const error = ref('');
let disposed = false;
const mouseNavigation = (event: MouseEvent) => {
  if (!props.open || (event.button !== 3 && event.button !== 4)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.type === 'mouseup') {
    if (event.button === 3) palette.back();
    else palette.forward();
  }
};
onMounted(() => {
  window.addEventListener('mousedown', mouseNavigation, true);
  window.addEventListener('mouseup', mouseNavigation, true);
  window.addEventListener('auxclick', mouseNavigation, true);
});
onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener('mousedown', mouseNavigation, true);
  window.removeEventListener('mouseup', mouseNavigation, true);
  window.removeEventListener('auxclick', mouseNavigation, true);
});
const rowHeight = 48;
const { list, containerProps, wrapperProps, scrollTo } = useVirtualList(results, {
  itemHeight: rowHeight,
  overscan: 3,
});
watch(
  () => scroll.value?.viewportRef,
  (element) => {
    containerProps.ref.value = element ?? null;
  },
  { flush: 'post' },
);
watch(
  () => list.value.map((row) => row.data.id).join('\u0000'),
  () =>
    emit(
      'visibleItems',
      list.value.map((row) => row.data.id),
    ),
  { immediate: true },
);
const height = computed(() => `min(${Math.min(336, Math.max(96, results.value.length * rowHeight))}px, 54vh)`);
const focusInput = () => input.value?.focus();
watch(
  () => props.open,
  async (value) => {
    if (!value) return;
    palette.reset();
    error.value = '';
    await nextTick();
    if (!disposed && props.open) focusInput();
  },
  { immediate: true },
);
watch(
  results,
  () => {
    if (containerProps.ref.value) scrollTo(0);
  },
  { flush: 'post' },
);
const select = async (item: CommandPaletteItem) => {
  if (item.disabled || pending.value) return;
  if (palette.enter(item)) {
    await nextTick();
    focusInput();
    return;
  }
  if (!item.run) return;
  pending.value = true;
  try {
    emit('close');
    await nextTick();
    await item.run();
  } catch (reason) {
    console.error('Command palette action failed', reason);
    if (!disposed) {
      emit('reopen');
      await nextTick();
      error.value = props.unavailableLabel;
    }
  } finally {
    if (!disposed) pending.value = false;
  }
};
const keydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    palette.move(event.key === 'ArrowDown' ? 1 : -1);
    const viewport = containerProps.ref.value;
    const top = current.value * rowHeight;
    if (viewport && (top < viewport.scrollTop || top + rowHeight > viewport.scrollTop + viewport.clientHeight))
      scrollTo(current.value);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    const item = results.value[current.value];
    if (item) void select(item);
  } else if (event.key === 'Backspace' && !query.value && branches.value.length) {
    event.preventDefault();
    palette.back();
  }
};
</script>
<template>
  <Dialog :is-open="open" :title="title" size="sm" presentation="command" @close="emit('close')">
    <div class="command-palette" @keydown="keydown">
      <div class="command-search">
        <Button
          v-if="branches.length"
          variant="ghost"
          size="xs"
          icon-only
          :icon="ArrowLeft"
          :aria-label="backLabel"
          @click="palette.back()"
        />
        <Search v-else :size="18" class="search-icon" aria-hidden="true" />
        <Input
          ref="input"
          appearance="neutral"
          size="sm"
          :model-value="query"
          :placeholder="branches.at(-1)?.label ?? placeholder"
          :aria-label="title"
          data-dialog-autofocus
          role="combobox"
          aria-autocomplete="list"
          aria-controls="command-results"
          :aria-expanded="open"
          :aria-activedescendant="results.length ? `command-result-${current}` : undefined"
          @update:model-value="query = String($event)"
        />
        <Button variant="ghost" size="xs" icon-only :icon="X" :aria-label="closeLabel" @click="emit('close')" />
      </div>
      <div v-if="branches.length" class="command-breadcrumb">
        {{ branches.map((item) => item.label).join(' / ') }}
      </div>
      <p v-if="error" class="command-error" role="alert">{{ error }}</p>
      <ScrollShadow
        ref="scroll"
        class="command-results"
        :style="{ height }"
        :size="18"
        hide-scrollbar
        @scroll="containerProps.onScroll"
      >
        <div
          :key="palette.path.value.join('/')"
          id="command-results"
          v-bind="wrapperProps"
          class="command-list"
          role="listbox"
          :aria-label="title"
        >
          <SelectionIndicator
            v-if="list.some((row) => row.index === current)"
            class="command-indicator"
            :style="{
              transform: `translateY(${(current - (list[0]?.index ?? 0)) * rowHeight}px)`,
            }"
          />
          <div v-for="row in list" :key="row.data.id" class="command-row">
            <Button
              :id="`command-result-${row.index}`"
              variant="ghost"
              size="sm"
              block
              content-layout="custom"
              :disabled="row.data.disabled || pending"
              role="option"
              tabindex="-1"
              :aria-selected="row.index === current"
              :aria-label="row.data.label"
              @mouseenter="current = row.index"
              @click="select(row.data)"
            >
              <span class="command-row-content">
                <span class="command-leading"
                  ><slot name="leading" :item="row.data"
                    ><component :is="row.data.icon" v-if="row.data.icon" :size="18" aria-hidden="true" /></slot
                ></span>
                <span class="command-label">{{ row.data.label }}</span>
                <span class="command-detail">{{ row.data.children ? row.data.children.length : row.data.detail }}</span>
                <span class="command-chevron"
                  ><ChevronRight v-if="row.data.children" :size="14" aria-hidden="true"
                /></span>
              </span>
            </Button>
          </div>
        </div>
        <p v-if="!results.length" class="command-empty" role="status">
          {{ emptyLabel }}
        </p>
      </ScrollShadow>
    </div>
  </Dialog>
</template>
<style scoped>
.command-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
}
.search-icon {
  flex: 0 0 auto;
  color: var(--text-muted);
}
.command-breadcrumb {
  padding: 8px 16px 0;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}
.command-results {
  margin: 8px;
  transition: height 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.command-list {
  position: relative;
  flex: 0 0 auto;
  animation: command-results-pop 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
.command-row {
  position: relative;
  display: flex;
  height: 48px;
}
.command-row-content {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto 14px;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 0 10px;
  box-sizing: border-box;
  text-align: left;
}
.command-leading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 38px;
  height: 28px;
  color: var(--text-secondary);
  overflow: hidden;
  border-radius: var(--radius-sm);
}
.command-label {
  line-height: 20px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}
.command-detail {
  line-height: 20px;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}
.command-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  line-height: 1;
  flex: 0 0 auto;
  color: var(--text-muted);
}
.command-indicator {
  position: absolute;
  inset: 0 0 auto;
  height: 48px;
  border-radius: var(--radius-md);
  background: var(--color-bg-surface-hover);
}
.command-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
.command-error {
  padding: 0 16px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}
@keyframes command-results-pop {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .command-results {
    transition: none;
  }
  .command-list {
    animation: none;
  }
}
</style>
