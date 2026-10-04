<script setup lang="ts">
import EditorTitlebar from '../editor/EditorTitlebar.vue';
import UndoRedoToast from '../editor/canvas/UndoRedoToast.vue';
import PropertiesDeleteAction from '../editor/properties/PropertiesDeleteAction.vue';
import { computed, ref, watch } from 'vue';
import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import { ArrowLeft, Copy, Settings2 } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import Button from '~/ui/button/Button.vue';
import ScreenshotLayerInspector from './ScreenshotLayerInspector.vue';
import EditorPresetControls from '../editor/EditorPresetControls.vue';
import VideoProjectEdition from '../editor/VideoProjectEdition.vue';
import EditorAmbientBackground from '../editor/EditorAmbientBackground.vue';
import ScreenshotCanvas from './ScreenshotCanvas.vue';
import ScreenshotPropertiesPanel from './ScreenshotPropertiesPanel.vue';
import ScreenshotExportPopover from './ScreenshotExportPopover.vue';
import ScreenshotViewControls from './ScreenshotViewControls.vue';
import ScreenshotToolbar from './ScreenshotToolbar.vue';
import EditorSearchButton from '../editor/search/EditorSearchButton.vue';
import ScreenshotSearch from './ScreenshotSearch.vue';
import ScreenshotLayerTitle from './ScreenshotLayerTitle.vue';
import ScreenshotCropReset from './ScreenshotCropReset.vue';
import EditorWorkspace from '../editor/layout/EditorWorkspace.vue';
import EditorProjectLoadingOverlay from '../editor/EditorProjectLoadingOverlay.vue';
import { useScreenshotEditor } from './useScreenshotEditor';
import ScreenshotComposition from './composition/ScreenshotComposition.vue';
import {
  screenshotLayers,
  renameScreenshotLayer,
  reorderScreenshotLayer,
  updateScreenshotLayer,
  setScreenshotLayerVisible,
} from '@beam/engine/screenshot/screenshot-layers';
import { useClipboardImagePaste } from '../editor/composables/useClipboardImagePaste';
import { useElementFullscreen } from '../editor/canvas/composables/useElementFullscreen';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ ready: [] }>();
const handlesMuted = ref(false);
const previewReady = ref(false);
const selectionBounds = ref<NormalizedTransform | null>(null);
const toolbarHeight = ref(50);
const { t } = useTranslate('ScreenshotEditor');
const { t: effectText } = useTranslate('GradientEffect');
const { t: colorEffectText } = useTranslate('ColorEffect');
const { t: topbarText } = useTranslate('Topbar');
const { t: elementsText } = useTranslate('Elements');
const { t: sidebarText } = useTranslate('SidebarPanel');
const { t: fullscreenText } = useTranslate('TimelineToolbar');
const { t: backText } = useTranslate('TopbarHUD');
const { t: preparingText } = useTranslate('EditorPreparingHud');
const previewStage = ref<HTMLElement | null>(null);
const canvasPreview = ref<InstanceType<typeof ScreenshotCanvas> | null>(null);
const viewControls = ref<InstanceType<typeof ScreenshotViewControls> | null>(null);
const canvasFullscreen = useElementFullscreen(() => previewStage.value);
const toggleFullscreen = (event?: MouseEvent) => {
  (event?.currentTarget as HTMLElement | null)?.blur();
  canvasFullscreen.toggleFullscreen();
};
const editor = useScreenshotEditor(
  () => props.id,
  () => emit('ready'),
  () => canvasFullscreen.isFullscreen.value,
  () => previewReady.value,
);
const {
  document,
  state,
  presets,
  selectedId,
  selectedIds,
  panel,
  cropping,
  advanced,
  keepAspect,
  error,
  busy,
  copied,
  dirty,
  image,
  pasteImage,
  addElement,
  canPasteLayers,
  fail,
  savePreset,
  presetAction,
  select,
  selectMany,
  groups,
  resizeSelection,
  selectPanel,
  transform,
  rotate,
  startCrop,
  translate,
  removeLayer,
  exportImage,
  back,
  openProject,
  renameProject,
  deleteProject,
  cursors,
  layerEffects,
  zooms,
  selectedLayer,
  history,
  elements,
} = editor;
useClipboardImagePaste({
  disabled: () => busy.value || cropping.value || canvasFullscreen.isFullscreen.value,
  preferInternal: canPasteLayers,
  paste: pasteImage,
  onError: fail,
});
const inspectorOpen = ref(true);
const inspectorToolbar = ref<InstanceType<typeof ScreenshotToolbar> | null>(null);
const hideInspector = () => {
  inspectorOpen.value = false;
  inspectorToolbar.value?.focusInspector();
};
const showSelection = (...args: Parameters<typeof select>) => {
  select(...args);
  inspectorOpen.value = true;
};
watch([panel, selectedId], () => {
  inspectorOpen.value = true;
});
const choosePanel = (target: 'canvas' | 'settings') => {
  inspectorOpen.value = panel.value !== target || !inspectorOpen.value;
  selectPanel(target);
};
const chooseSelection = () => {
  elements.finishText();
  elements.drawingMode.value = false;
  cropping.value = false;
  if (!selectedId.value && state.value) select(state.value.image.id);
  else selectPanel('clip');
  inspectorOpen.value = true;
};
const panelLabels = computed<Record<string, string>>(() => ({
  canvas: t('canvas'),
  settings: sidebarText('settings'),
  'layer-effect':
    layerEffects.selected.value?.kind === 'color-adjustment' ? colorEffectText('title') : effectText('title'),
}));
const panelTitle = computed(
  () =>
    panelLabels.value[panel.value] ??
    (selectedIds.value.length > 1 ? t('selectionTitle', { count: selectedIds.value.length }) : undefined) ??
    (selectedLayer.value?.name || (selectedLayer.value ? elementsText(selectedLayer.value.kind) : t('properties'))),
);
const composition = computed(() => (state.value ? screenshotLayers(state.value) : []));
const renameLayer = (id: string, name: string) => {
  if (state.value && !busy.value && !cropping.value) renameScreenshotLayer(state.value, id, name);
};
const navigateSearch = (tab: string) => {
  if (tab === 'clip' && !selectedId.value && state.value) select(state.value.image.id);
  else selectPanel(tab);
  inspectorOpen.value = true;
};
</script>
<template>
  <main class="screenshot-editor">
    <ScreenshotSearch
      v-if="state && document && !canvasFullscreen.isFullscreen.value"
      :navigate="navigateSearch"
      :disabled="busy || cropping"
      :can-crop="Boolean(image && !selectedLayer?.locked)"
      :can-fullscreen="!elements.editing.value && !elements.drawingMode.value"
      @copy="exportImage(true)"
      @export="exportImage(false)"
      @crop="image && startCrop(image.id)"
      @recenter="canvasPreview?.resetView()"
      @fullscreen="toggleFullscreen()"
      @dimensions="viewControls?.openDimensions()"
    />
    <EditorAmbientBackground :background="state?.canvas.showBackground ? state.background : null" />
    <EditorTitlebar class="screenshot-topbar screenshot-chrome">
      <template #left>
        <Button
          variant="ghost"
          size="sm"
          :icon="ArrowLeft"
          :disabled="busy"
          :aria-label="topbarText('exitToHUD')"
          style="height: 28px; padding: 0 var(--editor-back-padding, 12px); gap: var(--editor-back-gap, 8px)"
          @click="back"
        >
          <span class="back-label">{{ topbarText('exitToHUD') }}</span>
        </Button>
        <EditorPresetControls
          :document="presets"
          :dirty="dirty"
          @select="presetAction('select', String($event))"
          @add="presetAction('add', $event)"
          @rename="presetAction('rename', $event)"
          @delete="presetAction('delete')"
          @save="savePreset().catch(fail)"
        />
        <EditorSearchButton />
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="Settings2"
          :disabled="busy || cropping"
          :aria-label="sidebarText('settings')"
          :tooltip="sidebarText('settings')"
          :aria-pressed="panel === 'settings' && inspectorOpen"
          @click="choosePanel('settings')"
        />
      </template>
      <template #center>
        <VideoProjectEdition
          v-if="document"
          :project="{ ...document, mode: 'screenshot' }"
          :disabled="busy"
          @open-project="openProject"
          @rename-project="renameProject"
          @delete-project="deleteProject"
        />
      </template>
      <template #right>
        <ScreenshotViewControls
          ref="viewControls"
          v-if="state && document"
          :document="document"
          :disabled="busy"
          :can-fullscreen="!busy && !cropping && !elements.editing.value && !elements.drawingMode.value"
          :zoom-percent="canvasPreview?.zoomPercent ?? 100"
          v-model:canvas="state.canvas"
          v-model:advanced="advanced"
          v-model:keep-aspect="keepAspect"
          @reset-view="canvasPreview?.resetView()"
          @fullscreen="toggleFullscreen"
        />
        <Button
          variant="secondary"
          size="sm"
          :icon="Copy"
          :disabled="!state || busy"
          :aria-label="t(copied ? 'copied' : 'copy')"
          style="height: 28px"
          @click="exportImage(true)"
        >
          <span class="copy-label">{{ t(copied ? 'copied' : 'copy') }}</span>
        </Button>
        <ScreenshotExportPopover
          v-if="state && document"
          :state="state"
          :original="document"
          :busy="busy"
          v-model:advanced="advanced"
          v-model:keep-aspect="keepAspect"
          @export="exportImage(false)"
        />
      </template>
    </EditorTitlebar>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <EditorProjectLoadingOverlay
      v-if="!state && !error"
      kind="screenshot"
      visible
      :label="preparingText('title')"
      :show-topbar-skeleton="false"
    />
    <EditorWorkspace v-if="state && document" kind="screenshot" class="editor-body">
      <ScreenshotPropertiesPanel :open="inspectorOpen" :title="panelTitle" @close="hideInspector">
        <template
          v-if="selectedLayer && selectedIds.length < 2 && panel !== 'settings' && panel !== 'layer-effect'"
          #title
        >
          <ScreenshotLayerTitle
            :key="selectedLayer.id"
            :name="selectedLayer.name || panelTitle"
            :disabled="busy || cropping || selectedLayer.locked"
            :active="inspectorOpen"
            @rename="renameLayer(selectedLayer.id, $event)"
          />
        </template>
        <template
          v-if="selectedLayer && panel !== 'settings' && panel !== 'canvas' && panel !== 'layer-effect'"
          #footer
        >
          <PropertiesDeleteAction
            :name="selectedIds.length > 1 ? panelTitle : selectedLayer.name || elementsText(selectedLayer.kind)"
            :disabled="busy || composition.some((layer) => selectedIds.includes(layer.id) && layer.locked)"
            @delete="removeLayer(selectedLayer.id)"
          />
        </template>
        <template #actions>
          <ScreenshotCropReset
            v-if="selectedIds.length < 2 && image?.crop && (panel === 'image' || panel === 'shapes')"
            :disabled="selectedLayer?.locked"
            @reset="image!.crop = undefined"
          />
        </template>
        <ScreenshotLayerInspector :editor="editor" :bounds="selectionBounds" @handles-muted="handlesMuted = $event" />
      </ScreenshotPropertiesPanel>
      <div
        ref="previewStage"
        class="screenshot-preview-stage"
        :class="{
          'is-app-fullscreen': canvasFullscreen.isFullscreen.value,
          'is-fullscreen-exiting': canvasFullscreen.isExiting.value,
        }"
      >
        <div v-if="canvasFullscreen.isFullscreen.value" class="fullscreen-preview-back">
          <Button
            variant="frosted"
            size="sm"
            :icon="ArrowLeft"
            :tooltip="fullscreenText('exitFullscreenPreview')"
            @click="toggleFullscreen"
          >
            {{ backText('back') }}
          </Button>
        </div>
        <ScreenshotCanvas
          ref="canvasPreview"
          :class="{
            'is-preview-fullscreen': canvasFullscreen.isFullscreen.value,
            'is-preview-exiting': canvasFullscreen.isExiting.value,
          }"
          :style="{
            '--screenshot-controls-space': `${Math.max(84, toolbarHeight + 40)}px`,
          }"
          :source="document.source"
          :state="state"
          :selected-id="canvasFullscreen.isFullscreen.value ? null : selectedId"
          :selected-ids="canvasFullscreen.isFullscreen.value ? [] : selectedIds"
          :disabled="busy || canvasFullscreen.isFullscreen.value"
          :zoom-disabled="busy"
          :cropping="cropping && !canvasFullscreen.isFullscreen.value"
          :handles-muted="handlesMuted"
          :cursor-packs="cursors.packs.value"
          :cursor-packs-ready="cursors.ready.value"
          @select="showSelection"
          @select-many="
            selectMany($event);
            inspectorOpen = true;
          "
          @transform="transform"
          @rotate="rotate"
          @update-zoom="zooms.update"
          @translate="translate"
          @resize-selection="resizeSelection"
          @selection-bounds="selectionBounds = $event"
          @crop="image && (image.crop = $event)"
          @crop-done="cropping = false"
          @crop-request="startCrop"
          @error="
            error = $event;
            emit('ready');
          "
          @ready="
            previewReady = true;
            emit('ready');
          "
        >
          <template #overlay>
            <UndoRedoToast :action="history.lastAction.value" class="screenshot-history-feedback" />
            <ScreenshotComposition
              v-if="!canvasFullscreen.isFullscreen.value"
              :layers="composition"
              :state="state"
              :preview-ready="previewReady"
              :cursor-packs="cursors.packs.value"
              :selected-id="selectedId"
              :selected-ids="selectedIds"
              :source="document.source"
              :disabled="busy || cropping"
              :can-group="groups.canGroup.value"
              :can-move-to-group="groups.canMoveToGroup"
              @group="groups.group"
              @move-to-group="groups.moveToGroup"
              @select="showSelection"
              @reorder="(id, index) => reorderScreenshotLayer(state!, id, index)"
              @update="(id, patch) => updateScreenshotLayer(state!, id, patch)"
              @visibility="(id, visible) => setScreenshotLayerVisible(state!, id, visible)"
              @remove="removeLayer"
              :selected-effect-id="panel === 'layer-effect' ? layerEffects.selected.value?.id : undefined"
              @add-effect="layerEffects.add"
              @select-effect="layerEffects.select"
              @toggle-effect="layerEffects.toggle"
              @rename="renameLayer"
            />
          </template>
          <template #controls>
            <ScreenshotToolbar
              ref="inspectorToolbar"
              v-if="!canvasFullscreen.isFullscreen.value"
              :disabled="busy"
              :cropping="cropping"
              :can-crop="Boolean(image && !selectedLayer?.locked)"
              :drawing="elements.drawingMode.value"
              :editing-text="Boolean(elements.editing.value)"
              :panel="panel"
              :inspector-open="inspectorOpen"
              :can-group="groups.canGroup.value"
              :can-ungroup="groups.canUngroup.value"
              @group="groups.group"
              @ungroup="groups.ungroup"
              :can-undo="history.canUndo.value"
              :can-redo="history.canRedo.value"
              @add="addElement"
              @select="chooseSelection"
              @crop="cropping = !cropping"
              @canvas="choosePanel('canvas')"
              @undo="history.undo().catch(fail)"
              @redo="history.redo().catch(fail)"
              @toggle-inspector="inspectorOpen = !inspectorOpen"
              @resize="toolbarHeight = $event"
            />
          </template>
        </ScreenshotCanvas>
      </div>
    </EditorWorkspace>
  </main>
</template>

<style scoped src="./screenshot-editor.css"></style>
<style scoped src="../editor/layout/editor-preview-layout.css"></style>
<style scoped src="./screenshot-fullscreen.css"></style>
<style scoped src="./screenshot-chrome.css"></style>
