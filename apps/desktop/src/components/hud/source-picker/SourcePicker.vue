<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue';
import { Check, Search, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Input from '~/ui/input/Input.vue';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { SourcePickerState, SourcePickerAction } from '~/api/types/source-picker';
import { adjacentSourceId, filterSources } from './source-picker-model';
import { developmentSourceIcon } from './development-source-icons';
import SourceArtwork from './SourceArtwork.vue';

const props = withDefaults(defineProps<{ state: SourcePickerState; browserPreview?: boolean }>(), {
  browserPreview: false,
});
const emit = defineEmits<{ action: [action: SourcePickerAction] }>();
const state = toRef(props, 'state');
const query = ref('');
const sources = computed(() => filterSources(state.value.sources, state.value.kind, query.value));
const highlighted = computed(() => state.value.sources.find((source) => source.id === state.value.highlightedId));
const send = (action: SourcePickerAction) => emit('action', action);
const confirmSource = (id: string) => {
  send({ type: 'select', id });
  send({ type: 'confirm' });
};
watch(
  () => state.value.kind,
  () => {
    query.value = '';
  },
);
const { t } = useTranslate('SourcePicker');
const { t: tHud } = useTranslate('HUD');
const grid = ref<HTMLElement | null>(null);
const search = ref<InstanceType<typeof Input> | null>(null);
const scroll = ref<InstanceType<typeof ScrollShadow> | null>(null);
let previewExit: ReturnType<typeof setTimeout> | undefined;
const clearPreview = () => {
  clearTimeout(previewExit);
  send({ type: 'hover', id: null });
};
const hoverSource = (id: string) => {
  clearTimeout(previewExit);
  send({ type: 'hover', id });
};
// Crossing a gap between cards must not unmap/remap the native preview window.
const leaveSource = () => {
  clearTimeout(previewExit);
  previewExit = setTimeout(clearPreview, 80);
};
watch(query, () => {
  if (highlighted.value && !sources.value.includes(highlighted.value)) clearPreview();
});
onMounted(() => {
  search.value?.focus();
  window.addEventListener('blur', clearPreview);
});
onBeforeUnmount(() => {
  clearTimeout(previewExit);
  window.removeEventListener('blur', clearPreview);
});
const cancel = () => send({ type: 'cancel' });
const scrollSources = (event: WheelEvent) => {
  const viewport = scroll.value?.viewportRef;
  if (
    event.ctrlKey ||
    Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
    !viewport ||
    viewport.scrollWidth <= viewport.clientWidth
  )
    return;
  event.preventDefault();
  viewport.scrollLeft += event.deltaY;
  scroll.value?.updateShadows();
};
const navigate = async (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
    return;
  }
  if (event.key === 'Tab') {
    const controls = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'),
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
    return;
  }
  if (!(event.target instanceof HTMLElement)) return;
  if (event.target.matches('input') && event.key !== 'ArrowDown') return;
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const id =
    event.key === 'Home'
      ? sources.value[0]?.id
      : event.key === 'End'
        ? sources.value.at(-1)?.id
        : adjacentSourceId(
            sources.value,
            state.value.highlightedId,
            { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[event.key]!,
          );
  if (!id) return;
  hoverSource(id);
  await nextTick();
  const card = Array.from(grid.value?.querySelectorAll<HTMLElement>('[data-source-id]') || []).find(
    (item) => item.dataset.sourceId === id,
  );
  card?.focus();
  card?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
};
</script>

<template>
  <main
    class="picker-surface"
    :class="{ 'browser-preview': browserPreview }"
    @keydown="navigate"
    @mouseleave="clearPreview"
  >
    <section
      class="picker-panel"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      :aria-label="tHud('chooseCaptureSource')"
    >
      <header class="picker-header">
        <h1>
          {{ tHud(state.kind === 'screen' ? 'selectScreen' : 'selectWindow') }}
        </h1>
        <div class="search-field">
          <Input ref="search" v-model="query" size="sm" :placeholder="t('search')" :aria-label="t('search')">
            <template #prefix><Search :size="14" /></template>
          </Input>
        </div>
        <div class="picker-close">
          <Button variant="ghost" size="xs" icon-only :icon="X" :aria-label="t('close')" @click="cancel" />
        </div>
      </header>
      <div class="picker-body">
        <ScrollShadow
          ref="scroll"
          class="source-scroll"
          orientation="horizontal"
          hide-scrollbar
          :size="16"
          @wheel="scrollSources"
        >
          <div
            ref="grid"
            class="source-grid"
            :class="{ screens: state.kind === 'screen' }"
            :aria-label="tHud('chooseCaptureSource')"
          >
            <div v-for="source in sources" :key="source.id" class="source-slot">
              <Button
                variant="card"
                block
                class="source-card"
                :class="{ 'is-selected': source.id === state.selectedId }"
                style="height: 104px; padding: 5px; transform: none"
                :data-source-id="source.id"
                :aria-label="`${source.app} — ${source.name}`"
                :aria-pressed="source.id === state.selectedId"
                @mouseenter="hoverSource(source.id)"
                @mouseleave="leaveSource"
                @focus="hoverSource(source.id)"
                @blur="leaveSource"
                @click="confirmSource(source.id)"
                @dblclick="confirmSource(source.id)"
                @keydown.enter.prevent.stop="confirmSource(source.id)"
              >
                <span class="source-thumbnail"
                  ><span
                    class="source-art"
                    :style="{
                      aspectRatio: source.aspect,
                      width: `min(100%, ${64 * source.aspect}px)`,
                    }"
                    ><SourceArtwork :source="source" /></span
                  ><span v-if="source.id === state.selectedId" class="selected-check"><Check :size="12" /></span
                ></span>
                <span class="source-label"
                  ><img v-if="source.appIcon" class="app-icon" :src="source.appIcon" alt="" /><component
                    v-else
                    :is="developmentSourceIcon(source.artwork)"
                    :size="14"
                  /><span
                    ><strong>{{ source.name }}</strong
                    ><small>{{ source.kind === 'screen' ? source.detail : source.app }}</small></span
                  ></span
                >
              </Button>
            </div>
            <p v-if="!sources.length" class="empty-state" role="status">
              {{ t('noResults') }}
            </p>
          </div>
        </ScrollShadow>
      </div>
      <p v-if="state.error" class="picker-error" role="status">
        {{ state.error }}
      </p>
    </section>
  </main>
</template>

<style scoped src="./source-picker.css"></style>
