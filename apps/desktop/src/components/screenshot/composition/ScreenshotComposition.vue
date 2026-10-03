<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { ChevronDown, Eye, EyeOff, Layers, LockKeyhole, Trash2, UnlockKeyhole } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Badge from '~/ui/badge/Badge.vue';
import ScreenshotLayerControls from './ScreenshotLayerControls.vue';
import { ContextMenu, ContextMenuItem } from '~/ui/context-menu';
import type { ContextMenuPosition } from '~/ui/context-menu';
import { useTranslate } from '~/i18n/useTranslate';
import type { LayerCompositing } from '@beam/engine/shared/layer-compositing-types';
import type { ScreenshotLayer } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotSelectionMode } from '../screenshot-types';
import { canRemoveScreenshotLayer } from '@beam/engine/screenshot/screenshot-layers';
import { useScreenshotLayerReorder } from './useScreenshotLayerReorder';
import { useCompositionPanelPosition } from './useCompositionPanelPosition';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';
import LayerThumbnail from './thumbnails/LayerThumbnail.vue';
import ScreenshotLayerName from '../ScreenshotLayerName.vue';
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
  rename: [id: string, name: string];
}>();
const { t, locale } = useTranslate('ScreenshotComposition');
const { t: tHighlight } = useTranslate('Highlight');
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
const editingId = ref<string | null>(null);
const rename = (id: string) => {
  if (props.disabled || props.layers.find((layer) => layer.id === id)?.locked) return;
  emit('select', id);
  editingId.value = id;
};
const finishRename = async (id: string, restoreFocus: boolean) => {
  editingId.value = null;
  if (!restoreFocus) return;
  await nextTick();
  [...(list.value?.querySelectorAll<HTMLButtonElement>('.layer-select') ?? [])]
    .find((button) => button.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId === id)
    ?.focus();
};
watch(
  [collapsed, () => props.disabled, () => props.layers],
  () => {
    if (
      collapsed.value ||
      props.disabled ||
      !props.layers.some((layer) => layer.id === editingId.value && !layer.locked)
    )
      editingId.value = null;
  },
  { deep: true },
);
const thumbnails = useLayerThumbnails(
  () => (props.state ? screenshotThumbnailSpecs(props.state, props.source, props.cursorPacks ?? []) : []),
  () => !collapsed.value,
);
const front = computed(() => [...props.layers].reverse());
const { preview, dragging, begin, consumeClick } = useScreenshotLayerReorder(
  list,
  () => front.value.map((layer) => layer.id),
  (id, index) => {
    if (!props.disabled) emit('reorder', id, index);
  },
);
const ordered = computed(
  () => preview.value?.flatMap((id) => front.value.filter((layer) => layer.id === id)) ?? front.value,
);
const selected = computed(() => props.layers.find((layer) => layer.id === props.selectedId));
const selectLayer = (event: MouseEvent, id: string) => {
  if (props.disabled) return;
  if (consumeClick(event, id)) return;
  if (event.ctrlKey || event.metaKey) emit('select', id, 'toggle');
  else emit('select', id);
};

const label = (layer: ScreenshotLayer) =>
  layer.name ||
  (layer.kind === 'effect' ? tHighlight('title') : '') ||
  (['shape', 'arrow', 'text', 'drawing', 'cursor'].includes(layer.kind) ? elementsText(layer.kind) : t(layer.kind));
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
  if (event.key === 'F2') {
    event.preventDefault();
    rename(id);
    return;
  }
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
    <div class="composition-surface screenshot-chrome">
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
        <ScreenshotLayerControls
          :layer="selected"
          :disabled="disabled"
          @update="selected && emit('update', selected.id, $event)"
        />
        <div
          ref="list"
          class="layer-list"
          role="list"
          :aria-label="t('layers')"
          :inert="disabled || undefined"
          :aria-disabled="disabled"
        >
          <!-- Export disables the list once, without updating every row or remeasuring its buttons. -->
          <TransitionGroup
            v-memo="[ordered, selectedIds, dragging, editingId, thumbnails, locale]"
            tag="div"
            name="layer"
            class="layer-rows"
          >
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
                v-if="editingId !== layer.id"
                class="layer-select"
                :title="t('rename')"
                :aria-pressed="selectedIds.includes(layer.id)"
                @pointerdown="!disabled && begin($event, layer.id)"
                @click="selectLayer($event, layer.id)"
                @dblclick.stop="rename(layer.id)"
              >
                <LayerThumbnail :value="thumbnails[layer.id]" />
                <span class="layer-name" :title="label(layer)">{{ label(layer) }}</span>
              </button>
              <ScreenshotLayerName
                v-else
                inline
                :name="label(layer)"
                :disabled="layer.locked"
                @rename="!disabled && emit('rename', layer.id, $event)"
                @finish="finishRename(layer.id, $event)"
              />
              <Button
                variant="ghost"
                size="xs"
                icon-only
                :icon="layer.locked ? LockKeyhole : UnlockKeyhole"
                :aria-label="t(layer.locked ? 'unlock' : 'lock', { name: label(layer) })"
                @click="!disabled && emit('update', layer.id, { locked: !layer.locked })"
              />
              <Button
                variant="ghost"
                size="xs"
                icon-only
                :icon="layer.visible ? Eye : EyeOff"
                :aria-label="t(layer.visible ? 'hide' : 'show', { name: label(layer) })"
                @click="!disabled && emit('visibility', layer.id, !layer.visible)"
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
<style scoped src="./screenshot-composition.css"></style>
<style scoped src="../screenshot-chrome.css"></style>
