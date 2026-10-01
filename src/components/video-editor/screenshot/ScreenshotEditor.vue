<script setup lang="ts">
import EditorTitlebar from '../EditorTitlebar.vue';
import UndoRedoToast from '../canvas/UndoRedoToast.vue';
import PropertiesDeleteAction from '../properties/PropertiesDeleteAction.vue';
import ElementClipControls from '../elements/ElementClipControls.vue';
import { computed, ref, watch } from 'vue';
import { ArrowLeft, Copy, RotateCcw, Settings2 } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import Button from '~/ui/button/Button.vue';
import type { ClipAppearance } from '~/media/shared/composition-types';
import CanvasPanel from '../properties/canvas/CanvasPanel.vue';
import BlurPropertiesPanel from '../properties/clip/BlurPropertiesPanel.vue';
import ClipPropertiesPanel from '../properties/clip/ClipPropertiesPanel.vue';
import SettingsPanel from '../properties/settings/SettingsPanel.vue';
import EditorPresetControls from '../EditorPresetControls.vue';
import VideoProjectEdition from '../VideoProjectEdition.vue';
import EditorAmbientBackground from '../EditorAmbientBackground.vue';
import ScreenshotCanvas from './ScreenshotCanvas.vue';
import ScreenshotPropertiesPanel from './ScreenshotPropertiesPanel.vue';
import ScreenshotExportPopover from './ScreenshotExportPopover.vue';
import ScreenshotViewControls from './ScreenshotViewControls.vue';
import ScreenshotToolbar from './ScreenshotToolbar.vue';
import EditorSearchButton from '../search/EditorSearchButton.vue';
import ScreenshotSearch from './ScreenshotSearch.vue';
import ScreenshotLayerTitle from './ScreenshotLayerTitle.vue';
import EditorWorkspace from '../layout/EditorWorkspace.vue';
import EditorProjectLoadingOverlay from '../EditorProjectLoadingOverlay.vue';
import { useScreenshotEditor } from './useScreenshotEditor';
import ScreenshotCursorControls from './ScreenshotCursorControls.vue';
import ScreenshotComposition from './composition/ScreenshotComposition.vue';
import {
  screenshotLayers,
  renameScreenshotLayer,
  reorderScreenshotLayer,
  updateScreenshotLayer,
  updateScreenshotBackground,
  updateScreenshotBackgroundBlur,
  setScreenshotLayerVisible,
  updateScreenshotWatermark,
} from './screenshot-layers';
import { useClipboardImagePaste } from '../composables/useClipboardImagePaste';
import { useElementFullscreen } from '../canvas/composables/useElementFullscreen';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ ready: [] }>();
const handlesMuted = ref(false);
const toolbarHeight = ref(50);
const { t } = useTranslate('ScreenshotEditor');
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
const {
  document,
  state,
  presets,
  backgroundLibrary,
  selectedId,
  selectedIds,
  panel,
  cropping,
  advanced,
  keepAspect,
  error,
  busy,
  copied,
  backgrounds,
  dirty,
  selectedImage,
  image,
  pasteImage,
  addElement,
  canPasteLayers,
  fail,
  savePreset,
  presetAction,
  select,
  selectMany,
  selectPanel,
  transform,
  rotate,
  startCrop,
  translate,
  removeLayer,
  appearance,
  exportImage,
  back,
  openProject,
  renameProject,
  deleteProject,
  cursors,
  effects,
  selectedLayer,
  history,
  elements,
} = useScreenshotEditor(
  () => props.id,
  () => emit('ready'),
  () => canvasFullscreen.isFullscreen.value,
);
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
const panelTitle = computed(() =>
  panel.value === 'canvas'
    ? t('canvas')
    : panel.value === 'settings'
      ? sidebarText('settings')
      : selectedLayer.value?.name || (selectedLayer.value ? elementsText(selectedLayer.value.kind) : t('properties')),
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
        <template v-if="selectedLayer && panel !== 'settings'" #title>
          <ScreenshotLayerTitle
            :key="selectedLayer.id"
            :name="selectedLayer.name || panelTitle"
            :disabled="busy || cropping || selectedLayer.locked"
            :active="inspectorOpen"
            @rename="renameLayer(selectedLayer.id, $event)"
          />
        </template>
        <template v-if="selectedLayer && panel !== 'settings' && panel !== 'canvas'" #footer>
          <PropertiesDeleteAction
            :name="selectedLayer.name || elementsText(selectedLayer.kind)"
            :disabled="busy || selectedLayer.locked"
            @delete="removeLayer(selectedLayer.id)"
          />
        </template>
        <template #actions>
          <div v-if="image && (panel === 'image' || panel === 'shapes')" class="crop-actions">
            <Button
              v-if="image.crop"
              variant="ghost"
              size="xs"
              :icon="RotateCcw"
              icon-only
              :aria-label="t('resetCrop')"
              :tooltip="t('resetCrop')"
              :disabled="selectedLayer?.locked"
              @click="image.crop = undefined"
            />
          </div>
        </template>
        <fieldset class="layer-properties" :disabled="selectedLayer?.locked && panel !== 'settings'">
          <ElementClipControls v-if="panel === 'shapes' || panel === 'cursor'" />
          <div v-if="panel === 'shapes' && effects.selected.value" class="effect-properties">
            <BlurPropertiesPanel
              :clip="{
                ...effects.selected.value,
                cornerRadius: effects.selected.value.cornerRadius ?? 0,
              }"
              @update="effects.update"
            />
          </div>
          <ClipPropertiesPanel
            v-if="selectedImage && image && (panel === 'image' || panel === 'shapes')"
            hide-layout
            hide-crop
            :selected-clip="selectedImage"
            @update:appearance="appearance"
            @corner-radius-interaction="handlesMuted = $event"
            @update:shadow="
              appearance({
                shadowSize: $event.size,
                shadowBlur: $event.blur,
                shadowMode: $event.mode,
                shadowColor: $event.color,
                shadowDirection: $event.direction as ClipAppearance['shadowDirection'],
              })
            "
            @update:corner-radius="
              appearance({
                cornerRadius: $event as ClipAppearance['cornerRadius'],
              })
            "
            @update:is-mirrored="image.isMirrored = $event"
            @update:is-mirrored-y="image.isMirroredY = $event"
            @update:clip-transform="transform"
            @reset:clip-transform="image.transform = { x: 0.06, y: 0.06, width: 0.88, height: 0.88 }"
          />
          <CanvasPanel
            v-else-if="panel === 'canvas'"
            still
            :selected-background="state.background"
            :background-groups="backgrounds"
            :blur-percent="state.blurPercent"
            :show-background="state.canvas.showBackground"
            :watermark="state.canvas.watermark"
            @update:selected-background="updateScreenshotBackground(state, $event)"
            @update:blur-percent="updateScreenshotBackgroundBlur(state, $event)"
            @update:show-background="setScreenshotLayerVisible(state, '__background__', $event)"
            @update:watermark="updateScreenshotWatermark(state, $event)"
            @import:background="backgroundLibrary.push($event)"
          />

          <template v-if="panel === 'cursor' && cursors.selected.value">
            <ScreenshotCursorControls
              :cursor="cursors.selected.value"
              :packs="cursors.packs.value"
              @update="cursors.update"
              @imported="cursors.registerPack"
            />
          </template>
          <SettingsPanel v-else-if="panel === 'settings'" hide-recorder @back-to-hud="back" />
        </fieldset>
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
          @translate="translate"
          @crop="image && (image.crop = $event)"
          @crop-done="cropping = false"
          @crop-request="startCrop"
          @error="
            error = $event;
            emit('ready');
          "
          @ready="emit('ready')"
        >
          <template #overlay>
            <UndoRedoToast :action="history.lastAction.value" class="screenshot-history-feedback" />
            <ScreenshotComposition
              v-if="!canvasFullscreen.isFullscreen.value"
              :layers="composition"
              :state="state"
              :cursor-packs="cursors.packs.value"
              :selected-id="selectedId"
              :selected-ids="selectedIds"
              :source="document.source"
              :disabled="busy || cropping"
              @select="showSelection"
              @reorder="(id, index) => reorderScreenshotLayer(state!, id, index)"
              @update="(id, patch) => updateScreenshotLayer(state!, id, patch)"
              @visibility="(id, visible) => setScreenshotLayerVisible(state!, id, visible)"
              @remove="removeLayer"
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
<style scoped src="../layout/editor-preview-layout.css"></style>
<style scoped src="./screenshot-fullscreen.css"></style>
<style scoped src="./screenshot-chrome.css"></style>
