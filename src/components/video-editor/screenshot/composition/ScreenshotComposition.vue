<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  LockKeyhole,
  Trash2,
  UnlockKeyhole,
} from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Select from '~/ui/select/Select.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { LAYER_BLEND_MODES } from '~/media/shared/layer-compositing';
import type { LayerBlendMode, LayerCompositing } from '~/media/shared/layer-compositing-types';
import type { ScreenshotLayer } from '../screenshot-layer-types';
import { useScreenshotLayerReorder } from './useScreenshotLayerReorder';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { CursorPackDescriptor } from '~/api/types/cursor-pack';
import LayerThumbnail from './thumbnails/LayerThumbnail.vue';
import { screenshotThumbnailSpecs } from './thumbnails/thumbnail-spec';
import { useLayerThumbnails } from './thumbnails/useLayerThumbnails';
const props = defineProps<{
  layers: ScreenshotLayer[];
  selectedId: string | null;
  source: string;
  disabled?: boolean;
  state?: ScreenshotState;
  cursorPacks?: CursorPackDescriptor[];
}>();
const emit = defineEmits<{
  select: [id: string];
  reorder: [id: string, frontIndex: number];
  update: [id: string, patch: Partial<Omit<LayerCompositing, 'id'>>];
  visibility: [id: string, visible: boolean];
  remove: [id: string];
}>();
const { t } = useTranslate('ScreenshotComposition');
const { t: blendText } = useTranslate('BlendModes');
const { t: elementsText } = useTranslate('Elements');
const compact = useMediaQuery('(max-width: 1180px)');
const collapsed = ref(compact.value);
watch(compact, (value) => {
  if (value) collapsed.value = true;
});
const list = ref<HTMLElement | null>(null);
const thumbnails = useLayerThumbnails(
  () => (props.state ? screenshotThumbnailSpecs(props.state, props.source, props.cursorPacks ?? []) : []),
  () => !collapsed.value,
);
const front = computed(() => [...props.layers].reverse());
const { preview, dragging, begin } = useScreenshotLayerReorder(
  list,
  () => front.value.map((layer) => layer.id),
  (id, index) => emit('reorder', id, index),
);
const ordered = computed(
  () => preview.value?.flatMap((id) => front.value.filter((layer) => layer.id === id)) ?? front.value,
);
const selected = computed(() => props.layers.find((layer) => layer.id === props.selectedId));

const label = (layer: ScreenshotLayer) =>
  layer.name ||
  (['shape', 'arrow', 'text', 'drawing', 'cursor'].includes(layer.kind) ? elementsText(layer.kind) : t(layer.kind));
