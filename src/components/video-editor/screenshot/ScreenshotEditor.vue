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
  setScreenshotLayerVisible,
  removeScreenshotLayer,
} from './screenshot-layers';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ ready: [] }>();
const handlesMuted = ref(false);
const { t } = useTranslate('ScreenshotEditor');
const { t: topbarText } = useTranslate('Topbar');
const { t: elementsText } = useTranslate('Elements');
const { t: sidebarText } = useTranslate('SidebarPanel');
const {
  document,
  state,
  presets,
  backgroundLibrary,
  selectedId,
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
  fail,
  savePreset,
  presetAction,
  select,
  selectPanel,
  transform,
  appearance,
  exportImage,
  back,
  openProject,
  renameProject,
  deleteProject,
  cursors,
  selectedLayer,
  history,
} = useScreenshotEditor(
  () => props.id,
  () => emit('ready'),
);
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
const removeLayer = (id: string) => {
  if (!state.value) return;
  removeScreenshotLayer(state.value, id);
  if (selectedId.value === id) select(null);
};
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
        <template v-if="selectedLayer && (panel === 'shapes' || panel === 'cursor' || selectedLayer.removable)" #footer>
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
            @update:selected-background="state.background = $event"
            @update:blur-percent="state.blurPercent = $event"
            @update:show-background="state.canvas.showBackground = $event"
            @update:watermark="state.canvas.watermark = $event"
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
      <ScreenshotCanvas
        :source="document.source"
        :state="state"
        :selected-id="selectedId"
        :cropping="cropping"
        :handles-muted="handlesMuted"
        :cursor-packs="cursors.packs.value"
        :cursor-packs-ready="cursors.ready.value"
        @select="select"
        @transform="transform"
        @crop="image && (image.crop = $event)"
        @crop-done="cropping = false"
        @error="
          error = $event;
          emit('ready');
        "
        @ready="emit('ready')"
      >
        <template #overlay>
          <ScreenshotComposition
            :layers="composition"
            :state="state"
            :cursor-packs="cursors.packs.value"
            :selected-id="selectedId"
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
          <Popover align="center" direction="up" :match-trigger-width="false">
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
        </template>
      </ScreenshotCanvas>
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
