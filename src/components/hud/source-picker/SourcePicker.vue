<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRef, watch } from 'vue';
import { Check, Circle, FlaskConical, Monitor, PanelsTopLeft, Search, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Input from '~/ui/input/Input.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { SourcePickerState, SourcePickerAction } from '~/api/types/source-picker';
import { adjacentSourceId, filterSources } from './source-picker-model';
import { developmentSourceIcon } from './development-source-icons';
import SourceArtwork from './SourceArtwork.vue';
import SourcePickerAura from './SourcePickerAura.vue';

const props = withDefaults(defineProps<{ state: SourcePickerState; browserPreview?: boolean }>(), {
  browserPreview: false,
});
const emit = defineEmits<{ action: [action: SourcePickerAction] }>();
const state = toRef(props, 'state');
const query = ref('');
const sources = computed(() => filterSources(state.value.sources, state.value.kind, query.value));
const highlighted = computed(() => state.value.sources.find((source) => source.id === state.value.highlightedId));
const selected = computed(() => state.value.sources.find((source) => source.id === state.value.selectedId));
const send = (action: SourcePickerAction) => emit('action', action);
watch(
  () => state.value.kind,
  () => {
    query.value = '';
  },
);
const { t } = useTranslate('SourcePicker');
const { t: tHud } = useTranslate('HUD');
const grid = ref<HTMLElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
onMounted(() => dialog.value?.focus());
const preview = computed(() => highlighted.value || selected.value);
const targetPreview = computed(() => selected.value || highlighted.value);
const cancel = () => send({ type: 'cancel' });
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
  if (!(event.target instanceof HTMLElement) || event.target.matches('input')) return;
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const columns = grid.value ? Math.max(1, getComputedStyle(grid.value).gridTemplateColumns.split(' ').length) : 4;
  const id =
    event.key === 'Home'
      ? sources.value[0]?.id
      : event.key === 'End'
        ? sources.value.at(-1)?.id
        : adjacentSourceId(
            sources.value,
            state.value.highlightedId,
            { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key]!,
          );
  if (!id) return;
  send({ type: 'hover', id });
  await nextTick();
  const card = Array.from(grid.value?.querySelectorAll<HTMLElement>('[data-source-id]') || []).find(
    (item) => item.dataset.sourceId === id,
  );
  card?.focus();
  card?.scrollIntoView?.({ block: 'nearest' });
};
</script>

<template>
  <main class="picker-surface" :class="{ 'browser-preview': browserPreview }" @keydown="navigate">
    <div v-if="browserPreview && targetPreview" class="browser-target">
      <SourceArtwork :source="targetPreview" live /><SourcePickerAura />
    </div>
    <section
      ref="dialog"
      class="picker-panel"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      :aria-label="tHud('chooseCaptureSource')"
    >
      <header class="picker-header">
        <div class="heading">
          <span class="heading-icon"
            ><component :is="state.kind === 'screen' ? Monitor : PanelsTopLeft" :size="20"
          /></span>
          <div>
            <h1>{{ tHud(state.kind === 'screen' ? 'selectScreen' : 'selectWindow') }}</h1>
            <p>{{ t('hoverHint') }}</p>
          </div>
        </div>
        <span v-if="state.development" class="development-badge"><FlaskConical :size="12" />DEV_CROSSPLATFORM</span>
        <Button variant="ghost" size="sm" icon-only :icon="X" :aria-label="t('close')" @click="cancel" />
      </header>
      <div class="picker-tools">
        <div class="kind-tabs" role="group" :aria-label="tHud('chooseCaptureSource')">
          <Button
            v-for="kind in ['screen', 'window'] as const"
            :key="kind"
            :variant="state.kind === kind ? 'secondary' : 'ghost'"
            size="sm"
            :icon="kind === 'screen' ? Monitor : PanelsTopLeft"
            :aria-pressed="state.kind === kind"
            @click="send({ type: 'kind', kind })"
            >{{ tHud(kind === 'screen' ? 'fullScreen' : 'window') }}</Button
          >
        </div>
        <div class="search-field">
          <Search :size="14" /><Input v-model="query" size="sm" :placeholder="t('search')" :aria-label="t('search')" />
        </div>
        <span class="source-count">{{ t('sourceCount', { count: sources.length }) }}</span>
      </div>
      <div class="picker-body">
        <div
          ref="grid"
          class="source-grid"
          :class="{ screens: state.kind === 'screen' }"
          :aria-label="tHud('chooseCaptureSource')"
        >
          <Button
            v-for="source in sources"
            :key="source.id"
            variant="card"
            block
            class="source-card"
            :class="{ highlighted: source.id === state.highlightedId, selected: source.id === state.selectedId }"
            :data-source-id="source.id"
            :aria-label="`${source.app} — ${source.name}`"
            :aria-pressed="source.id === state.selectedId"
            :title="`${source.name}\n${source.app} · ${source.detail}`"
            @mouseenter="send({ type: 'hover', id: source.id })"
            @focus="send({ type: 'hover', id: source.id })"
            @click="send({ type: 'select', id: source.id })"
          >
            <span class="source-thumbnail"
              ><span
                class="source-art"
                :style="{ aspectRatio: source.aspect, width: `min(100%, ${86 * source.aspect}px)` }"
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
          <p v-if="!sources.length" class="empty-state" role="status">{{ t('noResults') }}</p>
        </div>
        <aside class="preview-panel">
          <span class="preview-caption"><span class="live-dot" />{{ t('livePreview') }}</span>
          <div class="preview-art">
            <SourceArtwork v-if="preview" :source="preview" live /><component
              v-else
              :is="state.kind === 'screen' ? Monitor : PanelsTopLeft"
              :size="32"
            />
          </div>
          <strong class="preview-title">{{ preview?.name || t('previewHint') }}</strong>
          <span class="preview-detail">{{ preview ? `${preview.app} · ${preview.detail}` : t('hoverHint') }}</span>
          <p v-if="state.development" class="development-note">{{ t('developmentNotice') }}</p>
          <p v-if="state.error" class="preview-error" role="status">{{ state.error }}</p>
        </aside>
      </div>
      <footer class="picker-footer">
        <span class="keyboard-hint"><kbd>↑ ↓ ← →</kbd>{{ t('navigate') }}<kbd>Esc</kbd>{{ t('close') }}</span
        ><span v-if="selected" class="selection-summary"><Check :size="14" />{{ selected.name }}</span
        ><Button :icon="Circle" size="sm" :disabled="!selected" @click="send({ type: 'confirm' })">{{
          t('confirm')
        }}</Button>
      </footer>
    </section>
  </main>
</template>

<style scoped src="./source-picker.css"></style>