const blendOptions = computed(() => LAYER_BLEND_MODES.map((value) => ({ value, label: blendText(value) })));
const removable = computed(
  () =>
    selected.value && (selected.value.removable || !['image', 'background', 'watermark'].includes(selected.value.kind)),
);
const keyboard = (event: KeyboardEvent, id: string) => {
  if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || props.disabled) return;
  event.preventDefault();
  emit(
    'reorder',
    id,
    Math.max(
      0,
      Math.min(
        front.value.length - 1,
        front.value.findIndex((layer) => layer.id === id) + (event.key === 'ArrowUp' ? -1 : 1),
      ),
    ),
  );
};
</script>
<template>
  <aside class="screenshot-composition" :class="{ collapsed }" :aria-label="t('title')">
    <header>
      <Layers :size="16" /><strong>{{ t('title') }}</strong
      ><span class="layer-count">{{ layers.length }}</span>
      <Button
        variant="ghost"
        size="xs"
        icon-only
        :icon="collapsed ? ChevronDown : ChevronUp"
        :aria-label="t(collapsed ? 'expand' : 'collapse')"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      />
    </header>
    <template v-if="!collapsed">
      <fieldset class="compositing-controls" :disabled="disabled || !selected || selected.locked">
        <Select
          size="sm"
          :aria-label="t('blendMode')"
          :model-value="selected?.blendMode ?? 'source-over'"
          :options="blendOptions"
          :disabled="disabled || !selected || selected.locked"
          @update:model-value="selected && emit('update', selected.id, { blendMode: $event as LayerBlendMode })"
        />
        <BigSlider
          :model-value="selected?.opacity ?? 100"
          :label="t('opacity')"
          :min="0"
          :max="100"
          :step="1"
          :default-value="100"
          :format-value="(value) => `${value}%`"
          @update:model-value="selected && emit('update', selected.id, { opacity: $event })"
        />
      </fieldset>
      <div ref="list" class="layer-list" role="list" :aria-label="t('layers')">
        <TransitionGroup tag="div" name="layer" class="layer-rows">
          <div
            v-for="layer in ordered"
            :key="layer.id"
            class="layer-row"
            :class="{ selected: selectedId === layer.id, hidden: !layer.visible, dragging: dragging === layer.id }"
            :data-layer-id="layer.id"
            role="listitem"
            @keydown="keyboard($event, layer.id)"
          >
            <button
              class="layer-grip"
              :disabled="disabled"
              :aria-label="t('reorder', { name: label(layer) })"
              :title="t('reorderHint')"
              @pointerdown="begin($event, layer.id)"
            >
              <GripVertical :size="12" />
            </button>
            <button
              class="layer-select"
              :disabled="disabled"
              :aria-pressed="selectedId === layer.id"
              @click="emit('select', layer.id)"
            >
              <LayerThumbnail :value="thumbnails[layer.id]" />
              <span class="layer-name" :title="label(layer)">{{ label(layer) }}</span>
            </button>
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="layer.locked ? LockKeyhole : UnlockKeyhole"
              :disabled="disabled"
              :aria-label="t(layer.locked ? 'unlock' : 'lock', { name: label(layer) })"
              @click="emit('update', layer.id, { locked: !layer.locked })"
            />
            <Button
              variant="ghost"
              size="xs"
              icon-only
              :icon="layer.visible ? Eye : EyeOff"
              :disabled="disabled"
              :aria-label="t(layer.visible ? 'hide' : 'show', { name: label(layer) })"
              @click="emit('visibility', layer.id, !layer.visible)"
            />
          </div>
        </TransitionGroup>
      </div>
      <footer>
        <span>{{ t('reorderHint') }}</span>
        <Button
          variant="ghost"
          size="xs"
          icon-only
          :icon="Trash2"
          :disabled="disabled || !removable || selected?.locked"
          :aria-label="t('delete')"
          @click="selected && emit('remove', selected.id)"
        />
      </footer>
    </template>
  </aside>
</template>
<style scoped>
.screenshot-composition {
  position: absolute;
  z-index: 12;
  top: 16px;
  right: 16px;
  width: 264px;
  max-width: calc(100% - 32px);
  max-height: calc(100% - 100px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-bg-surface) 94%, transparent);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(16px);
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
}
header strong {
  flex: 1;
  font-size: 12px;
}
.layer-count {
  color: var(--text-tertiary);
  font-size: 11px;
}
.compositing-controls {
  border: 0;
  border-top: 1px solid var(--color-border);
  margin: 0;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.compositing-controls:disabled {
  opacity: 0.45;
  pointer-events: none;
}
.layer-list {
  overflow-y: auto;
  min-height: 0;
  padding: 4px;
}
.layer-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.layer-row {
  display: flex;
  align-items: center;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  box-sizing: border-box;
  padding-right: 2px;
}
.layer-row.selected {
  background: color-mix(in srgb, var(--color-primary) 14%, var(--color-bg-element));
  border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
}
.layer-row.dragging {
  box-shadow: var(--shadow-sm);
  border-color: var(--color-primary);
}
.layer-row.hidden .layer-select {
  opacity: 0.45;
}
.layer-grip,
.layer-select {
  background: transparent;
  color: var(--text-secondary);
  border: 0;
  padding: 0;
  height: 100%;
  display: flex;
  align-items: center;
}
.layer-grip {
  width: 18px;
  flex-shrink: 0;
  justify-content: center;
  cursor: grab;
  touch-action: none;
}
.layer-select {
  flex: 1;
  min-width: 0;
  gap: 8px;
  text-align: left;
  cursor: pointer;
}
.layer-grip:focus-visible,
.layer-select:focus-visible {
  outline: 1px solid var(--color-primary);
  outline-offset: -1px;
  border-radius: var(--radius-sm);
}
.layer-name {
  font-size: 11px;
  color: var(--text-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-top: 1px solid var(--color-border);
}
footer span {
  font-size: 10px;
  color: var(--text-tertiary);
  flex: 1;
}
.layer-move {
  transition: transform 160ms ease;
}
.layer-enter-active,
.layer-leave-active {
  transition: opacity 140ms ease;
}
.layer-enter-from,
.layer-leave-to {
  opacity: 0;
}
.layer-leave-active {
  position: absolute;
}
@media (prefers-reduced-motion: reduce) {
  .layer-move,
  .layer-enter-active,
  .layer-leave-active {
    transition: none;
  }
}
</style>
