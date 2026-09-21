<script setup lang="ts">
import EditorHistoryControls from '../EditorHistoryControls.vue';
import PropertiesDeleteAction from '../properties/PropertiesDeleteAction.vue';
import ElementsPanel from '../elements/ElementsPanel.vue';
import { computed, ref } from 'vue';
import {
  ArrowLeft,
  Copy,
  Crop,
  Image,
  Layers,
  Maximize2,
  Monitor,
  MousePointer2,
  RotateCcw,
  SlidersHorizontal,
} from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import type { ClipAppearance } from '~/media/shared/composition-types';
import SidebarPanel from '../sidebar/SidebarPanel.vue';
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
import ScreenshotSizeControls from './ScreenshotSizeControls.vue';
import { useScreenshotEditor } from './useScreenshotEditor';
import ScreenshotCursorControls from './ScreenshotCursorControls.vue';
import ScreenshotComposition from './composition/ScreenshotComposition.vue';
import {
  screenshotLayers,
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
const { t } = useTranslate('ScreenshotEditor');
const { t: topbarText } = useTranslate('Topbar');
const { t: elementsText } = useTranslate('Elements');
const { t: sidebarText } = useTranslate('SidebarPanel');
const { t: fullscreenText } = useTranslate('TimelineToolbar');
const { t: backText } = useTranslate('TopbarHUD');
const previewStage = ref<HTMLElement | null>(null);
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
const tabs = computed(() => [
  { id: 'canvas', label: t('canvas'), icon: Monitor },
  { id: 'image', label: t('image'), icon: Image },
  { id: 'shapes', label: elementsText('title'), icon: Layers },
]);
const panelTitle = computed(() =>
  panel.value === 'cursor'
    ? elementsText('cursor')
    : (tabs.value.find((tab) => tab.id === panel.value)?.label ?? sidebarText('settings')),
);
const composition = computed(() => (state.value ? screenshotLayers(state.value) : []));
</script>

<template>
  <main class="screenshot-editor">
    <EditorAmbientBackground :background="state?.canvas.showBackground ? state.background : null" />
    <header class="screenshot-topbar">
      <Button variant="ghost" size="sm" :icon="ArrowLeft" :disabled="busy" @click="back">{{
        topbarText('exitToHUD')
      }}</Button>
      <VideoProjectEdition
        v-if="document"
        :project="{ ...document, mode: 'screenshot' }"
        :disabled="busy"
        @open-project="openProject"
        @rename-project="renameProject"
        @delete-project="deleteProject"
      />
      <EditorHistoryControls
        :can-undo="history.canUndo.value"
        :can-redo="history.canRedo.value"
        @undo="history.undo().catch(fail)"
        @redo="history.redo().catch(fail)"
      />
      <span class="titlebar-space" />
      <EditorPresetControls
        kind="screenshot"
        :document="presets"
        :dirty="dirty"
        @select="presetAction('select', String($event))"
        @add="presetAction('add', $event)"
        @rename="presetAction('rename', $event)"
        @delete="presetAction('delete')"
        @save="savePreset().catch(fail)"
      />
      <Button variant="secondary" size="sm" :icon="Copy" :disabled="!state || busy" @click="exportImage(true)">{{
        t(copied ? 'copied' : 'copy')
      }}</Button>
      <ScreenshotExportPopover
        v-if="state && document"
        :state="state"
        :original="document"
        :busy="busy"
        v-model:advanced="advanced"
        v-model:keep-aspect="keepAspect"
        @export="exportImage(false)"
      />
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div v-if="state && document" class="editor-body">
      <SidebarPanel :active-tab="panel === 'cursor' ? 'shapes' : panel" :items="tabs" @select-tab="selectPanel" />
      <ScreenshotPropertiesPanel :title="panelTitle">
        <template v-if="selectedLayer" #footer>
          <PropertiesDeleteAction
            :name="selectedLayer.name || elementsText(selectedLayer.kind)"
            :disabled="busy || selectedLayer.locked"
            @delete="removeLayer(selectedLayer.id)"
          />
        </template>
        <template #actions>
          <div v-if="image && (panel === 'image' || panel === 'shapes')" class="crop-actions">
            <Button
              :variant="cropping ? 'secondary' : 'ghost'"
              size="xs"
              :icon="Crop"
              :aria-pressed="cropping"
              :disabled="selectedLayer?.locked"
              @click="cropping = !cropping"
              >{{ t('crop') }}</Button
            >
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
          <ElementsPanel v-if="panel === 'shapes' || panel === 'cursor'" :disabled="busy || cropping">
            <template #tools
              ><Button
                block
                size="sm"
                variant="secondary"
                :icon="MousePointer2"
                :disabled="busy || cropping"
                @click="cursors.add(elementsText('cursor'))"
                >{{ elementsText('cursor') }}</Button
              ></template
            >
          </ElementsPanel>
          <div v-if="panel === 'shapes' && effects.selected.value" class="effect-properties">
            <BlurPropertiesPanel
              :clip="{ ...effects.selected.value, cornerRadius: effects.selected.value.cornerRadius ?? 0 }"
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
            @update:corner-radius="appearance({ cornerRadius: $event as ClipAppearance['cornerRadius'] })"
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
          :source="document.source"
          :state="state"
          :selected-id="canvasFullscreen.isFullscreen.value ? null : selectedId"
          :selected-ids="canvasFullscreen.isFullscreen.value ? [] : selectedIds"
          :disabled="busy || canvasFullscreen.isFullscreen.value"
          :cropping="cropping && !canvasFullscreen.isFullscreen.value"
          :handles-muted="handlesMuted"
          :cursor-packs="cursors.packs.value"
          :cursor-packs-ready="cursors.ready.value"
          @select="select"
          @select-many="selectMany"
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
            <ScreenshotComposition
              v-if="!canvasFullscreen.isFullscreen.value"
              :layers="composition"
              :state="state"
              :cursor-packs="cursors.packs.value"
              :selected-id="selectedId"
              :selected-ids="selectedIds"
              :source="document.source"
              :disabled="busy || cropping"
              @select="select"
              @reorder="(id, index) => reorderScreenshotLayer(state!, id, index)"
              @update="(id, patch) => updateScreenshotLayer(state!, id, patch)"
              @visibility="(id, visible) => setScreenshotLayerVisible(state!, id, visible)"
              @remove="removeLayer"
            />
          </template>
          <template #controls>
            <Popover
              v-if="!canvasFullscreen.isFullscreen.value"
              align="center"
              direction="up"
              :match-trigger-width="false"
            >
              <template #trigger>
                <Button variant="secondary" size="sm" :icon="SlidersHorizontal" :aria-label="t('dimensions')">
                  {{ state.canvas.width }} × {{ state.canvas.height }}
                  <span class="format-badge">{{ state.format.toUpperCase() }}</span>
                </Button>
              </template>
              <div class="canvas-size-popover">
                <ScreenshotSizeControls
                  :original="document"
                  v-model:canvas="state.canvas"
                  v-model:advanced="advanced"
                  v-model:keep-aspect="keepAspect"
                />
              </div>
            </Popover>
            <Button
              v-if="!canvasFullscreen.isFullscreen.value"
              variant="ghost"
              size="sm"
              icon-only
              :icon="Maximize2"
              :disabled="busy || cropping || Boolean(elements.editing.value) || elements.drawingMode.value"
              :aria-label="fullscreenText('fullscreenPreview')"
              :tooltip="fullscreenText('fullscreenPreview')"
              @click="toggleFullscreen"
            />
          </template>
        </ScreenshotCanvas>
      </div>
    </div>
  </main>
</template>

<style scoped>
.screenshot-editor {
  position: relative;
  isolation: isolate;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  color: var(--text-primary);
}
.screenshot-editor > :not(.editor-ambient-background) {
  position: relative;
}
.screenshot-topbar {
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 144px 4px 12px;
}
.titlebar-space {
  flex: 1;
  align-self: stretch;
  -webkit-app-region: drag;
}
.editor-body {
  display: flex;
  gap: 12px;
  padding: 12px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.crop-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.effect-properties {
  padding: 12px;
}
.layer-properties {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.layer-properties:disabled {
  opacity: 0.5;
  pointer-events: none;
}
.canvas-size-popover {
  width: 320px;
  max-width: calc(100vw - 48px);
  padding: 16px;
}
.format-badge {
  color: var(--text-secondary);
  font-size: 10px;
  margin-left: 4px;
}
.error {
  color: var(--color-error);
  padding: 8px 16px;
  margin: 0;
}
</style>
<style scoped src="./screenshot-fullscreen.css"></style>
