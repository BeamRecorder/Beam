<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { ChevronDown, Eye, EyeOff, Layers, LockKeyhole, Trash2, UnlockKeyhole } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Badge from '~/ui/badge/Badge.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Select from '~/ui/select/Select.vue';
import { ContextMenu, ContextMenuItem } from '~/ui/context-menu';
import type { ContextMenuPosition } from '~/ui/context-menu';
import { useTranslate } from '~/i18n/useTranslate';
import { LAYER_BLEND_MODES } from '~/media/shared/layer-compositing';
import type { LayerBlendMode, LayerCompositing } from '~/media/shared/layer-compositing-types';
import type { ScreenshotLayer } from '../screenshot-layer-types';
import type { ScreenshotSelectionMode } from '../screenshot-types';
import { canRemoveScreenshotLayer } from '../screenshot-layers';
import { useScreenshotLayerReorder } from './useScreenshotLayerReorder';
import { useCompositionPanelPosition } from './useCompositionPanelPosition';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { CursorPackDescriptor } from '~/api/types/cursor-pack';
import LayerThumbnail from './thumbnails/LayerThumbnail.vue';
import { screenshotThumbnailSpecs } from './thumbnails/thumbnail-spec';
import { useLayerThumbnails } from './thumbnails/useLayerThumbnails';
const props = defineProps<{
  layers: ScreenshotLayer[];
  selectedId: string | null;
  selectedIds: string[];
  source: string;
  disabled?: boolean;
  state?: ScreenshotState;
  cursorPacks?: CursorPackDescriptor[];
}>();
const emit = defineEmits<{
  select: [id: string, mode?: ScreenshotSelectionMode];
  reorder: [id: string, frontIndex: number];
  update: [id: string, patch: Partial<Omit<LayerCompositing, 'id'>>];
  visibility: [id: string, visible: boolean];
  remove: [id: string];
}>();
const { t } = useTranslate('ScreenshotComposition');
const { t: tHighlight } = useTranslate('Highlight');
const { t: blendText } = useTranslate('BlendModes');
const { t: elementsText } = useTranslate('Elements');
const compact = useMediaQuery('(max-width: 1180px)');
const collapsed = ref(compact.value);
const panel = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const {
  upward,
  dragging: movingPanel,
  ready,
  begin: movePanel,
  click: togglePanel,
} = useCompositionPanelPosition(
  panel,
  () => {
    collapsed.value = !collapsed.value;
  },
  content,
  collapsed,
);
watch(compact, (value) => {
  if (value) collapsed.value = true;
});
const list = ref<HTMLElement | null>(null);
const thumbnails = useLayerThumbnails(
  () => (props.state ? screenshotThumbnailSpecs(props.state, props.source, props.cursorPacks ?? []) : []),
  () => !collapsed.value,
);
const front = computed(() => [...props.layers].reverse());
const { preview, dragging, begin, consumeClick } = useScreenshotLayerReorder(
  list,
  () => front.value.map((layer) => layer.id),
  (id, index) => emit('reorder', id, index),
);
const ordered = computed(
  () => preview.value?.flatMap((id) => front.value.filter((layer) => layer.id === id)) ?? front.value,
);
const selected = computed(() => props.layers.find((layer) => layer.id === props.selectedId));
const selectLayer = (event: MouseEvent, id: string) => {
  if (consumeClick(event, id)) return;
  if (event.ctrlKey || event.metaKey) emit('select', id, 'toggle');
  else emit('select', id);
};

const label = (layer: ScreenshotLayer) =>
  layer.name ||
  (layer.kind === 'effect' ? tHighlight('title') : '') ||
  (['shape', 'arrow', 'text', 'drawing', 'cursor'].includes(layer.kind) ? elementsText(layer.kind) : t(layer.kind));
const blendOptions = computed(() => LAYER_BLEND_MODES.map((value) => ({ value, label: blendText(value) })));
const menuId = ref<string | null>(null);
const menuPosition = ref<ContextMenuPosition>({ x: 0, y: 0 });
const menuDelete = ref<InstanceType<typeof ContextMenuItem> | null>(null);
const menuLayer = computed(() => props.layers.find((layer) => layer.id === menuId.value));
let menuTrigger: HTMLElement | null = null;
const canRemove = computed(
  () =>
    !props.disabled &&
    menuLayer.value &&
    props.layers.some(
      (layer) =>
        (props.selectedIds.includes(menuLayer.value!.id)
          ? props.selectedIds.includes(layer.id)
          : layer.id === menuLayer.value!.id) && canRemoveScreenshotLayer(layer),
    ),
);
const closeMenu = () => {
  menuId.value = null;
};
const openMenu = async (event: MouseEvent | KeyboardEvent, id: string) => {
  event.preventDefault();
  event.stopPropagation();
  if (props.disabled || !(event.currentTarget instanceof HTMLElement)) return;
  const row = event.currentTarget;
  menuTrigger = row.querySelector<HTMLElement>('.layer-select');
  const rect = row.getBoundingClientRect();
  menuPosition.value =
    event instanceof MouseEvent && (event.clientX || event.clientY)
      ? { x: event.clientX, y: event.clientY }
      : { x: rect.left + 16, y: rect.bottom };
  menuId.value = id;
  if (!props.selectedIds.includes(id)) emit('select', id);
  await nextTick();
  const action = menuDelete.value?.$el as HTMLButtonElement | undefined;
  (action?.disabled ? action.closest<HTMLElement>('[role="menu"]') : action)?.focus();
};
const removeFromMenu = () => {
  if (canRemove.value && menuLayer.value) emit('remove', menuLayer.value.id);
  closeMenu();
};
watch([collapsed, movingPanel, () => props.disabled, menuLayer], () => {
  if (collapsed.value || movingPanel.value || props.disabled || !menuLayer.value) closeMenu();
});
watch(menuId, (id, previous) => {
  if (!id && previous && menuTrigger?.isConnected) menuTrigger.focus();
});
const keyboard = (event: KeyboardEvent, id: string) => {
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    void openMenu(event, id);
    return;
  }
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
  <aside
    ref="panel"
    class="screenshot-composition"
    :class="{
      collapsed,
      upward,
      'moving-panel': movingPanel,
      positioning: !ready,
    }"
    :aria-label="t('title')"
  >
    <div class="composition-surface">
      <header class="composition-header">
        <!-- Button forwards these styles to its native button, inside the component wrapper. -->
        <Button
          variant="card"
          block
          class="composition-toggle"
          :style="{
            height: 'var(--composition-header-height)',
            minHeight: 'var(--composition-header-height)',
            padding: '0 14px',
            border: '0',
            borderRadius: '0',
            outlineOffset: '-2px',
            background: 'transparent',
            transform: 'none',
            cursor: movingPanel ? 'grabbing' : 'grab',
            touchAction: 'none',
            '-webkit-app-region': 'no-drag',
          }"
          :aria-label="t(collapsed ? 'expand' : 'collapse')"
          :aria-expanded="!collapsed"
          @pointerdown="movePanel"
          @click="togglePanel"
        >
          <span class="composition-heading">
            <Layers :size="16" aria-hidden="true" />
            <strong>{{ t('title') }}</strong>
            <Badge class="layer-count" variant="outline">{{ layers.length }}</Badge>
            <ChevronDown
              :size="16"
              class="composition-chevron"
              :class="{ 'points-up': collapsed === upward }"
              aria-hidden="true"
            />
          </span>
        </Button>
      </header>
      <!-- Measure before the first visible frame, including when initially collapsed. -->
      <div v-if="!collapsed || !ready" ref="content" class="composition-content">
        <fieldset class="compositing-controls" :disabled="disabled || !selected || selected.locked">
          <Select
            size="sm"
            :aria-label="t('blendMode')"
            :model-value="selected?.blendMode ?? 'source-over'"
            :options="blendOptions"
            :disabled="disabled || !selected || selected.locked"
            @update:model-value="
              selected &&
              emit('update', selected.id, {
                blendMode: $event as LayerBlendMode,
              })
            "
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
              :class="{
                selected: selectedIds.includes(layer.id),
                hidden: !layer.visible,
                dragging: dragging === layer.id,
              }"
              :data-layer-id="layer.id"
              role="listitem"
              @keydown="keyboard($event, layer.id)"
              @contextmenu="openMenu($event, layer.id)"
            >
              <button
                class="layer-select"
                :disabled="disabled"
                :aria-pressed="selectedIds.includes(layer.id)"
                @pointerdown="begin($event, layer.id)"
                @click="selectLayer($event, layer.id)"
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
      </div>
    </div>
    <ContextMenu :is-open="menuId !== null" :x="menuPosition.x" :y="menuPosition.y" @close="closeMenu">
      <ContextMenuItem
        ref="menuDelete"
        :label="t('delete')"
        :icon="Trash2"
        danger
        :disabled="!canRemove"
        @click="removeFromMenu"
        @keydown.esc.stop.prevent="closeMenu"
      />
    </ContextMenu>
  </aside>
</template>
<style scoped>
.screenshot-composition {
  --composition-header-height: 56px;
  position: absolute;
  z-index: 12;
  top: 0;
  left: 0;
  width: 264px;
  max-width: calc(100% - 32px);
  height: var(--composition-header-height);
  --composition-body-height: 360px;
}
.screenshot-composition.positioning {
  visibility: hidden;
}
.screenshot-composition.moving-panel {
  will-change: transform;
}
.composition-surface {
  position: absolute;
  inset: 0 0 auto;
  display: flex;
  flex-direction: column;
  outline: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-bg-surface) 94%, transparent);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(16px);
  overflow: hidden;
}
.upward .composition-surface {
  flex-direction: column-reverse;
  transform: translateY(calc(-100% + var(--composition-header-height)));
}
.composition-header {
  flex-shrink: 0;
  height: var(--composition-header-height);
}
.composition-header:hover {
  background: var(--color-bg-surface-hover);
}
.composition-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}
.composition-heading strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
}
.composition-heading .layer-count {
  flex-shrink: 0;
  color: var(--text-primary);
  background: var(--color-bg-element);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  padding: 4px 7px;
}
.composition-chevron {
  flex-shrink: 0;
  transition: transform 160ms ease;
}
.composition-chevron.points-up {
  transform: rotate(180deg);
}
.composition-content {
  display: flex;
  flex-direction: column;
  max-height: var(--composition-body-height);
  min-height: 0;
  overflow-y: auto;
  border-top: 1px solid var(--color-border);
  box-sizing: border-box;
}
.upward .composition-content {
  border-top: 0;
  border-bottom: 1px solid var(--color-border);
}
.compositing-controls {
  border: 0;
  flex-shrink: 0;
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
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
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
.layer-select {
  background: transparent;
  color: var(--text-secondary);
  border: 0;
  padding: 0 0 0 6px;
  height: 100%;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 8px;
  text-align: left;
  cursor: grab;
  touch-action: none;
}
.layer-row.dragging .layer-select {
  cursor: grabbing;
}
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
  .composition-chevron,
  .layer-move,
  .layer-enter-active,
  .layer-leave-active {
    transition: none;
  }
}
</style>
